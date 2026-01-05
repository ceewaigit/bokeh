import React from 'react'
import { Group, Line, Rect } from 'react-konva'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { useTimelineColors } from '@/features/ui/timeline/utils/colors'
import { clamp } from '@/shared/utils/utils'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useTimelineLayout } from './timeline-layout-provider'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'

export const TimelineGhostPlayhead = React.memo(() => {
  const { totalContentHeight: totalHeight, pixelsPerMs, duration: maxTime } = useTimelineLayout()
  const hoverTime = useProjectStore((s) => s.hoverTime)
  const isScrubbing = useProjectStore((s) => s.isScrubbing)
  const isPlaying = useProjectStore((s) => s.isPlaying)
  const currentProject = useProjectStore((s) => s.currentProject)
  const colors = useTimelineColors()
  // Hide ghost playhead during playback - only show when paused
  if (hoverTime === null || isScrubbing || isPlaying) return null
  // Clamp to safe end time (center of last frame) to prevent empty video
  const fps = currentProject ? TimelineDataService.getFps(currentProject) : 30
  const frameDuration = 1000 / fps
  const safeEndTime = Math.max(0, maxTime - (frameDuration * 0.5))

  const time = clamp(hoverTime, 0, safeEndTime)
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
