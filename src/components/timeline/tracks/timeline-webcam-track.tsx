'use client'

/**
 * TimelineWebcamTrack
 *
 * Renders webcam effects as draggable blocks on the timeline.
 * Uses TimelineEffectBlock for consistent behavior with other effect tracks.
 * Shows a drop zone placeholder when no webcam effects exist.
 */

import React, { useMemo, useState } from 'react'
import { Rect, Group, Text } from 'react-konva'
import { TimelineEffectBlock } from '../timeline-effect-block'
import { useTimelineLayout } from '../timeline-layout-provider'
import { useProjectStore } from '@/stores/project-store'
import { EffectStore } from '@/lib/core/effects'
import { getWebcamEffects } from '@/lib/effects/effect-filters'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { useTimelineColors } from '@/lib/timeline/colors'
import { useShallow } from 'zustand/react/shallow'
import { EffectLayerType } from '@/types/effects'
import { UpdateWebcamBlockCommand } from '@/lib/commands/effects/UpdateWebcamBlockCommand'
import { useCommandExecutor } from '@/hooks/useCommandExecutor'

export function TimelineWebcamTrack() {
  const executorRef = useCommandExecutor()
  const {
    pixelsPerMs,
    trackHeights,
    trackPositions,
    stageWidth
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
  const [isHovering, setIsHovering] = useState(false)

  // Get all webcam effects from the project
  const timelineEffects = useMemo(
    () => currentProject ? EffectStore.getAll(currentProject) : [],
    [currentProject]
  )

  const webcamEffects = useMemo(
    () => getWebcamEffects(timelineEffects),
    [timelineEffects]
  )

  // Create blocks data for overlap detection
  const allWebcamBlocks = useMemo(
    () => webcamEffects.map(e => ({
      id: e.id,
      startTime: e.startTime,
      endTime: e.endTime
    })),
    [webcamEffects]
  )

  const onWebcamBlockUpdate = (blockId: string, updates: { startTime: number; endTime: number }) => {
    executorRef.current?.execute(UpdateWebcamBlockCommand, blockId, updates)
  }

  const trackY = trackPositions.webcam
  const trackHeight = trackHeights.webcam
  const blockHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
  const trackWidth = stageWidth - TimelineConfig.TRACK_LABEL_WIDTH

  // Empty state - show drop zone when no webcam effects
  if (webcamEffects.length === 0) {
    return (
      <Group>
        {/* Drop zone background */}
        <Rect
          x={TimelineConfig.TRACK_LABEL_WIDTH}
          y={trackY + TimelineConfig.TRACK_PADDING}
          width={trackWidth}
          height={blockHeight}
          fill={isHovering ? colors.webcamTrack : 'transparent'}
          stroke={colors.border}
          strokeWidth={1}
          dash={[6, 4]}
          cornerRadius={8}
          opacity={isHovering ? 0.8 : 0.4}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        />

        {/* Placeholder text */}
        <Text
          x={TimelineConfig.TRACK_LABEL_WIDTH + trackWidth / 2}
          y={trackY + trackHeight / 2}
          text="Drop webcam video here"
          fontSize={10}
          fontFamily="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
          fontStyle="400"
          fill={colors.mutedForeground}
          opacity={0.5}
          align="center"
          offsetX={60}
          offsetY={5}
        />
      </Group>
    )
  }

  // Render webcam effects as draggable blocks
  return (
    <>
      {webcamEffects.map((effect) => {
        const isBlockSelected = selectedEffectLayer?.type === EffectLayerType.Webcam && selectedEffectLayer?.id === effect.id

        const calculatedWidth = TimeConverter.msToPixels(effect.endTime - effect.startTime, pixelsPerMs)
        const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
        const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

        return (
          <TimelineEffectBlock
            key={effect.id}
            blockId={effect.id}
            x={TimeConverter.msToPixels(effect.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
            y={trackY + TimelineConfig.TRACK_PADDING}
            width={visualWidth}
            height={blockHeight}
            isCompact={isCompact}
            startTime={effect.startTime}
            endTime={effect.endTime}
            label="Webcam"
            fillColor={colors.webcamClip}
            isSelected={isBlockSelected}
            isEnabled={effect.enabled}
            allBlocks={allWebcamBlocks}
            pixelsPerMs={pixelsPerMs}
            onSelect={() => {
              if (isBlockSelected) {
                clearEffectSelection()
              } else {
                selectEffectLayer(EffectLayerType.Webcam, effect.id)
              }
              requestAnimationFrame(() => {
                // Focus container so keyboard shortcuts work immediately
                (document.querySelector('.timeline-container') as HTMLElement)?.focus()
              })
            }}
            onUpdate={(updates) => {
              onWebcamBlockUpdate(effect.id, updates)
            }}
          />
        )
      })}
    </>
  )
}
