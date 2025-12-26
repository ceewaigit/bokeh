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
  offsetY?: number  // Used to keep ruler sticky during vertical scroll
}

export const TimelineRuler = React.memo(({ duration, stageWidth, zoom, pixelsPerMs, onSeek, offsetY = 0 }: TimelineRulerProps) => {
  const colors = useTimelineColors()
  const [isHovering, setIsHovering] = React.useState(false)
  const isScrubbing = useProjectStore((s) => s.isScrubbing)
  const setScrubbing = useProjectStore((s) => s.setScrubbing)
  const stageRef = React.useRef<any>(null)
  const { major, minor } = TimeConverter.getRulerIntervals(zoom)
  const marks: React.ReactNode[] = []

  const seekFromEvent = React.useCallback((e: any) => {
    if (!onSeek) return

    const stage = e.target.getStage()
    const pointerPos = stage?.getPointerPosition()
    if (!pointerPos) return

    const x = pointerPos.x - TimelineConfig.TRACK_LABEL_WIDTH
    if (x > 0) {
      const time = TimeConverter.pixelsToMs(x, pixelsPerMs)
      const maxTime = duration
      const targetTime = Math.max(0, Math.min(time, maxTime))
      onSeek(targetTime)
    }
  }, [duration, onSeek, pixelsPerMs])

  const seekFromClientX = React.useCallback((clientX: number) => {
    if (!onSeek) return
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.container()?.getBoundingClientRect()
    if (!rect) return
    const x = clientX - rect.left - TimelineConfig.TRACK_LABEL_WIDTH
    if (x > 0) {
      const time = TimeConverter.pixelsToMs(x, pixelsPerMs)
      const maxTime = duration
      const targetTime = Math.max(0, Math.min(time, maxTime))
      onSeek(targetTime)
    }
  }, [duration, onSeek, pixelsPerMs])

  // Handle click/drag on ruler to seek
  const handleRulerDown = (e: any) => {
    if (!onSeek) return
    stageRef.current = e.target.getStage()
    setScrubbing(true)
    seekFromEvent(e)
  }

  const handleRulerMove = (e: any) => {
    if (!isScrubbing) return
    seekFromEvent(e)
  }

  React.useEffect(() => {
    if (!isScrubbing) return

    const endScrub = () => setScrubbing(false)
    const handleMouseMove = (event: MouseEvent) => {
      seekFromClientX(event.clientX)
    }
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 0) return
      seekFromClientX(event.touches[0].clientX)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('mouseup', endScrub)
    window.addEventListener('touchend', endScrub)
    window.addEventListener('touchcancel', endScrub)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('mouseup', endScrub)
      window.removeEventListener('touchend', endScrub)
      window.removeEventListener('touchcancel', endScrub)
    }
  }, [isScrubbing, seekFromClientX, setScrubbing])

  // Background for ruler
  marks.push(
    <Rect
      key="ruler-bg"
      x={0}
      y={0}
      width={stageWidth}
      height={TimelineConfig.RULER_HEIGHT}
      fill={colors.ruler}
      onMouseDown={handleRulerDown}
      onTouchStart={handleRulerDown}
      onMouseMove={handleRulerMove}
      onTouchMove={handleRulerMove}
      onMouseUp={() => setScrubbing(false)}
      onTouchEnd={() => setScrubbing(false)}
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
          y={8}
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
