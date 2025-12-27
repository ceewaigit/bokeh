import React, { useEffect, useRef } from 'react'
import { Group, Rect, Text, Circle } from 'react-konva'
import Konva from 'konva'
import { TimelineConfig } from '@/lib/timeline/config'
import { useTimelineColors } from '@/lib/timeline/colors'
import { TimelineTrackType } from '@/types/project'

interface TimelineTrackProps {
  type: TimelineTrackType
  y: number
  width: number
  height: number
  muted?: boolean
  onLabelClick?: () => void
}

const TRACK_ANIMATION_DURATION = 0.5
const TRACK_ANIMATION_EASING = Konva.Easings.EaseInOut

// Animated Group wrapper to handle smooth Y transitions
const AnimatedGroup = ({ y, children }: { y: number; children: React.ReactNode }) => {
  const groupRef = useRef<Konva.Group>(null)
  const hasMountedRef = useRef(false)

  useEffect(() => {
    const node = groupRef.current
    if (!node) return
    if (!hasMountedRef.current) {
      node.y(y)
      hasMountedRef.current = true
      return
    }

    // Smooth, snappy apple-esque transition
    if (Math.abs(node.y() - y) > 0.5) {
      node.to({
        y: y,
        duration: TRACK_ANIMATION_DURATION,
        easing: TRACK_ANIMATION_EASING,
      })
    }
  }, [y])

  // Initialize position immediately on mount to prevent jumping
  useEffect(() => {
    if (groupRef.current) groupRef.current.y(y)
  }, [])

  return <Group ref={groupRef}>{children}</Group>
}

// Animated Rect to handle smooth Height transitions
const AnimatedRect = ({
  width,
  height,
  fill,
  opacity
}: {
  width: number
  height: number
  fill: string
  opacity: number
}) => {
  const rectRef = useRef<Konva.Rect>(null)
  const hasMountedRef = useRef(false)

  useEffect(() => {
    const node = rectRef.current
    if (!node) return
    if (!hasMountedRef.current) {
      node.height(height)
      node.width(width)
      hasMountedRef.current = true
      return
    }

    node.to({
      height: height,
      width: width, // Also animate width if it changes
      duration: TRACK_ANIMATION_DURATION,
      easing: TRACK_ANIMATION_EASING,
    })
  }, [height, width])

  // Initialize immediately
  useEffect(() => {
    if (rectRef.current) {
      rectRef.current.height(height)
      rectRef.current.width(width)
    }
  }, [])

  return (
    <Rect
      ref={rectRef}
      x={0}
      y={0} // Y is handled by parent Group
      // Initial values for first render
      width={width}
      height={height}
      fill={fill}
      opacity={opacity}
    />
  )
}

// Animated Separator Line
const AnimatedSeparator = ({ width, height, fill, opacity }: { width: number; height: number; fill: string; opacity: number }) => {
  const rectRef = useRef<Konva.Rect>(null)
  const hasMountedRef = useRef(false)

  useEffect(() => {
    const node = rectRef.current
    if (!node) return
    if (!hasMountedRef.current) {
      node.y(height - 1)
      node.width(width)
      hasMountedRef.current = true
      return
    }

    node.to({
      y: height - 1, // Separator stays at bottom
      width: width,
      duration: TRACK_ANIMATION_DURATION,
      easing: TRACK_ANIMATION_EASING,
    })
  }, [height, width])

  // Initialize immediately
  useEffect(() => {
    if (rectRef.current) {
      rectRef.current.y(height - 1)
    }
  }, [])

  return (
    <Rect
      ref={rectRef}
      x={0}
      y={height - 1} // Initial
      width={width}
      height={1}
      fill={fill}
      opacity={opacity}
    />
  )
}

// Animated Label Background and Separator
const AnimatedLabelArea = ({ height, width, separatorX }: { height: number; width: number; separatorX: number }) => {
  const bgRef = useRef<Konva.Rect>(null)
  const sepRef = useRef<Konva.Rect>(null)
  const hasMountedRef = useRef(false)

  useEffect(() => {
    if (!hasMountedRef.current) {
      if (bgRef.current) bgRef.current.height(height)
      if (sepRef.current) sepRef.current.height(height)
      hasMountedRef.current = true
      return
    }

    if (bgRef.current) {
      bgRef.current.to({
        height,
        duration: TRACK_ANIMATION_DURATION,
        easing: TRACK_ANIMATION_EASING
      })
    }
    if (sepRef.current) {
      sepRef.current.to({
        height,
        duration: TRACK_ANIMATION_DURATION,
        easing: TRACK_ANIMATION_EASING
      })
    }
  }, [height])

  return (
    <>
      <Rect
        ref={bgRef}
        x={0}
        y={0}
        width={width}
        height={height}
        opacity={0.4}
      />
      <Rect
        ref={sepRef}
        x={separatorX}
        y={0}
        width={1}
        height={height}
        opacity={0.1}
      />
    </>
  )
}

// Animated Group for Centered Label
const AnimatedLabelContent = ({
  x,
  y,
  children,
  onClick,
}: {
  x: number
  y: number
  children: React.ReactNode
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void
}) => {
  const groupRef = useRef<Konva.Group>(null)
  const hasMountedRef = useRef(false)

  useEffect(() => {
    const node = groupRef.current
    if (!node) return
    if (!hasMountedRef.current) {
      node.y(y)
      hasMountedRef.current = true
      return
    }
    node.to({
      y: y,
      duration: TRACK_ANIMATION_DURATION,
      easing: TRACK_ANIMATION_EASING
    })
  }, [y])

  useEffect(() => {
    if (groupRef.current) groupRef.current.y(y)
  }, [])

  return (
    <Group
      x={x}
      ref={groupRef}
      onClick={onClick}
      onTap={onClick as any}
    >
      {children}
    </Group>
  )
}


export const TimelineTrack = React.memo(({
  type,
  y,
  width,
  height,
  muted = false,
  onLabelClick
}: TimelineTrackProps) => {
  const colors = useTimelineColors()

  // Sub-tracks (Audio, Webcam) get indented visual treatment
  const isSubTrack = type === TimelineTrackType.Audio || type === TimelineTrackType.Webcam
  const indentSize = isSubTrack ? 8 : 0 // Left indent for hierarchy
  const labelRadius = isSubTrack ? 9 : 10 // Slightly larger for readability
  const fontSize = 10
  const labelDiameter = labelRadius * 2

  const getTrackStyle = () => {
    switch (type) {
      case TimelineTrackType.Video:
        return {
          bgFill: colors.background,
          bgOpacity: 0.5,
          labelText: 'V',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Zoom:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'Z',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Screen:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'S',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Keystroke:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'K',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Plugin:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'P',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Audio:
        return {
          bgFill: colors.primary,
          bgOpacity: 0.08,
          labelText: 'A',
          labelColor: colors.primary
        }
      case TimelineTrackType.Webcam:
        return {
          bgFill: colors.webcamTrack || colors.primary,
          bgOpacity: 0.08,
          labelText: 'W',
          labelColor: colors.webcamTrack || colors.primary
        }
      default:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: '?',
          labelColor: colors.foreground
        }
    }
  }

  const style = getTrackStyle()
  const labelTextColor = isSubTrack
    ? (muted ? colors.mutedForeground : colors.foreground)
    : (muted ? colors.mutedForeground : style.labelColor)


  return (
    <AnimatedGroup y={y}>
      {/* Track background */}
      <AnimatedRect
        width={width}
        height={height}
        fill={style.bgFill}
        opacity={muted ? 0.04 : style.bgOpacity}
      />

      {/* Sub-track connecting line (left edge) */}
      {isSubTrack && (
        <Rect
          x={indentSize - 1}
          y={0}
          width={1}
          height={height}
          fill={colors.border}
          opacity={0.15}
        />
      )}

      {/* Divider line at bottom */}
      <AnimatedSeparator
        width={width}
        height={height}
        fill={colors.border}
        opacity={0.04}
      />

      {/* Track label background & separator */}
      <AnimatedLabelArea
        height={height}
        width={TimelineConfig.TRACK_LABEL_WIDTH}
        separatorX={TimelineConfig.TRACK_LABEL_WIDTH - 1}
      />

      {onLabelClick && (
        <Rect
          x={0}
          y={0}
          width={TimelineConfig.TRACK_LABEL_WIDTH}
          height={height}
          fill="black"
          opacity={0}
          onMouseDown={(e) => {
            e.cancelBubble = true
          }}
          onTouchStart={(e) => {
            e.cancelBubble = true
          }}
          onClick={(e) => {
            e.cancelBubble = true
            onLabelClick()
          }}
          onTap={(e) => {
            e.cancelBubble = true
            onLabelClick()
          }}
        />
      )}

      {/* Track Icon/Label - Indented for sub-tracks */}
      <AnimatedLabelContent
        x={TimelineConfig.TRACK_LABEL_WIDTH / 2}
        y={height / 2}
        onClick={(e) => {
          if (!onLabelClick) return
          e.cancelBubble = true
          onLabelClick()
        }}
      >
        {isSubTrack && (
          <Circle
            x={0}
            y={0}
            radius={labelRadius + 2}
            fill={colors.foreground}
            opacity={muted ? 0.08 : 0.18}
          />
        )}
        <Circle
          x={0}
          y={0}
          radius={labelRadius}
          fill={isSubTrack ? colors.foreground : style.labelColor}
          opacity={muted ? 0.12 : (isSubTrack ? 0.28 : 0.15)}
        />
        <Text
          text={style.labelText}
          fontSize={fontSize}
          fill={labelTextColor}
          fontFamily="Inter, system-ui, -apple-system, sans-serif"
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          x={0}
          y={0}
          width={labelDiameter}
          height={labelDiameter}
          offsetX={labelDiameter / 2}
          offsetY={labelDiameter / 2}
        />
      </AnimatedLabelContent>
    </AnimatedGroup>
  )
})
