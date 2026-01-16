"use client"

/**
 * Generic Timeline Effect Track
 *
 * A single component that renders any effect type as timeline blocks.
 * Configuration is driven by the effect-track-registry.
 */

import React, { useMemo } from 'react'
import { Rect } from 'react-konva'
import { TimelineEffectBlock } from '../timeline-effect-block'
import { useTimelineLayout } from '../timeline-layout-provider'
import { useTimelineScroll } from '../timeline-layout-provider'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { useTimelineEffects } from '@/features/core/stores/selectors/timeline-selectors'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { TimelineConfig, getClipInnerHeight } from '@/features/ui/timeline/config'
import type { Effect } from '@/features/effects/types'
import { EffectType } from '@/features/effects/types'
import { EFFECT_TRACK_TYPES, getEffectTrackConfig } from '@/features/ui/timeline/effect-track-registry'
import { useTimelineColors } from '@/features/ui/timeline/utils/colors'
import { useShallow } from 'zustand/react/shallow'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { UpdateEffectCommand } from '@/features/core/commands'
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'
import { useDragToCreate } from '@/features/ui/timeline/hooks/use-drag-to-create'
import { DragToCreatePreview } from '@/features/ui/timeline/components/drag-to-create-preview'

interface TimelineEffectTrackProps {
  /** The effect type to render */
  effectType: EffectType
  effects: Effect[]
  visibleStartTime: number
  visibleEndTime: number
}

export function TimelineEffectTrack({ effectType, effects, visibleStartTime, visibleEndTime }: TimelineEffectTrackProps) {
  const config = getEffectTrackConfig(effectType)
  const executorRef = useCommandExecutor()

  const {
    pixelsPerMs,
    duration,
    timelineWidth,
    containerWidth,
    effectTrackHeights,
    effectTrackPositions,
    effectTrackExistence,
    setActiveTrack
  } = useTimelineLayout()
  const { scrollLeftRef } = useTimelineScroll()

  const {
    selectedEffectLayer,
    selectEffectLayer,
    clearEffectSelection
  } = useProjectStore(
    useShallow((s) => ({
      selectedEffectLayer: s.selectedEffectLayer,
      selectEffectLayer: s.selectEffectLayer,
      clearEffectSelection: s.clearEffectSelection
    }))
  )

  // Sidebar state for auto-open on selection
  const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen)
  const toggleProperties = useWorkspaceStore((s) => s.toggleProperties)

  const colors = useTimelineColors()

  const visibleEffects = useMemo(() => {
    if (effects.length === 0) return effects
    return effects.filter((effect) => {
      const startTime = Math.max(0, effect.startTime)
      const endTime = Math.min(duration, effect.endTime)
      return endTime > visibleStartTime && startTime < visibleEndTime
    })
  }, [effects, duration, visibleStartTime, visibleEndTime])

  // Block data for snapping
  const blocksData = useMemo(
    () => visibleEffects.map(e => ({
      id: e.id,
      startTime: Math.max(0, e.startTime),
      endTime: Math.min(duration, e.endTime)
    })),
    [visibleEffects, duration]
  )

  const dragCreate = useDragToCreate({
    effectType,
    pixelsPerMs,
    scrollLeftRef,
    duration,
    existingEffects: effects
  })

  // Don't render if no config, or track should not exist when empty
  if (!config) return null
  if (!effectTrackExistence[effectType] && !config.alwaysShowTrack) return null

  const trackY = effectTrackPositions[effectType]
  const trackHeight = effectTrackHeights[effectType]
  if (trackHeight <= 0) return null

  // Get color from colors object using colorKey
  const getColor = () => {
    const key = config.colorKey
    if (key === 'zoomBlock') return colors.zoomBlock
    if (key === 'screenBlock') return colors.screenBlock
    if (key === 'keystrokeBlock') return colors.keystrokeBlock
    if (key === 'annotationBlock') return colors.annotationBlock
    if (key === 'warning') return colors.warning
    if (key === 'primary') return colors.primary
    if (key === 'muted') return colors.muted
    return colors.primary
  }

  return (
    <>
      {config.dragToCreate?.enabled && (
        <Rect
          name="effect-track-background"
          x={TimelineConfig.TRACK_LABEL_WIDTH}
          y={trackY}
          width={Math.max(timelineWidth, containerWidth)}
          height={trackHeight}
          fill="transparent"
          listening={true}
          onPointerDown={(e) => {
            if (dragCreate.handlePointerDown(e as any)) {
              e.cancelBubble = true
            }
          }}
          onPointerMove={(e) => {
            dragCreate.handlePointerMove(e as any)
          }}
          onPointerLeave={() => {
            dragCreate.handlePointerLeave()
          }}
        />
      )}

      {visibleEffects.map((effect) => {
        const isBlockSelected =
          selectedEffectLayer?.type === config.layerType && selectedEffectLayer?.id === effect.id

        const startTime = Math.max(0, effect.startTime)
        const endTime = Math.min(duration, effect.endTime)

        const calculatedWidth = TimeConverter.msToPixels(endTime - startTime, pixelsPerMs)
        const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
        const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

        const label = config.getBlockLabel(effect)
        const metaLabel = config.label

        return (
          <TimelineEffectBlock
            key={effect.id}
            blockId={effect.id}
            x={TimeConverter.msToPixels(startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
            y={trackY}
            width={visualWidth}
            height={getClipInnerHeight(trackHeight)}
            isCompact={isCompact}
            startTime={startTime}
            endTime={endTime}
            label={label}
            metaLabel={metaLabel}
            effectType={effectType}
            fillColor={getColor()}
            isSelected={isBlockSelected}
            isEnabled={effect.enabled}
            allBlocks={blocksData}
            pixelsPerMs={pixelsPerMs}
            onHover={() => setActiveTrack(effectType)}
            onSelect={() => {
              if (isBlockSelected) {
                clearEffectSelection()
              } else {
                selectEffectLayer(config.layerType, effect.id)
                // Auto-open sidebar when selecting an effect block
                if (!isPropertiesOpen) {
                  toggleProperties()
                }
              }
              requestAnimationFrame(() => {
                (document.querySelector('.timeline-container') as HTMLElement)?.focus()
              })
            }}
            onUpdate={(updates) => {
              executorRef.current?.execute(UpdateEffectCommand, effect.id, updates)
            }}
          />
        )
      })}

      {!dragCreate.dragState && dragCreate.hoverState && (
        <DragToCreatePreview
          effectType={effectType}
          startTime={dragCreate.hoverState.startTime}
          endTime={dragCreate.hoverState.endTime}
          trackY={trackY}
          trackHeight={trackHeight}
          pixelsPerMs={pixelsPerMs}
          isValid={true}
        />
      )}

      {dragCreate.dragState && (
        <DragToCreatePreview
          effectType={effectType}
          startTime={dragCreate.dragState.startTime}
          endTime={dragCreate.dragState.endTime}
          trackY={trackY}
          trackHeight={trackHeight}
          pixelsPerMs={pixelsPerMs}
          isValid={dragCreate.dragState.isValid}
        />
      )}
    </>
  )
}

/**
 * Render all effect tracks based on registry.
 * Drop-in replacement for individual track components.
 */
interface TimelineEffectTracksProps {
  visibleStartTime: number
  visibleEndTime: number
}

export function TimelineEffectTracks({ visibleStartTime, visibleEndTime }: TimelineEffectTracksProps) {
  const { effectTrackExistence } = useTimelineLayout()
  // PERF: Use granular selector instead of full project subscription
  // This prevents re-renders when unrelated project state changes (clips, settings, etc.)
  const timelineEffects = useTimelineEffects()

  const effectsByType = useMemo(() => {
    const map = new Map<EffectType, Effect[]>()

    for (const effect of timelineEffects) {
      const existing = map.get(effect.type)
      if (existing) {
        existing.push(effect)
      } else {
        map.set(effect.type, [effect])
      }
    }

    // Filter out the keystroke style effect (it's a global config, not a timeline block)
    const keystrokes = map.get(EffectType.Keystroke)
    if (keystrokes) {
      map.set(EffectType.Keystroke, keystrokes.filter(e => e.id !== KEYSTROKE_STYLE_EFFECT_ID))
    }

    return map
  }, [timelineEffects])

  return (
    <>
      {EFFECT_TRACK_TYPES.map((type) => {
        const config = getEffectTrackConfig(type)
        const shouldRender = (config?.alwaysShowTrack ?? false) || effectTrackExistence[type]
        return shouldRender ? (
          <TimelineEffectTrack
            key={type}
            effectType={type}
            effects={effectsByType.get(type) ?? []}
            visibleStartTime={visibleStartTime}
            visibleEndTime={visibleEndTime}
          />
        ) : null
      })}
    </>
  )
}
