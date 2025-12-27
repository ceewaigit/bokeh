"use client"

import React, { useMemo } from 'react'
import { TimelineEffectBlock } from '../timeline-effect-block'
import { useTimelineLayout } from '../timeline-layout-provider'
import { useProjectStore } from '@/stores/project-store'
import { EffectStore } from '@/lib/core/effects'
import { getAllPluginEffects } from '@/lib/effects/effect-filters'
import { PluginRegistry } from '@/lib/effects/config/plugin-registry'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { PluginEffect, TimelineTrackType } from '@/types/project'
import { EffectLayerType } from '@/types/effects'
import { useTimelineColors } from '@/lib/timeline/colors'
import { useShallow } from 'zustand/react/shallow'

export function TimelinePluginTrack() {
    const {
        pixelsPerMs,
        trackHeights,
        trackPositions,
        hasPluginTrack,
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

    const allPluginEffects = useMemo(
        () => getAllPluginEffects(timelineEffects),
        [timelineEffects]
    )

    const allPluginBlocksData = useMemo(
        () => allPluginEffects.map((e) => {
            const startTime = Math.max(0, e.startTime)
            const endTime = Math.min(duration, e.endTime)
            return { id: e.id, startTime, endTime }
        }),
        [allPluginEffects, duration]
    )

    if (!hasPluginTrack) return null
    if (allPluginEffects.length === 0) return null

    return (
        <>
            {allPluginEffects.map((effect) => {
                const isBlockSelected =
                    selectedEffectLayer?.type === EffectLayerType.Plugin && selectedEffectLayer?.id === effect.id

                const startTime = Math.max(0, effect.startTime)
                const endTime = Math.min(duration, effect.endTime)

                const calculatedWidth = TimeConverter.msToPixels(endTime - startTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                const pluginData = (effect as PluginEffect).data
                const plugin = pluginData ? PluginRegistry.get(pluginData.pluginId) : null
                const label = plugin?.name?.slice(0, 8) || 'Plugin'

                return (
                    <TimelineEffectBlock
                        key={effect.id}
                        blockId={effect.id}
                        x={TimeConverter.msToPixels(startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                        y={trackPositions.plugin}
                        width={visualWidth}
                        height={trackHeights.plugin - TimelineConfig.TRACK_PADDING * 2}
                        isCompact={isCompact}
                        startTime={startTime}
                        endTime={endTime}
                        label={label}
                        fillColor={colors.primary}
                        isSelected={isBlockSelected}
                        isEnabled={effect.enabled}
                        allBlocks={allPluginBlocksData}
                        pixelsPerMs={pixelsPerMs}
                        onHover={() => setActiveTrack(TimelineTrackType.Plugin)}
                        onSelect={() => {
                            if (isBlockSelected) {
                                clearEffectSelection()
                            } else {
                                selectEffectLayer(EffectLayerType.Plugin, effect.id)
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
