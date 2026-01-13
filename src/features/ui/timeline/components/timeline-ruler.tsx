import React from 'react'
import { Line, Text, Rect, Group } from 'react-konva'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { useTimelineColors } from '@/features/ui/timeline/utils/colors'
import { formatTime } from '@/shared/utils/time'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useTimelineLayout } from './timeline-layout-provider'
import { useTimelineContext } from './TimelineUIContext'

interface TimelineRulerProps {
  scrollLeft: number
}

export const TimelineRuler = React.memo(({ scrollLeft }: TimelineRulerProps) => {
  // Removed direct context subscription to scrollLeft/scrollTop to prevent per-frame re-renders
  // Parent manages the Y position via an imperative ref update
  // scrollLeft comes as a coarse prop update for culling
  const {
    duration,
    stageWidth,
    zoom,
    pixelsPerMs
  } = useTimelineLayout()
  const {
    onScrubStart,
    onScrubMove,
    onScrubEnd,
  } = useTimelineContext()
  const colors = useTimelineColors()
  const [isHovering, setIsHovering] = React.useState(false)
  const isScrubbing = useProjectStore((s) => s.isScrubbing)
  const { major, minor } = TimeConverter.getRulerIntervals(zoom)
  const marks: React.ReactNode[] = []

  // Background for ruler
  marks.push(
    <Rect
      key="ruler-bg"
      x={scrollLeft}
      y={0}
      width={stageWidth}
      height={TimelineConfig.RULER_HEIGHT}
      fill="transparent"
      name="timeline-ruler"
      onMouseDown={onScrubStart}
      onTouchStart={onScrubStart}
      onMouseMove={onScrubMove}
      onTouchMove={onScrubMove}
      onMouseUp={onScrubEnd}
      onTouchEnd={onScrubEnd}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{ cursor: isScrubbing ? 'grabbing' : 'pointer' }}
      listening={true}
      opacity={colors.isGlassMode ? (isHovering ? 0.32 : 0.24) : (isHovering ? 0.98 : 0.9)}
    />
  )

  // Bottom border - subtle separator
  marks.push(
    <Rect
      key="ruler-border"
      x={scrollLeft}
      y={TimelineConfig.RULER_HEIGHT - 1}
      width={stageWidth}
      height={1}
      fill={colors.border}
      opacity={0.15}
    />
  )

  const visibleStartTime = Math.max(
    0,
    TimeConverter.pixelsToMs(scrollLeft - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
  )
  const visibleEndTime = TimeConverter.pixelsToMs(
    scrollLeft + stageWidth - TimelineConfig.TRACK_LABEL_WIDTH,
    pixelsPerMs
  )
  const maxTime = Math.max(duration, visibleEndTime)
  const startTime = Math.max(0, Math.floor(visibleStartTime / minor) * minor)

  for (let time = startTime; time <= maxTime; time += minor) {
    const isMajor = time % major === 0
    const x = TimeConverter.msToPixels(time, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH

    // Only render marks that are within the visible viewport
    if (x < scrollLeft) continue
    if (x > scrollLeft + stageWidth) break

    // Cleaner tick marks
    marks.push(
      <Line
        key={`mark-${time}`}
        points={[x, TimelineConfig.RULER_HEIGHT - (isMajor ? 6 : 3), x, TimelineConfig.RULER_HEIGHT]}
        stroke={colors.mutedForeground}
        strokeWidth={1}
        opacity={isMajor ? 0.4 : 0.2}
        lineCap="round"
        listening={false}
      />
    )

    if (isMajor) {
      marks.push(
        <Text
          key={`label-${time}`}
          x={x + 4}
          y={5}
          text={formatTime(time, true)}
          fontSize={9}
          fill={colors.mutedForeground}
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'SF Mono', monospace"
          fontStyle="normal"
          opacity={0.7}
          listening={false}
        />
      )
    }
  }

  return <Group>{marks}</Group>
})

TimelineRuler.displayName = 'TimelineRuler'
