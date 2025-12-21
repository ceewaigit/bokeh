import React, { useState, useEffect, useRef } from 'react'
import { Group, Line, Rect, Text, RegularPolygon, Circle } from 'react-konva'
import Konva from 'konva'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { useTimelineColors } from '@/lib/timeline/colors'
import { clamp, formatTime } from '@/lib/utils'

interface TimelinePlayheadProps {
  currentTime: number
  totalHeight: number
  pixelsPerMs: number
  timelineWidth: number
  maxTime: number
  onSeek: (time: number) => void
}

export const TimelinePlayhead = React.memo(({
  currentTime,
  totalHeight,
  pixelsPerMs,
  timelineWidth,
  maxTime,
  onSeek
}: TimelinePlayheadProps) => {
  const colors = useTimelineColors()
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const x = TimeConverter.msToPixels(currentTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
  const isActive = isHovered || isDragging

  // Time badge dimensions
  const badgeWidth = 52
  const badgeHeight = 22
  const badgeRadius = 11 // Full pill shape
  const stemHeight = 6

  // Small handle dimensions
  const handleWidth = 10
  const handleHeight = 14
  const handleRadius = 5
  const gripWidth = 12
  const gripHeight = 26
  const gripRadius = 6
  const gripDotRadius = 1.2
  const gripDotSpacing = 4

  // Refs for animation
  const badgeGroupRef = useRef<Konva.Group>(null)
  const handleRef = useRef<Konva.Rect>(null)
  const lineRef = useRef<Konva.Line>(null)

  useEffect(() => {
    const badgeGroup = badgeGroupRef.current
    const handle = handleRef.current
    const line = lineRef.current

    if (badgeGroup && handle && line) {
      if (isActive) {
        // Animate to Active State (Show Badge, Hide Handle)
        new Konva.Tween({
          node: badgeGroup,
          duration: 0.25,
          opacity: 1,
          scaleX: 1,
          scaleY: 1,
          easing: Konva.Easings.BackEaseOut,
        }).play()

        new Konva.Tween({
          node: handle,
          duration: 0.2,
          opacity: 0,
          scaleX: 0.8,
          scaleY: 0.8,
          easing: Konva.Easings.EaseOut,
        }).play()

        new Konva.Tween({
          node: line,
          duration: 0.2,
          opacity: 1,
        }).play()
      } else {
        // Animate to Idle State (Hide Badge, Show Handle)
        new Konva.Tween({
          node: badgeGroup,
          duration: 0.2,
          opacity: 0,
          scaleX: 0.8,
          scaleY: 0.8,
          easing: Konva.Easings.EaseIn,
        }).play()

        new Konva.Tween({
          node: handle,
          duration: 0.25,
          opacity: 0.9,
          scaleX: 1,
          scaleY: 1,
          easing: Konva.Easings.BackEaseOut,
        }).play()

        new Konva.Tween({
          node: line,
          duration: 0.2,
          opacity: 0.85,
        }).play()
      }
    }
  }, [isActive])

  return (
    <Group
      x={x}
      y={0}
      draggable
      dragBoundFunc={(pos) => {
        const newX = Math.max(
          TimelineConfig.TRACK_LABEL_WIDTH,
          Math.min(timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH, pos.x)
        )
        return { x: newX, y: 0 }
      }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      onDragMove={(e) => {
        const newX = e.target.x() - TimelineConfig.TRACK_LABEL_WIDTH
        const time = TimeConverter.pixelsToMs(newX, pixelsPerMs)
        onSeek(clamp(time, 0, maxTime))
      }}
      onMouseEnter={() => {
        document.body.style.cursor = 'grab'
        setIsHovered(true)
      }}
      onMouseLeave={() => {
        document.body.style.cursor = 'default'
        setIsHovered(false)
      }}
    >
      {/* Main playhead line */}
      <Line
        ref={lineRef}
        points={[0, handleHeight, 0, totalHeight]}
        stroke={colors.accent}
        strokeWidth={1.5}
        hitStrokeWidth={12}
        opacity={0.85}
      />

      {/* Time badge Group - animated */}
      <Group
        ref={badgeGroupRef}
        opacity={0}
        scaleX={0.8}
        scaleY={0.8}
        y={0}
      >
        {/* Badge background (pill shape) */}
        <Rect
          x={-badgeWidth / 2}
          y={0}
          width={badgeWidth}
          height={badgeHeight}
          fill={colors.accent}
          cornerRadius={badgeRadius}
          shadowColor="rgba(0, 0, 0, 0.3)"
          shadowBlur={6}
          shadowOffsetY={2}
        />

        {/* Stem/pointer triangle */}
        <RegularPolygon
          x={0}
          y={badgeHeight + stemHeight / 2}
          sides={3}
          radius={stemHeight}
          fill={colors.accent}
          rotation={180}
        />

        {/* Time text */}
        <Text
          x={-badgeWidth / 2}
          y={5}
          width={badgeWidth}
          text={formatTime(currentTime, true)}
          fontSize={11}
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Display'"
          fontStyle="600"
          fill="white"
          align="center"
          listening={false}
        />
      </Group>

      {/* Small handle - animated */}
      <Rect
        ref={handleRef}
        x={-handleWidth / 2}
        y={0}
        width={handleWidth}
        height={handleHeight}
        fill={colors.accent}
        cornerRadius={handleRadius}
        opacity={0.9}
        // Center pivot for scaling
        offsetX={0}
        offsetY={0}
      />

      {/* Mid-line grip indicator - Only visible on hover/drag (fades with line) */}
      {(() => {
        const gripY = totalHeight / 2 - gripHeight / 2;
        // Group grip with line logic conceptually, but for now just static or follow line opacity?
        // Let's keep it simple: it appears when active.
        if (!isActive) return null

        return (
          <Group listening={false}>
            <Rect
              x={-gripWidth / 2}
              y={gripY}
              width={gripWidth}
              height={gripHeight}
              fill={colors.accent}
              cornerRadius={gripRadius}
              opacity={0.9}
            />
            <Circle
              x={0}
              y={gripY + gripHeight / 2 - gripDotSpacing}
              radius={gripDotRadius}
              fill="rgba(0,0,0,0.35)"
            />
            <Circle
              x={0}
              y={gripY + gripHeight / 2}
              radius={gripDotRadius}
              fill="rgba(0,0,0,0.35)"
            />
            <Circle
              x={0}
              y={gripY + gripHeight / 2 + gripDotSpacing}
              radius={gripDotRadius}
              fill="rgba(0,0,0,0.35)"
            />
          </Group>
        );
      })()}
    </Group>
  )
})
