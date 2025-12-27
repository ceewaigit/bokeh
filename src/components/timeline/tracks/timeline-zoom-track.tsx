"use client"

import React, { useMemo } from 'react'
import { TimelineEffectBlock } from '../timeline-effect-block'
import { useTimelineLayout } from '../timeline-layout-provider'
import { useProjectStore } from '@/stores/project-store'
import { EffectStore } from '@/lib/core/effects'
import { getZoomEffects } from '@/lib/effects/effect-filters'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { ZoomEffectData, ZoomBlock, TimelineTrackType } from '@/types/project'
import { EffectLayerType } from '@/types/effects'
import { useTimelineColors } from '@/lib/timeline/colors'
import { useShallow } from 'zustand/react/shallow'
import { UpdateZoomBlockCommand } from '@/lib/commands'
import { useCommandExecutor } from '@/hooks/useCommandExecutor'

export function TimelineZoomTrack() {
    const executorRef = useCommandExecutor()
    const {
        pixelsPerMs,
        trackHeights,
        trackPositions,
        hasZoomTrack,
        setActiveTrack
    } = useTimelineLayout()

    const {
        currentProject,
        selectedEffectLayer,
        selectEffectLayer,
        clearEffectSelection
    } = useProjectStore(
        useShallow((s) => ({
            currentProject: s.currentProject,
            selectedEffectLayer: s.selectedEffectLayer,
            selectEffectLayer: s.selectEffectLayer,
            clearEffectSelection: s.clearEffectSelection
        }))
    )

    const colors = useTimelineColors()

    // Derived data
    const timelineEffects = useMemo(
        () => currentProject ? EffectStore.getAll(currentProject) : [],
        [currentProject]
    )

    const allZoomEffects = useMemo(
        () => getZoomEffects(timelineEffects),
        [timelineEffects]
    )

    const allZoomBlocksInTimelineSpace = useMemo(
        () => allZoomEffects.map(e => ({
            id: e.id,
            startTime: e.startTime,
            endTime: e.endTime,
            scale: (e.data as ZoomEffectData).scale,
            targetX: (e.data as ZoomEffectData).targetX,
            targetY: (e.data as ZoomEffectData).targetY,
            introMs: (e.data as ZoomEffectData).introMs,
            outroMs: (e.data as ZoomEffectData).outroMs,
        })),
        [allZoomEffects]
    )

    const onZoomBlockUpdate = (blockId: string, updates: Partial<ZoomBlock>) => {
        executorRef.current?.execute(UpdateZoomBlockCommand, blockId, updates)
    }

    if (!hasZoomTrack) return null

    return (
        <>
            {allZoomEffects.map((effect) => {
                const isBlockSelected = selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id === effect.id
                const zoomData = effect.data as ZoomEffectData
                const isFillZoom = zoomData.autoScale === 'fill'

                const timelineStartTime = effect.startTime
                const timelineEndTime = effect.endTime

                const calculatedWidth = TimeConverter.msToPixels(timelineEndTime - timelineStartTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                return (
                    <TimelineEffectBlock
                        key={effect.id}
                        blockId={effect.id}
                        x={TimeConverter.msToPixels(timelineStartTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                        y={trackPositions.zoom} // Use position from context
                        width={visualWidth}
                        height={trackHeights.zoom - TimelineConfig.TRACK_PADDING * 2}
                        isCompact={isCompact}
                        startTime={timelineStartTime}
                        endTime={timelineEndTime}
                        label={isFillZoom ? 'Fill' : `${zoomData.scale.toFixed(1)}×`}
                        fillColor={colors.zoomBlock}
                        scale={isFillZoom ? undefined : zoomData.scale}
                        introMs={zoomData.introMs}
                        outroMs={zoomData.outroMs}
                        isSelected={isBlockSelected}
                        isEnabled={effect.enabled}
                        allBlocks={allZoomBlocksInTimelineSpace}
                        pixelsPerMs={pixelsPerMs}
                        onHover={() => setActiveTrack(TimelineTrackType.Zoom)}
                        onSelect={() => {
                            if (isBlockSelected) {
                                clearEffectSelection()
                            } else {
                                selectEffectLayer(EffectLayerType.Zoom, effect.id)
                            }
                            requestAnimationFrame(() => {
                                // Focus container so keyboard shortcuts work immediately
                                (document.querySelector('.timeline-container') as HTMLElement)?.focus()
                            })
                        }}
                        onUpdate={(updates) => {
                            onZoomBlockUpdate(effect.id, updates)
                        }}
                    />
                )
            })}
        </>
    )
}
