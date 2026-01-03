"use client"

import React, { useMemo } from 'react'
import { Group, Line, Rect, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'

import { annotationTrackConfig } from '@/features/annotation/config'
import { UpdateEffectCommand } from '@/features/commands'
import { EffectStore } from '@/features/effects/core/store'
import { useProjectStore } from '@/features/stores/project-store'
import { useWorkspaceStore } from '@/features/stores/workspace-store'
import { TimelineConfig, getClipInnerHeight } from '@/features/timeline/config'
import { TimeConverter } from '@/features/timeline/time/time-space-converter'
import { useTimelineLayout } from '@/features/timeline/components/timeline-layout-provider'
import { TimelineEffectBlock } from '@/features/timeline/components/timeline-effect-block'
import { useTimelineColors, withAlpha } from '@/features/timeline/utils/colors'
import { mergeIntervals } from '@/features/timeline/utils/interval-merge'
import { useCommandExecutor } from '@/shared/hooks/use-command-executor'
import { EffectType, EffectLayerType } from '@/types/effects'
import { TimelineTrackType } from '@/types/project'

const ROW_HEIGHT = 28

export function TimelineAnnotationTrack() {
  const executorRef = useCommandExecutor()
  const colors = useTimelineColors()

  const {
    pixelsPerMs,
    duration,
    trackPositions,
    trackHeights,
    hasAnnotationTrack,
    isAnnotationExpanded,
    toggleAnnotationExpanded,
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

  const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen)
  const toggleProperties = useWorkspaceStore((s) => s.toggleProperties)

  const annotations = useMemo(() => {
    if (!currentProject) return []
    return EffectStore.getAll(currentProject)
      .filter(e => e.type === EffectType.Annotation)
      .map(e => ({
        ...e,
        startTime: Math.max(0, e.startTime),
        endTime: Math.min(duration, e.endTime)
      }))
      .sort((a, b) => a.startTime - b.startTime)
  }, [currentProject, duration])

  const merged = useMemo(
    () => mergeIntervals(annotations.map(a => ({ startTime: a.startTime, endTime: a.endTime }))),
    [annotations]
  )

  const trackY = trackPositions.annotation ?? 0
  const trackHeight = trackHeights.annotation ?? 0

  if (!hasAnnotationTrack) return null
  if (trackHeight <= 0) return null
  if (annotations.length === 0) return null

  const toggleButtonX = TimelineConfig.TRACK_LABEL_WIDTH + 4
  const toggleButtonY = trackY + 4

  const handleToggle = (e: any) => {
    e.cancelBubble = true
    toggleAnnotationExpanded()
  }

  const Toggle = (
    <Group
      x={toggleButtonX}
      y={toggleButtonY}
      onMouseDown={handleToggle}
      onClick={handleToggle}
      onTap={handleToggle}
      onMouseEnter={() => setActiveTrack(TimelineTrackType.Annotation)}
    >
      <Rect
        width={16}
        height={16}
        fill={withAlpha(colors.annotationBlock, 0.25)}
        stroke={withAlpha(colors.annotationBlock, 0.65)}
        strokeWidth={1}
        cornerRadius={4}
      />
      <Line
        points={
          isAnnotationExpanded
            ? [5, 6, 11, 6, 8, 11] // down
            : [6, 5, 11, 8, 6, 11] // right
        }
        closed
        fill={withAlpha(colors.annotationBlock, 0.85)}
      />
    </Group>
  )

  const Label = (
    <Text
      x={toggleButtonX + 20}
      y={toggleButtonY + 1}
      text={
        isAnnotationExpanded
          ? `Overlay (${annotations.length})`
          : `Overlay (${merged.length})`
      }
      fontSize={11}
      fill={withAlpha(colors.foreground, 0.65)}
      listening={false}
    />
  )

  const mergedRowY = trackY
  const listBaseY = trackY + ROW_HEIGHT

  if (!isAnnotationExpanded) {
    const blockHeight = getClipInnerHeight(ROW_HEIGHT)

    return (
      <>
        {Toggle}
        {Label}
        {merged.map((interval) => {
          const x = TimeConverter.msToPixels(interval.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
          const width = Math.max(1, TimeConverter.msToPixels(interval.endTime - interval.startTime, pixelsPerMs))
          return (
            <Rect
              key={`${interval.startTime}-${interval.endTime}`}
              x={x}
              y={mergedRowY + TimelineConfig.TRACK_PADDING}
              width={width}
              height={blockHeight}
              fill={withAlpha(colors.annotationBlock, 0.35)}
              stroke={withAlpha(colors.annotationBlock, 0.75)}
              strokeWidth={1}
              cornerRadius={6}
              onMouseDown={handleToggle}
              onClick={handleToggle}
              onTap={handleToggle}
              onMouseEnter={() => setActiveTrack(TimelineTrackType.Annotation)}
            />
          )
        })}
      </>
    )
  }

  return (
    <Group onMouseEnter={() => setActiveTrack(TimelineTrackType.Annotation)}>
      {Toggle}
      {Label}
      {merged.map((interval) => {
        const x = TimeConverter.msToPixels(interval.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
        const width = Math.max(1, TimeConverter.msToPixels(interval.endTime - interval.startTime, pixelsPerMs))
        return (
          <Rect
            key={`${interval.startTime}-${interval.endTime}`}
            x={x}
            y={mergedRowY + TimelineConfig.TRACK_PADDING}
            width={width}
            height={getClipInnerHeight(ROW_HEIGHT)}
            fill={withAlpha(colors.annotationBlock, 0.18)}
            stroke={withAlpha(colors.annotationBlock, 0.45)}
            strokeWidth={1}
            cornerRadius={6}
            onMouseDown={handleToggle}
            onClick={handleToggle}
            onTap={handleToggle}
          />
        )
      })}
      {annotations.map((effect, index) => {
        const isBlockSelected =
          selectedEffectLayer?.type === EffectLayerType.Annotation && selectedEffectLayer?.id === effect.id

        const startTime = effect.startTime
        const endTime = effect.endTime
        const calculatedWidth = TimeConverter.msToPixels(endTime - startTime, pixelsPerMs)
        const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
        const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

        const rowY = listBaseY + (index * ROW_HEIGHT)
        const rowBlocks = [{ id: effect.id, startTime, endTime }]

        return (
          <TimelineEffectBlock
            key={effect.id}
            blockId={effect.id}
            x={TimeConverter.msToPixels(startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
            y={rowY + TimelineConfig.TRACK_PADDING}
            width={visualWidth}
            height={getClipInnerHeight(ROW_HEIGHT)}
            isCompact={isCompact}
            startTime={startTime}
            endTime={endTime}
            label={annotationTrackConfig.getBlockLabel(effect)}
            metaLabel={annotationTrackConfig.label}
            iconKey="note"
            fillColor={colors.annotationBlock}
            isSelected={isBlockSelected}
            isEnabled={effect.enabled}
            allBlocks={rowBlocks}
            pixelsPerMs={pixelsPerMs}
            onSelect={() => {
              if (isBlockSelected) {
                clearEffectSelection()
              } else {
                selectEffectLayer(EffectLayerType.Annotation, effect.id)
                if (!isPropertiesOpen) {
                  toggleProperties()
                }
              }
              requestAnimationFrame(() => {
                (document.querySelector('.timeline-container') as HTMLElement | null)?.focus()
              })
            }}
            onUpdate={(updates) => {
              executorRef.current?.execute(UpdateEffectCommand, effect.id, updates)
            }}
          />
        )
      })}
    </Group>
  )
}
