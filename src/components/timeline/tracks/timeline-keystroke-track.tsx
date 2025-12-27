"use client"

import React, { useMemo } from 'react'
import { TimelineEffectBlock } from '../timeline-effect-block'
import { useTimelineLayout } from '../timeline-layout-provider'
import { useProjectStore } from '@/stores/project-store'
import { EffectStore } from '@/lib/core/effects'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { EffectLayerType, EffectType } from '@/types/effects'
import { TimelineTrackType } from '@/types/project'
import { useTimelineColors } from '@/lib/timeline/colors'
import { useShallow } from 'zustand/react/shallow'

export function TimelineKeystrokeTrack() {
    const {
        pixelsPerMs,
        trackHeights,
        trackPositions,
        hasKeystrokeTrack,
        duration,
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

    const allKeystrokeEffects = useMemo(
        () => timelineEffects.filter((e) => e.type === EffectType.Keystroke),
        [timelineEffects]
    )

    const allKeystrokeBlocksData = useMemo(
        () => allKeystrokeEffects.map((e) => {
            const startTime = Math.max(0, e.startTime)
            const endTime = Math.min(duration, e.endTime)
            return { id: e.id, startTime, endTime }
        }),
        [allKeystrokeEffects, duration]
    )

    if (!hasKeystrokeTrack) return null
    if (allKeystrokeEffects.length === 0) return null

    return (
        <>
            {allKeystrokeEffects.map((effect) => {
                const isBlockSelected =
                    selectedEffectLayer?.type === EffectLayerType.Keystroke && selectedEffectLayer?.id === effect.id

                const startTime = Math.max(0, effect.startTime)
                const endTime = Math.min(duration, effect.endTime)

                const calculatedWidth = TimeConverter.msToPixels(endTime - startTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                return (
                    <TimelineEffectBlock
                        key={effect.id}
                        blockId={effect.id}
                        x={TimeConverter.msToPixels(startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                        y={trackPositions.keystroke}
                        width={visualWidth}
                        height={trackHeights.keystroke - TimelineConfig.TRACK_PADDING * 2}
                        isCompact={isCompact}
                        startTime={startTime}
                        endTime={endTime}
                        label={'Keys'}
                        fillColor={colors.warning}
                        isSelected={isBlockSelected}
                        isEnabled={effect.enabled}
                        allBlocks={allKeystrokeBlocksData}
                        pixelsPerMs={pixelsPerMs}
                        onHover={() => setActiveTrack(TimelineTrackType.Keystroke)}
                        onSelect={() => {
                            if (isBlockSelected) {
                                clearEffectSelection()
                            } else {
                                selectEffectLayer(EffectLayerType.Keystroke, effect.id)
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
