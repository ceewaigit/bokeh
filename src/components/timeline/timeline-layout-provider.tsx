'use client'

/**
 * TimelineLayoutProvider
 *
 * Provides timeline layout values via context.
 * Effect track heights/positions are derived from the registry.
 */

import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { useEffectTrackExistence, useMediaTrackExistence, useTimelineDuration } from '@/stores/selectors/timeline-selectors'
import { TimelineConfig, getClipInnerHeight } from '@/features/timeline/config'
import { TimeConverter } from '@/features/timeline/time/time-space-converter'
import { EffectType } from '@/types/effects'
import { TimelineTrackType, TrackType } from '@/types/project'
import { EFFECT_TRACK_TYPES, getSortedTrackConfigs } from '@/features/timeline/effect-track-registry'

/** Track type that can be used for visibility/active state */
export type TrackId = TimelineTrackType | EffectType

// Track height constants
const TRACK_HEIGHT_COLLAPSED = 28
const TRACK_HEIGHT_EXPANDED = 45
const TRACK_HEIGHT_VIDEO_MAX = 80
const TRACK_HEIGHT_AUDIO_MAX = 40

/** Fixed track heights (non-effect tracks) */
export interface FixedTrackHeights {
  ruler: number
  speedUpBarSpace: number
  video: number
  audio: number
  webcam: number
  screenGroupHeader: number
}

/** Fixed track positions (non-effect tracks) */
export interface FixedTrackPositions {
  ruler: number
  speedUpBar: number  // Y position for speed-up suggestion bars
  screenGroupHeader: number
  video: number
  audio: number
  webcam: number
}

/** Track bounds for rendering clips with proper padding */
export interface TrackBounds {
  y: number           // Track top position
  height: number      // Total track height
  clipY: number       // Clip render position (y + padding)
  clipHeight: number  // Clip render height (height - padding*2)
}

export interface TimelineLayoutContextValue {
  stageWidth: number
  stageHeight: number
  containerHeight: number
  containerWidth: number
  timelineWidth: number
  duration: number
  zoom: number
  pixelsPerMs: number
  // Fixed tracks
  fixedTrackHeights: FixedTrackHeights
  fixedTrackPositions: FixedTrackPositions
  // Effect tracks - dynamic based on registry
  effectTrackHeights: Record<EffectType, number>
  effectTrackPositions: Record<EffectType, number>
  effectTrackExistence: Record<EffectType, boolean>
  // Backwards compat - flattened view
  trackHeights: FixedTrackHeights & Record<string, number>
  trackPositions: FixedTrackPositions & Record<string, number>
  // Legacy flags (derived from effectTrackExistence)
  hasZoomTrack: boolean
  hasScreenTrack: boolean
  hasKeystrokeTrack: boolean
  hasPluginTrack: boolean
  hasCropTrack: boolean
  hasWebcamTrack: boolean
  hasAnnotationTrack: boolean
  isScreenGroupCollapsed: boolean
  hasSpeedUpSuggestions: { typing: boolean; idle: boolean }
  showTypingSuggestions: boolean
  toggleScreenGroupCollapsed: () => void
  containerRef: RefObject<HTMLDivElement>
  // Track visibility & active state
  visibleTracks: Set<TrackId>
  activeTrack: TrackId | null
  toggleTrackVisibility: (track: TrackId) => void
  setActiveTrack: (track: TrackId | null) => void
  isTrackExpanded: (track: TrackId) => boolean
  toggleEffectTrackExpanded: (track: TrackId) => void
  toggleVideoTrackExpanded: () => void
  isVideoTrackExpanded: boolean
  /** Get track bounds for rendering clips */
  getTrackBounds: (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => TrackBounds
}

const TimelineLayoutContext = createContext<TimelineLayoutContextValue | null>(null)

export function useTimelineLayout(): TimelineLayoutContextValue {
  const ctx = useContext(TimelineLayoutContext)
  if (!ctx) {
    throw new Error('[useTimelineLayout] Must be used within TimelineLayoutProvider')
  }
  return ctx
}

export function useTimelineLayoutOptional(): TimelineLayoutContextValue | null {
  return useContext(TimelineLayoutContext)
}

interface TimelineLayoutProviderProps {
  children: React.ReactNode
}

function detectSpeedUpSuggestions(project: { recordings?: Array<{ metadata?: { detectedTypingPeriods?: unknown[]; detectedIdlePeriods?: unknown[] } }> } | null): { typing: boolean; idle: boolean } {
  if (!project?.recordings) return { typing: false, idle: false }
  let hasTyping = false
  let hasIdle = false
  for (const recording of project.recordings) {
    if (recording.metadata?.detectedTypingPeriods?.length) hasTyping = true
    if (recording.metadata?.detectedIdlePeriods?.length) hasIdle = true
    if (hasTyping && hasIdle) break
  }
  return { typing: hasTyping, idle: hasIdle }
}

export function TimelineLayoutProvider({ children }: TimelineLayoutProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 300 })
  const [isScreenGroupCollapsed, setIsScreenGroupCollapsed] = useState(false)

  // Track visibility - all tracks visible by default
  const [visibleTracks, setVisibleTracks] = useState<Set<TrackId>>(() => {
    const set = new Set<TrackId>([
      TimelineTrackType.Video,
      TimelineTrackType.Audio,
      TimelineTrackType.Webcam
    ])
    EFFECT_TRACK_TYPES.forEach(t => set.add(t))
    return set
  })

  const [activeTrack, setActiveTrack] = useState<TrackId | null>(null)
  const [expandedEffectTrack, setExpandedEffectTrack] = useState<EffectType | null>(null)
  const [isVideoTrackExpanded, setIsVideoTrackExpanded] = useState(false)

  const zoom = useProjectStore((s) => s.zoom)
  const showTypingSuggestions = useProjectStore((s) => s.settings.showTypingSuggestions)
  const currentProject = useProjectStore((s) => s.currentProject)
  const duration = useTimelineDuration()
  const effectTrackExistence = useEffectTrackExistence()
  const mediaTrackExistence = useMediaTrackExistence()

  const toggleScreenGroupCollapsed = useCallback(() => {
    setIsScreenGroupCollapsed(prev => !prev)
  }, [])

  const toggleTrackVisibility = useCallback((track: TrackId) => {
    setVisibleTracks(prev => {
      const next = new Set(prev)
      if (next.has(track)) next.delete(track)
      else next.add(track)
      return next
    })
  }, [])

  const setActiveTrackWithMemory = useCallback((track: TrackId | null) => {
    setActiveTrack(track)
    if (track && EFFECT_TRACK_TYPES.includes(track as EffectType)) {
      setExpandedEffectTrack(track as EffectType)
    }
  }, [])

  const toggleEffectTrackExpanded = useCallback((track: TrackId) => {
    // Only toggle if it's an effect track type
    if (EFFECT_TRACK_TYPES.includes(track as EffectType)) {
      setExpandedEffectTrack(prev => prev === track ? null : track as EffectType)
    }
  }, [])

  const toggleVideoTrackExpanded = useCallback(() => {
    setIsVideoTrackExpanded(prev => !prev)
  }, [])

  const isTrackExpanded = useCallback((track: TrackId): boolean => {
    if (track === TimelineTrackType.Video || track === TimelineTrackType.Audio) return true
    return expandedEffectTrack === track
  }, [expandedEffectTrack])

  const hasSpeedUpSuggestions = useMemo(
    () => detectSpeedUpSuggestions(currentProject),
    [currentProject]
  )

  const pixelsPerMs = useMemo(
    () => TimeConverter.calculatePixelsPerMs(containerSize.width, zoom),
    [zoom, containerSize.width]
  )

  const timelineWidth = useMemo(
    () => TimeConverter.calculateTimelineWidth(duration, pixelsPerMs, containerSize.width),
    [duration, pixelsPerMs, containerSize.width]
  )

  // Calculate fixed track heights
  const fixedTrackHeights = useMemo((): FixedTrackHeights => {
    const rulerHeight = TimelineConfig.RULER_HEIGHT
    const speedUpBarSpace = (hasSpeedUpSuggestions.typing || hasSpeedUpSuggestions.idle) && showTypingSuggestions
      ? TimelineConfig.SPEED_UP_BAR_SPACE
      : 0

    const videoVisible = visibleTracks.has(TimelineTrackType.Video)
    const audioVisible = visibleTracks.has(TimelineTrackType.Audio) && !isScreenGroupCollapsed && isVideoTrackExpanded
    const webcamVisible = visibleTracks.has(TimelineTrackType.Webcam) && mediaTrackExistence.hasWebcamTrack

    // Calculate effect track total height
    let effectTotalHeight = 0
    for (const type of EFFECT_TRACK_TYPES) {
      if (effectTrackExistence[type] && !isScreenGroupCollapsed && visibleTracks.has(type)) {
        effectTotalHeight += expandedEffectTrack === type ? TRACK_HEIGHT_EXPANDED : TRACK_HEIGHT_COLLAPSED
      }
    }
    const webcamHeight = webcamVisible ? TRACK_HEIGHT_COLLAPSED : 0

    const fixedHeight = rulerHeight + speedUpBarSpace + webcamHeight + effectTotalHeight
    const remainingHeight = Math.max(0, containerSize.height - fixedHeight)

    const videoWeight = videoVisible ? 2 : 0
    const audioWeight = audioVisible ? 1 : 0
    const totalWeight = videoWeight + audioWeight || 1

    return {
      ruler: rulerHeight,
      speedUpBarSpace,
      screenGroupHeader: 0,
      video: videoVisible ? Math.min(TRACK_HEIGHT_VIDEO_MAX, Math.floor(remainingHeight * (videoWeight / totalWeight))) : 0,
      audio: audioVisible ? Math.min(TRACK_HEIGHT_AUDIO_MAX, Math.floor(remainingHeight * (audioWeight / totalWeight))) : 0,
      webcam: webcamHeight
    }
  }, [containerSize.height, hasSpeedUpSuggestions, showTypingSuggestions, isScreenGroupCollapsed, visibleTracks, isVideoTrackExpanded, expandedEffectTrack, effectTrackExistence, mediaTrackExistence.hasWebcamTrack])

  // Calculate effect track heights dynamically
  const effectTrackHeights = useMemo((): Record<EffectType, number> => {
    const heights: Record<string, number> = {}
    for (const type of EFFECT_TRACK_TYPES) {
      const visible = effectTrackExistence[type] && !isScreenGroupCollapsed && visibleTracks.has(type)
      heights[type] = visible
        ? (expandedEffectTrack === type ? TRACK_HEIGHT_EXPANDED : TRACK_HEIGHT_COLLAPSED)
        : 0
    }
    return heights as Record<EffectType, number>
  }, [effectTrackExistence, isScreenGroupCollapsed, visibleTracks, expandedEffectTrack])

  // Calculate fixed track positions
  const fixedTrackPositions = useMemo((): FixedTrackPositions => {
    let y = 0
    const rulerY = y
    y += fixedTrackHeights.ruler

    const screenGroupHeaderY = y

    // Add speed-up bar space gap
    y += fixedTrackHeights.speedUpBarSpace

    // Video starts immediately after header/ruler
    const videoY = y
    y += fixedTrackHeights.video

    const audioY = y
    y += fixedTrackHeights.audio

    const webcamY = y

    return {
      ruler: rulerY,
      speedUpBar: screenGroupHeaderY,  // Speed-up bars render in the gap after ruler
      screenGroupHeader: screenGroupHeaderY,
      video: videoY,
      audio: audioY,
      webcam: webcamY
    }
  }, [fixedTrackHeights])

  // Calculate effect track positions dynamically
  const effectTrackPositions = useMemo((): Record<EffectType, number> => {
    let y = fixedTrackPositions.webcam + fixedTrackHeights.webcam
    const positions: Record<string, number> = {}
    const sortedConfigs = getSortedTrackConfigs()

    for (const { type } of sortedConfigs) {
      positions[type] = y
      if (effectTrackExistence[type] && !isScreenGroupCollapsed) {
        y += effectTrackHeights[type]
      }
    }
    return positions as Record<EffectType, number>
  }, [fixedTrackPositions.webcam, fixedTrackHeights.webcam, effectTrackExistence, isScreenGroupCollapsed, effectTrackHeights])

  // Backwards-compatible merged views
  const trackHeights = useMemo(() => ({
    ...fixedTrackHeights,
    zoom: effectTrackHeights[EffectType.Zoom] ?? 0,
    screen: effectTrackHeights[EffectType.Screen] ?? 0,
    keystroke: effectTrackHeights[EffectType.Keystroke] ?? 0,
    plugin: effectTrackHeights[EffectType.Plugin] ?? 0,
    annotation: effectTrackHeights[EffectType.Annotation] ?? 0
  }), [fixedTrackHeights, effectTrackHeights])

  const trackPositions = useMemo(() => ({
    ...fixedTrackPositions,
    zoom: effectTrackPositions[EffectType.Zoom] ?? 0,
    screen: effectTrackPositions[EffectType.Screen] ?? 0,
    keystroke: effectTrackPositions[EffectType.Keystroke] ?? 0,
    plugin: effectTrackPositions[EffectType.Plugin] ?? 0,
    annotation: effectTrackPositions[EffectType.Annotation] ?? 0
  }), [fixedTrackPositions, effectTrackPositions])

  // Calculate total content height
  const contentHeight = useMemo(() => {
    let total = fixedTrackHeights.ruler + fixedTrackHeights.speedUpBarSpace +
      fixedTrackHeights.video + fixedTrackHeights.audio + fixedTrackHeights.webcam
    for (const type of EFFECT_TRACK_TYPES) {
      total += effectTrackHeights[type] ?? 0
    }
    return total
  }, [fixedTrackHeights, effectTrackHeights])

  // Centralized track bounds lookup - previously duplicated in timeline-canvas.tsx
  const getTrackBounds = useCallback((trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam): TrackBounds => {
    const padding = TimelineConfig.TRACK_PADDING
    switch (trackType) {
      case TrackType.Audio: {
        const y = trackPositions.audio
        const height = trackHeights.audio
        return { y, height, clipY: y + padding, clipHeight: getClipInnerHeight(height) }
      }
      case TrackType.Webcam: {
        const y = trackPositions.webcam
        const height = trackHeights.webcam
        return { y, height, clipY: y + padding, clipHeight: getClipInnerHeight(height) }
      }
      case TrackType.Video:
      default: {
        const y = trackPositions.video
        const height = trackHeights.video
        return { y, height, clipY: y + padding, clipHeight: getClipInnerHeight(height) }
      }
    }
  }, [trackPositions, trackHeights])

  // ResizeObserver for container size
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let rafId: number | null = null
    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      setContainerSize({ width: rect.width, height: rect.height })
    }
    const scheduleUpdate = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        updateSize()
      })
    }

    updateSize()
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(container)
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  const value = useMemo<TimelineLayoutContextValue>(() => ({
    stageWidth: Math.max(timelineWidth + containerSize.width, containerSize.width),
    stageHeight: Math.max(containerSize.height, contentHeight),
    containerHeight: containerSize.height,
    containerWidth: containerSize.width,
    timelineWidth,
    duration,
    zoom,
    pixelsPerMs,
    fixedTrackHeights,
    fixedTrackPositions,
    effectTrackHeights,
    effectTrackPositions,
    effectTrackExistence,
    trackHeights,
    trackPositions,
    // Legacy boolean flags
    hasZoomTrack: effectTrackExistence[EffectType.Zoom] ?? false,
    hasScreenTrack: effectTrackExistence[EffectType.Screen] ?? false,
    hasKeystrokeTrack: effectTrackExistence[EffectType.Keystroke] ?? false,
    hasPluginTrack: effectTrackExistence[EffectType.Plugin] ?? false,
    hasAnnotationTrack: effectTrackExistence[EffectType.Annotation] ?? false,
    hasCropTrack: mediaTrackExistence.hasCropTrack,
    hasWebcamTrack: mediaTrackExistence.hasWebcamTrack,
    isScreenGroupCollapsed,
    hasSpeedUpSuggestions,
    showTypingSuggestions,
    toggleScreenGroupCollapsed,
    containerRef,
    visibleTracks,
    activeTrack,
    toggleTrackVisibility,
    setActiveTrack: setActiveTrackWithMemory,
    isTrackExpanded,
    toggleEffectTrackExpanded,
    toggleVideoTrackExpanded,
    isVideoTrackExpanded,
    getTrackBounds
  }), [
    timelineWidth, containerSize, contentHeight, duration, zoom, pixelsPerMs,
    fixedTrackHeights, fixedTrackPositions, effectTrackHeights, effectTrackPositions,
    effectTrackExistence, trackHeights, trackPositions, mediaTrackExistence,
    isScreenGroupCollapsed, hasSpeedUpSuggestions, showTypingSuggestions,
    toggleScreenGroupCollapsed, visibleTracks, activeTrack, toggleTrackVisibility,
    setActiveTrackWithMemory, isTrackExpanded, toggleEffectTrackExpanded,
    toggleVideoTrackExpanded, isVideoTrackExpanded, getTrackBounds
  ])

  return (
    <TimelineLayoutContext.Provider value={value}>
      <div ref={containerRef} className="h-full w-full">
        {children}
      </div>
    </TimelineLayoutContext.Provider>
  )
}
