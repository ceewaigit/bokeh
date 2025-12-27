"use client"

import React, { useMemo } from 'react'
import { TimelineEffectBlock } from '../timeline-effect-block'
import { useTimelineLayout } from '../timeline-layout-provider'
import { useProjectStore } from '@/stores/project-store'
import { EffectStore } from '@/lib/core/effects'
import { getScreenEffects } from '@/lib/effects/effect-filters'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { EffectLayerType } from '@/types/effects'
import { ScreenEffect, TimelineTrackType } from '@/types/project'
import { useTimelineColors } from '@/lib/timeline/colors'
import { useShallow } from 'zustand/react/shallow'

export function TimelineScreenTrack() {
    const {
        pixelsPerMs,
        trackHeights,
        trackPositions,
        hasScreenTrack,
        setActiveTrack
    } = useTimelineLayout()

    const {
        currentProject,
        selectedEffectLayer,
        selectEffectLayer,
        clearEffectSelection,
        updateEffect
    } = useProjectStore(
        useShallow((s) => ({
            currentProject: s.currentProject,
            selectedEffectLayer: s.selectedEffectLayer,
            selectEffectLayer: s.selectEffectLayer,
            clearEffectSelection: s.clearEffectSelection,
            updateEffect: s.updateEffect
        }))
    )

    const colors = useTimelineColors()

    const timelineEffects = useMemo(
        () => currentProject ? EffectStore.getAll(currentProject) : [],
        [currentProject]
    )

    const allScreenEffects = useMemo(
        () => getScreenEffects(timelineEffects),
        [timelineEffects]
    )

    const allScreenBlocksData = useMemo(
        () => allScreenEffects.map((e) => ({
            id: e.id,
            startTime: e.startTime,
            endTime: e.endTime,
        })),
        [allScreenEffects]
    )

    if (!hasScreenTrack) return null
    if (allScreenEffects.length === 0) return null

    return (
        <>
            {allScreenEffects.map((effect) => {
                const isBlockSelected =
                    selectedEffectLayer?.type === EffectLayerType.Screen && selectedEffectLayer?.id === effect.id

                const calculatedWidth = TimeConverter.msToPixels(effect.endTime - effect.startTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                const screenData = (effect as ScreenEffect).data

                return (
                    <TimelineEffectBlock
                        key={effect.id}
                        blockId={effect.id}
                        x={TimeConverter.msToPixels(effect.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                        y={trackPositions.screen}
                        width={visualWidth}
                        height={trackHeights.screen - TimelineConfig.TRACK_PADDING * 2}
                        isCompact={isCompact}
                        startTime={effect.startTime}
                        endTime={effect.endTime}
                        label={'3D'}
                        fillColor={colors.screenBlock}
                        scale={1.3}
                        introMs={screenData?.introMs ?? 400}
                        outroMs={screenData?.outroMs ?? 400}
                        isSelected={isBlockSelected}
                        isEnabled={effect.enabled}
                        allBlocks={allScreenBlocksData}
                        pixelsPerMs={pixelsPerMs}
                        onHover={() => setActiveTrack(TimelineTrackType.Screen)}
                        onSelect={() => {
                            if (isBlockSelected) {
                                clearEffectSelection()
                            } else {
                                selectEffectLayer(EffectLayerType.Screen, effect.id)
                            }
                            requestAnimationFrame(() => {
                                (document.querySelector('.timeline-container') as HTMLElement)?.focus()
                            })
                        }}
                        onUpdate={(updates) => updateEffect(effect.id, updates)}
                    />
                )
            })}
        </>
    )
}
