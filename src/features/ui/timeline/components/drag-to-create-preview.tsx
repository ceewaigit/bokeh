"use client"

import React, { useMemo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { getEffectTrackConfig } from '@/features/ui/timeline/effect-track-registry'
import { EffectType } from '@/types/project'
import { TimelineConfig, getClipInnerHeight } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { useTimelineColors, withAlpha } from '@/features/ui/timeline/utils/colors'

interface DragToCreatePreviewProps {
  effectType: EffectType
  startTime: number
  endTime: number
  trackY: number
  trackHeight: number
  pixelsPerMs: number
  isValid: boolean
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`
  return `${Math.round(ms)}ms`
}

export function DragToCreatePreview({
  effectType,
  startTime,
  endTime,
  trackY,
  trackHeight,
  pixelsPerMs,
  isValid
}: DragToCreatePreviewProps) {
  const colors = useTimelineColors()

  const baseColor = useMemo(() => {
    const config = getEffectTrackConfig(effectType)
    const key = config?.colorKey ?? 'primary'
    if (key === 'zoomBlock') return colors.zoomBlock
    if (key === 'screenBlock') return colors.screenBlock
    if (key === 'keystrokeBlock') return colors.keystrokeBlock
    if (key === 'annotationBlock') return colors.annotationBlock
    if (key === 'warning') return colors.warning
    if (key === 'primary') return colors.primary
    if (key === 'muted') return colors.muted
    return colors.primary
  }, [colors, effectType])

  const durationMs = Math.max(0, endTime - startTime)
  const x = TimeConverter.msToPixels(startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
  const width = TimeConverter.msToPixels(durationMs, pixelsPerMs)
  const height = getClipInnerHeight(trackHeight)

  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return null

  const stroke = isValid ? withAlpha(baseColor, 0.9) : withAlpha(colors.warning, 0.85)
  const fill = isValid ? withAlpha(baseColor, 0.22) : withAlpha(colors.warning, 0.18)
  const showLabel = width >= 56

  return (
    <Group listening={false} name="drag-to-create-preview">
      <Rect
        x={x}
        y={trackY}
        width={width}
        height={height}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        cornerRadius={8}
        dash={isValid ? undefined : [5, 4]}
      />
      {showLabel && (
        <Text
          x={x + 6}
          y={trackY + 4}
          text={formatDuration(durationMs)}
          fontSize={11}
          fill={colors.foreground}
          opacity={0.9}
        />
      )}
    </Group>
  )
}
