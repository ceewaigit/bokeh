import React from 'react'
import { Group, Line, Rect } from 'react-konva'
import { TimelineConfig } from '@/features/timeline/config'
import { TimeConverter } from '@/features/timeline/time/time-space-converter'
import { useTimelineColors } from '@/features/timeline/utils/colors'
import { clamp } from '@/shared/utils/utils'
import { useProjectStore } from '@/stores/project-store'
import { useTimelineLayout } from './timeline-layout-provider'

export const TimelineGhostPlayhead = React.memo(() => {
  const { stageHeight: totalHeight, pixelsPerMs, duration: maxTime } = useTimelineLayout()
  const hoverTime = useProjectStore((s) => s.hoverTime)
  const isScrubbing = useProjectStore((s) => s.isScrubbing)
  const colors = useTimelineColors()
  if (hoverTime === null || isScrubbing) return null
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

TimelineGhostPlayhead.displayName = 'TimelineGhostPlayhead'
