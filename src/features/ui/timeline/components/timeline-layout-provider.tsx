'use client'

/**
 * TimelineLayoutProvider
 *
 * Provides timeline layout values via context.
 * Effect track heights/positions are derived from the registry.
 */

import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useEffectTrackExistence, useMediaTrackExistence, useTimelineDuration } from '@/features/core/stores/selectors/timeline-selectors'
import { TimelineConfig, getClipInnerHeight } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { EffectType } from '@/features/effects/types'
import { TimelineTrackType, TrackType } from '@/types/project'
import { EFFECT_TRACK_TYPES, getEffectTrackConfig, getSortedTrackConfigs } from '@/features/ui/timeline/effect-track-registry'
import { EffectStore } from '@/features/effects/core/store'

/** Track type that can be used for visibility/active state */
export type TrackId = TimelineTrackType | EffectType

const ANNOTATION_HEADER_HEIGHT = 20

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
  totalContentHeight: number // The full scrollable height
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
  isAnnotationExpanded: boolean
  toggleAnnotationExpanded: () => void
  isScreenGroupCollapsed: boolean
  hasSpeedUpSuggestions: { typing: boolean; idle: boolean }
  showTypingSuggestions: boolean
  toggleScreenGroupCollapsed: () => void
  containerRef: RefObject<HTMLDivElement | null>
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
  const hasMeasuredContainerRef = useRef(false)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 300 })
  const [isScreenGroupCollapsed, setIsScreenGroupCollapsed] = useState(false)

  // Track visibility - all tracks visible by default
  const [visibleTracks, setVisibleTracks] = useState<Set<TrackId>>(() => {
    const set = new Set<TrackId>([
      TimelineTrackType.Video,
      TimelineTrackType.Audio,
      TimelineTrackType.Webcam,
      TimelineTrackType.Annotation
    ])
    EFFECT_TRACK_TYPES.forEach(t => set.add(t))
    return set
  })

  const [activeTrack, setActiveTrack] = useState<TrackId | null>(null)
  const [expandedEffectTrack, setExpandedEffectTrack] = useState<EffectType | null>(EffectType.Zoom)  // Zoom expanded by default
  const [isVideoTrackExpanded, setIsVideoTrackExpanded] = useState(false)
  const [isAnnotationExpanded, setIsAnnotationExpanded] = useState(false)

  const currentProjectId = useProjectStore((s) => s.currentProject?.id)
  const setAutoZoom = useProjectStore((s) => s.setAutoZoom)
  const zoomManuallyAdjusted = useProjectStore((s) => s.zoomManuallyAdjusted)
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

  const toggleAnnotationExpanded = useCallback(() => {
    setIsAnnotationExpanded(prev => !prev)
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

  // Auto-fit zoom once container size is known: end of last clip lands near the right edge.
  const autoZoomSignatureRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentProjectId) return
    if (zoomManuallyAdjusted) return
    if (!hasMeasuredContainerRef.current) return
    if (!(containerSize.width > 0) || !(duration > 0)) return

    const optimalZoom = TimeConverter.calculateOptimalZoom(duration, containerSize.width)
    const clampedZoom = Math.max(TimelineConfig.MIN_ZOOM, Math.min(TimelineConfig.MAX_ZOOM, optimalZoom))

    const signature = `${currentProjectId}:${Math.round(containerSize.width)}:${Math.round(duration)}`
    if (autoZoomSignatureRef.current === signature) return
    autoZoomSignatureRef.current = signature

    setAutoZoom(clampedZoom)
  }, [currentProjectId, zoomManuallyAdjusted, containerSize.width, duration, setAutoZoom])

  // Calculate fixed track heights - use fixed values to allow vertical scrolling
  const fixedTrackHeights = useMemo((): FixedTrackHeights => {
    const rulerHeight = TimelineConfig.RULER_HEIGHT
    const speedUpBarSpace = (hasSpeedUpSuggestions.typing || hasSpeedUpSuggestions.idle) && showTypingSuggestions
      ? TimelineConfig.SPEED_UP_BAR_SPACE
      : 0

    const videoVisible = visibleTracks.has(TimelineTrackType.Video)
    const audioVisible = visibleTracks.has(TimelineTrackType.Audio) && !isScreenGroupCollapsed && isVideoTrackExpanded
    const webcamVisible = visibleTracks.has(TimelineTrackType.Webcam) && mediaTrackExistence.hasWebcamTrack

    // Use fixed heights instead of scaling to container - enables vertical scrolling
    const videoHeight = videoVisible ? TimelineConfig.TRACK.VIDEO_HEIGHT : 0
    const audioHeight = audioVisible ? TimelineConfig.TRACK.AUDIO_HEIGHT : 0
    const webcamHeight = webcamVisible ? TimelineConfig.TRACK.WEBCAM_HEIGHT : 0

    return {
      ruler: rulerHeight,
      speedUpBarSpace,
      screenGroupHeader: 0,
      video: videoHeight,
      audio: audioHeight,
      webcam: webcamHeight
    }
  }, [hasSpeedUpSuggestions, showTypingSuggestions, isScreenGroupCollapsed, visibleTracks, isVideoTrackExpanded, mediaTrackExistence.hasWebcamTrack])

  // Calculate effect track heights dynamically
  const effectTrackHeights = useMemo((): Record<EffectType, number> => {
    const heights: Record<string, number> = {}
    for (const type of EFFECT_TRACK_TYPES) {
      const config = getEffectTrackConfig(type)
      const alwaysShow = config?.alwaysShowTrack ?? false
      const visible = (alwaysShow || effectTrackExistence[type]) && !isScreenGroupCollapsed && visibleTracks.has(type)
      heights[type] = visible
        ? (expandedEffectTrack === type ? TimelineConfig.TRACK.EFFECT_EXPANDED : TimelineConfig.TRACK.EFFECT_COLLAPSED)
        : 0
    }
    return heights as Record<EffectType, number>
  }, [effectTrackExistence, isScreenGroupCollapsed, visibleTracks, expandedEffectTrack])

  const annotationCount = useMemo(() => {
    if (!currentProject) return 0
    return EffectStore.getAll(currentProject).filter(e => e.type === EffectType.Annotation).length
  }, [currentProject])

  const annotationTrackHeight = useMemo(() => {
    const visible = (effectTrackExistence[EffectType.Annotation] ?? false) && !isScreenGroupCollapsed && visibleTracks.has(TimelineTrackType.Annotation)
    if (!visible) return 0
    if (!isAnnotationExpanded) return ANNOTATION_HEADER_HEIGHT + TimelineConfig.TRACK.EFFECT_COLLAPSED
    // Expanded shows header + N annotation rows.
    return ANNOTATION_HEADER_HEIGHT + Math.max(1, annotationCount) * TimelineConfig.TRACK.EFFECT_COLLAPSED
  }, [annotationCount, effectTrackExistence, isAnnotationExpanded, isScreenGroupCollapsed, visibleTracks])

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
  // Also tracks total content height
  const { positions: effectTrackPositions, annotationY, totalContentHeight } = useMemo(() => {
    let y = fixedTrackPositions.webcam + fixedTrackHeights.webcam
    const positions: Record<string, number> = {}
    const sortedConfigs = getSortedTrackConfigs()

    for (const { type } of sortedConfigs) {
      positions[type] = y
      y += effectTrackHeights[type]
    }

    const annotationTrackY = y
    y += annotationTrackHeight

    // Minimal bottom padding for better UX
    const bottomPadding = TimelineConfig.SCROLL.BOTTOM_PADDING

    return {
      positions: positions as Record<EffectType, number>,
      annotationY: annotationTrackY,
      totalContentHeight: y + bottomPadding
    }
  }, [
    fixedTrackPositions.webcam,
    fixedTrackHeights.webcam,
    effectTrackExistence,
    isScreenGroupCollapsed,
    effectTrackHeights,
    annotationTrackHeight
  ])

  // Backwards-compatible merged views
  const trackHeights = useMemo(() => ({
    ...fixedTrackHeights,
    zoom: effectTrackHeights[EffectType.Zoom] ?? 0,
    screen: effectTrackHeights[EffectType.Screen] ?? 0,
    keystroke: effectTrackHeights[EffectType.Keystroke] ?? 0,
    plugin: effectTrackHeights[EffectType.Plugin] ?? 0,
    annotation: annotationTrackHeight
  }), [fixedTrackHeights, effectTrackHeights, annotationTrackHeight])

  const trackPositions = useMemo(() => ({
    ...fixedTrackPositions,
    zoom: effectTrackPositions[EffectType.Zoom] ?? 0,
    screen: effectTrackPositions[EffectType.Screen] ?? 0,
    keystroke: effectTrackPositions[EffectType.Keystroke] ?? 0,
    plugin: effectTrackPositions[EffectType.Plugin] ?? 0,
    annotation: annotationY
  }), [fixedTrackPositions, effectTrackPositions, annotationY])

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
      hasMeasuredContainerRef.current = true
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
    stageWidth: containerSize.width,
    stageHeight: containerSize.height,
    totalContentHeight,
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
    hasZoomTrack: (getEffectTrackConfig(EffectType.Zoom)?.alwaysShowTrack ?? false) || (effectTrackExistence[EffectType.Zoom] ?? false),
    hasScreenTrack: (getEffectTrackConfig(EffectType.Screen)?.alwaysShowTrack ?? false) || (effectTrackExistence[EffectType.Screen] ?? false),
    hasKeystrokeTrack: (getEffectTrackConfig(EffectType.Keystroke)?.alwaysShowTrack ?? false) || (effectTrackExistence[EffectType.Keystroke] ?? false),
    hasPluginTrack: (getEffectTrackConfig(EffectType.Plugin)?.alwaysShowTrack ?? false) || (effectTrackExistence[EffectType.Plugin] ?? false),
    hasAnnotationTrack: effectTrackExistence[EffectType.Annotation] ?? false,
    isAnnotationExpanded,
    toggleAnnotationExpanded,
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
    timelineWidth, containerSize, totalContentHeight, duration, zoom, pixelsPerMs,
    fixedTrackHeights, fixedTrackPositions, effectTrackHeights, effectTrackPositions,
    effectTrackExistence, trackHeights, trackPositions, mediaTrackExistence,
    isScreenGroupCollapsed, hasSpeedUpSuggestions, showTypingSuggestions,
    isAnnotationExpanded, toggleAnnotationExpanded,
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
