import React from 'react'
import { Group, Line, Rect } from 'react-konva'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { useTimelineColors } from '@/lib/timeline/colors'
import { clamp } from '@/lib/utils'

interface TimelineGhostPlayheadProps {
  hoverTime: number
  totalHeight: number
  pixelsPerMs: number
  maxTime: number
}

export const TimelineGhostPlayhead = React.memo(({
  hoverTime,
  totalHeight,
  pixelsPerMs,
  maxTime
}: TimelineGhostPlayheadProps) => {
  const colors = useTimelineColors()
  const time = clamp(hoverTime, 0, maxTime)
  const x = TimeConverter.msToPixels(time, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH

  const lineOpacity = colors.isGlassMode ? 0.35 : 0.55
  const headOpacity = colors.isGlassMode ? 0.4 : 0.6
  const headWidth = 10
  const headHeight = 12
  const headRadius = 6

  return (
    <Group x={x} y={0} listening={false}>
      <Line
        points={[0, TimelineConfig.RULER_HEIGHT, 0, totalHeight]}
        stroke={colors.accent}
        strokeWidth={1}
        opacity={lineOpacity}
        dash={[4, 4]}
        lineCap="round"
      />
      <Rect
        x={-headWidth / 2}
        y={2}
        width={headWidth}
        height={headHeight}
        fill={colors.accent}
        cornerRadius={headRadius}
        opacity={headOpacity}
      />
    </Group>
  )
})
