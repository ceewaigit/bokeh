"use client"

/**
 * Generic Timeline Effect Track
 *
 * A single component that renders any effect type as timeline blocks.
 * Configuration is driven by the effect-track-registry.
 */

import React, { useMemo } from 'react'
import { TimelineEffectBlock } from '../timeline-effect-block'
import { useTimelineLayout } from '../timeline-layout-provider'
import { useProjectStore } from '@/stores/project-store'
import { EffectStore } from '@/lib/core/effects'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { EffectType } from '@/types/effects'
import { getEffectTrackConfig } from '@/lib/timeline/effect-track-registry'
import { useTimelineColors } from '@/lib/timeline/colors'
import { useShallow } from 'zustand/react/shallow'

interface TimelineEffectTrackProps {
  /** The effect type to render */
  effectType: EffectType
}

export function TimelineEffectTrack({ effectType }: TimelineEffectTrackProps) {
  const config = getEffectTrackConfig(effectType)

  const {
    pixelsPerMs,
    duration,
    effectTrackHeights,
    effectTrackPositions,
    effectTrackExistence,
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

  // Get all effects of this type
  const effects = useMemo(() => {
    if (!currentProject) return []
    return EffectStore.getAll(currentProject).filter(e => e.type === effectType)
  }, [currentProject, effectType])

  // Block data for snapping
  const blocksData = useMemo(
    () => effects.map(e => ({
      id: e.id,
      startTime: Math.max(0, e.startTime),
      endTime: Math.min(duration, e.endTime)
    })),
    [effects, duration]
  )

  // Don't render if no config, no track, or no effects
  if (!config) return null
  if (!effectTrackExistence[effectType]) return null
  if (effects.length === 0) return null

  const trackY = effectTrackPositions[effectType]
  const trackHeight = effectTrackHeights[effectType]

  // Get color from colors object using colorKey
  const getColor = () => {
    const key = config.colorKey
    if (key === 'zoomBlock') return colors.zoomBlock
    if (key === 'warning') return colors.warning
    if (key === 'primary') return colors.primary
    if (key === 'muted') return colors.muted
    return colors.primary
  }

  return (
    <>
      {effects.map((effect) => {
        const isBlockSelected =
          selectedEffectLayer?.type === config.layerType && selectedEffectLayer?.id === effect.id

        const startTime = Math.max(0, effect.startTime)
        const endTime = Math.min(duration, effect.endTime)

        const calculatedWidth = TimeConverter.msToPixels(endTime - startTime, pixelsPerMs)
        const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
        const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

        const label = config.getBlockLabel(effect)

        return (
          <TimelineEffectBlock
            key={effect.id}
            blockId={effect.id}
            x={TimeConverter.msToPixels(startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
            y={trackY}
            width={visualWidth}
            height={trackHeight - TimelineConfig.TRACK_PADDING * 2}
            isCompact={isCompact}
            startTime={startTime}
            endTime={endTime}
            label={label}
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

/**
 * Render all effect tracks based on registry.
 * Drop-in replacement for individual track components.
 */
export function TimelineEffectTracks() {
  const { effectTrackExistence } = useTimelineLayout()

  return (
    <>
      {Object.entries(effectTrackExistence).map(([type, exists]) =>
        exists ? <TimelineEffectTrack key={type} effectType={type as EffectType} /> : null
      )}
    </>
  )
}
