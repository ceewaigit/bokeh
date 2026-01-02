import React, { useEffect, useRef } from 'react'
import { Group, Rect } from 'react-konva'
import Konva from 'konva'
import { useTimelineColors } from '@/features/timeline/utils/colors'
import { TimelineTrackType } from '@/types/project'

interface TimelineTrackProps {
  type: TimelineTrackType
  y: number
  width: number
  height: number
  muted?: boolean
  onLabelClick?: () => void
}

const TRACK_ANIMATION_DURATION = 0.2
const TRACK_ANIMATION_EASING = Konva.Easings.EaseOut

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
  }, [y])

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
  }, [height, width])

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
  }, [height])

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






export const TimelineTrack = React.memo(({
  type,
  y,
  width,
  height,
  muted = false,
  onLabelClick: _onLabelClick
}: TimelineTrackProps) => {
  const colors = useTimelineColors()

  const getTrackStyle = () => {
    switch (type) {
      case TimelineTrackType.Video:
        return {
          bgFill: colors.background,
          bgOpacity: 0.08,
          labelText: 'Video',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Zoom:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'Zoom',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Screen:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'Screen',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Keystroke:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'Keys',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Plugin:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'Plugin',
          labelColor: colors.foreground
        }
      case TimelineTrackType.Audio:
        return {
          bgFill: colors.primary,
          bgOpacity: 0.08,
          labelText: 'Audio',
          labelColor: colors.primary
        }
      case TimelineTrackType.Webcam:
        return {
          bgFill: colors.webcamTrack || colors.primary,
          bgOpacity: 0.08,
          labelText: 'Cam',
          labelColor: colors.webcamTrack || colors.primary
        }
      case TimelineTrackType.Annotation:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'Overlay',
          labelColor: colors.foreground
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

  return (
    <AnimatedGroup y={y}>
      {/* Track background */}
      <AnimatedRect
        width={width}
        height={height}
        fill={style.bgFill}
        opacity={muted ? 0.04 : style.bgOpacity}
      />



      {/* Divider line at bottom */}
      <AnimatedSeparator
        width={width}
        height={height}
        fill={colors.border}
        opacity={0.04}
      />
    </AnimatedGroup>
  )
})
