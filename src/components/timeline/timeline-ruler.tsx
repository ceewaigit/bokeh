import React from 'react'
import { Line, Text, Rect, Group } from 'react-konva'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { useTimelineColors } from '@/lib/timeline/colors'
import { formatTime } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'

interface TimelineRulerProps {
  duration: number
  stageWidth: number
  zoom: number
  pixelsPerMs: number
  onSeek?: (time: number) => void
  onScrubStart?: (e: any) => void
  onScrubMove?: (e: any) => void
  onScrubEnd?: () => void
  offsetY?: number  // Used to keep ruler sticky during vertical scroll
}

export const TimelineRuler = React.memo(({
  duration,
  stageWidth,
  zoom,
  pixelsPerMs,
  onSeek,
  onScrubStart,
  onScrubMove,
  onScrubEnd,
  offsetY = 0
}: TimelineRulerProps) => {
  const colors = useTimelineColors()
  const [isHovering, setIsHovering] = React.useState(false)
  const isScrubbing = useProjectStore((s) => s.isScrubbing)
  const { major, minor } = TimeConverter.getRulerIntervals(zoom)
  const marks: React.ReactNode[] = []

  // Background for ruler
  marks.push(
    <Rect
      key="ruler-bg"
      x={0}
      y={0}
      width={stageWidth}
      height={TimelineConfig.RULER_HEIGHT}
      fill={colors.ruler}
      name="timeline-ruler"
      onMouseDown={onScrubStart}
      onTouchStart={onScrubStart}
      onMouseMove={onScrubMove}
      onTouchMove={onScrubMove}
      onMouseUp={onScrubEnd}
      onTouchEnd={onScrubEnd}
      onMouseEnter={() => {
        if (!onSeek) return
        setIsHovering(true)
      }}
      onMouseLeave={() => {
        if (!onSeek) return
        setIsHovering(false)
      }}
      style={{ cursor: onSeek ? (isScrubbing ? 'grabbing' : 'pointer') : 'default' }}
      listening={Boolean(onSeek)}
      opacity={colors.isGlassMode ? (isHovering ? 0.32 : 0.24) : (isHovering ? 0.98 : 0.9)}
    />
  )

  // Bottom border - subtle separator
  marks.push(
    <Rect
      key="ruler-border"
      x={0}
      y={TimelineConfig.RULER_HEIGHT - 1}
      width={stageWidth}
      height={1}
      fill={colors.border}
      opacity={0.15}
    />
  )

  // Calculate the maximum time we need to render marks for based on stage width
  const maxTimeForStage = TimeConverter.pixelsToMs(stageWidth - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
  const maxTime = Math.max(duration, maxTimeForStage)

  for (let time = 0; time <= maxTime; time += minor) {
    const isMajor = time % major === 0
    const x = TimeConverter.msToPixels(time, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH

    // Only render marks that are within the stage width
    if (x > stageWidth) break

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

  return <Group y={offsetY}>{marks}</Group>
})
