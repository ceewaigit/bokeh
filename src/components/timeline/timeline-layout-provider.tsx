'use client'

/**
 * TimelineLayoutProvider
 *
 * Provides timeline layout values via context.
 * Track heights are calculated as percentages of container height
 * for responsive behavior.
 */

import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { useTrackExistence, useTimelineDuration } from '@/stores/selectors/timeline-selectors'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { TimelineTrackType } from '@/types/project'

// Track height constants - effect tracks use FIXED pixel heights
const TRACK_HEIGHT_COLLAPSED = 28 // Effect track collapsed height
const TRACK_HEIGHT_EXPANDED = 45 // Effect track expanded height (60% larger)
const TRACK_HEIGHT_VIDEO_MAX = 80 // Video track maximum height
const TRACK_HEIGHT_AUDIO_MAX = 40 // Audio track maximum height

export interface TrackHeights {
  ruler: number
  speedUpBarSpace: number
  video: number
  audio: number
  webcam: number
  zoom: number
  screen: number
  keystroke: number
  plugin: number
  screenGroupHeader: number
}

export interface TrackPositions {
  ruler: number
  screenGroupHeader: number
  video: number
  zoom: number
  screen: number
  keystroke: number
  plugin: number
  audio: number
  webcam: number
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
  trackHeights: TrackHeights
  trackPositions: TrackPositions
  hasZoomTrack: boolean
  hasScreenTrack: boolean
  hasKeystrokeTrack: boolean
  hasPluginTrack: boolean
  hasCropTrack: boolean
  hasWebcamTrack: boolean
  isScreenGroupCollapsed: boolean
  hasSpeedUpSuggestions: { typing: boolean; idle: boolean }
  showTypingSuggestions: boolean
  toggleScreenGroupCollapsed: () => void
  containerRef: RefObject<HTMLDivElement>
  // Track visibility & active state
  visibleTracks: Set<TimelineTrackType>
  activeTrack: TimelineTrackType | null
  toggleTrackVisibility: (track: TimelineTrackType) => void
  setActiveTrack: (track: TimelineTrackType | null) => void
  isTrackExpanded: (track: TimelineTrackType) => boolean
  toggleEffectTrackExpanded: (track: TimelineTrackType) => void
  toggleVideoTrackExpanded: () => void
  isVideoTrackExpanded: boolean
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

// Screen group header height removed - cleaner layout without it

/**
 * Calculate track heights to fill available container space.
 * 
 * Strategy:
 * - Effect tracks use FIXED heights (compact, consistent)
 * - Video/Audio tracks proportionally fill remaining space
 * - Active effect track gets 30% taller
 */
function calculateTrackHeights(
  containerHeight: number,
  trackExistence: {
    hasZoomTrack: boolean
    hasScreenTrack: boolean
    hasKeystrokeTrack: boolean
    hasPluginTrack: boolean
    hasWebcamTrack: boolean
  },
  hasSpeedUpSuggestions: { typing: boolean; idle: boolean },
  showTypingSuggestions: boolean,
  isScreenGroupCollapsed: boolean,
  visibleTracks: Set<TimelineTrackType>,
  isVideoTrackExpanded: boolean,
  expandedEffectTrack: TimelineTrackType | null
): TrackHeights {
  const { hasZoomTrack, hasScreenTrack, hasKeystrokeTrack, hasPluginTrack } = trackExistence
  const hasSuggestions = hasSpeedUpSuggestions.typing || hasSpeedUpSuggestions.idle

  const rulerHeight = TimelineConfig.RULER_HEIGHT
  const speedUpBarSpace = (showTypingSuggestions && hasSuggestions) ? 24 : 0
  const screenGroupHeaderHeight = 0

  // Track visibility
  const videoVisible = visibleTracks.has(TimelineTrackType.Video)
  const audioVisible = visibleTracks.has(TimelineTrackType.Audio) && !isScreenGroupCollapsed && isVideoTrackExpanded
  const webcamVisible = visibleTracks.has(TimelineTrackType.Webcam)
  const zoomVisible = hasZoomTrack && !isScreenGroupCollapsed && visibleTracks.has(TimelineTrackType.Zoom)
  const screenVisible = hasScreenTrack && !isScreenGroupCollapsed && visibleTracks.has(TimelineTrackType.Screen)
  const keystrokeVisible = hasKeystrokeTrack && !isScreenGroupCollapsed && visibleTracks.has(TimelineTrackType.Keystroke)
  const pluginVisible = hasPluginTrack && !isScreenGroupCollapsed && visibleTracks.has(TimelineTrackType.Plugin)

  // Effect tracks use FIXED pixel heights (not proportional)
  const getEffectHeight = (trackType: TimelineTrackType): number => {
    const isActive = expandedEffectTrack === trackType
    return isActive ? TRACK_HEIGHT_EXPANDED : TRACK_HEIGHT_COLLAPSED
  }

  // Calculate fixed effect track heights
  const webcamHeight = webcamVisible ? getEffectHeight(TimelineTrackType.Webcam) : 0
  const zoomHeight = zoomVisible ? getEffectHeight(TimelineTrackType.Zoom) : 0
  const screenHeight = screenVisible ? getEffectHeight(TimelineTrackType.Screen) : 0
  const keystrokeHeight = keystrokeVisible ? getEffectHeight(TimelineTrackType.Keystroke) : 0
  const pluginHeight = pluginVisible ? getEffectHeight(TimelineTrackType.Plugin) : 0

  // Fixed overhead (ruler, speedup bar, all effect tracks)
  const fixedHeight = rulerHeight + speedUpBarSpace + screenGroupHeaderHeight +
    webcamHeight + zoomHeight + screenHeight + keystrokeHeight + pluginHeight

  // Remaining space for video and audio tracks
  const remainingHeight = Math.max(0, containerHeight - fixedHeight)

  // Video/Audio proportionally share remaining space, capped at max heights
  let videoWeight = videoVisible ? 2 : 0
  let audioWeight = audioVisible ? 1 : 0
  const totalWeight = videoWeight + audioWeight || 1

  const videoHeight = videoVisible ? Math.min(TRACK_HEIGHT_VIDEO_MAX, Math.floor(remainingHeight * (videoWeight / totalWeight))) : 0
  const audioHeight = audioVisible ? Math.min(TRACK_HEIGHT_AUDIO_MAX, Math.floor(remainingHeight * (audioWeight / totalWeight))) : 0

  return {
    ruler: rulerHeight,
    speedUpBarSpace,
    screenGroupHeader: screenGroupHeaderHeight,
    video: videoHeight,
    audio: audioHeight,
    webcam: webcamHeight,
    zoom: zoomHeight,
    screen: screenHeight,
    keystroke: keystrokeHeight,
    plugin: pluginHeight
  }
}

/**
 * Calculate track Y positions based on heights.
 */
function calculateTrackPositions(
  trackHeights: TrackHeights,
  trackExistence: {
    hasZoomTrack: boolean
    hasScreenTrack: boolean
    hasKeystrokeTrack: boolean
    hasPluginTrack: boolean
    hasWebcamTrack: boolean
  },
  isScreenGroupCollapsed: boolean
): TrackPositions {
  const { hasZoomTrack, hasScreenTrack, hasKeystrokeTrack, hasPluginTrack } = trackExistence

  let y = 0
  const rulerY = y
  y += trackHeights.ruler

  // Screen group header removed for cleaner layout
  const screenGroupHeaderY = y

  // Video track starts directly after ruler
  const videoY = y
  y += trackHeights.video + trackHeights.speedUpBarSpace

  // Audio/Webcam sub-tracks directly under video (before effects)
  const audioY = y
  y += trackHeights.audio

  const webcamY = y
  y += trackHeights.webcam

  // Effect tracks below sub-tracks
  const zoomY = y
  if (hasZoomTrack && !isScreenGroupCollapsed) y += trackHeights.zoom

  const screenY = y
  if (hasScreenTrack && !isScreenGroupCollapsed) y += trackHeights.screen

  const keystrokeY = y
  if (hasKeystrokeTrack && !isScreenGroupCollapsed) y += trackHeights.keystroke

  const pluginY = y
  if (hasPluginTrack && !isScreenGroupCollapsed) y += trackHeights.plugin

  return {
    ruler: rulerY,
    screenGroupHeader: screenGroupHeaderY,
    video: videoY,
    audio: audioY,
    webcam: webcamY,
    zoom: zoomY,
    screen: screenY,
    keystroke: keystrokeY,
    plugin: pluginY
  }
}

function detectSpeedUpSuggestions(project: { recordings?: Array<{ metadata?: { detectedTypingPeriods?: unknown[]; detectedIdlePeriods?: unknown[] } }> } | null): { typing: boolean; idle: boolean } {
  if (!project?.recordings) return { typing: false, idle: false }

  let hasTyping = false
  let hasIdle = false

  for (const recording of project.recordings) {
    const typingPeriods = recording.metadata?.detectedTypingPeriods
    const idlePeriods = recording.metadata?.detectedIdlePeriods

    if (typingPeriods && typingPeriods.length > 0) hasTyping = true
    if (idlePeriods && idlePeriods.length > 0) hasIdle = true

    if (hasTyping && hasIdle) break
  }

  return { typing: hasTyping, idle: hasIdle }
}

export function TimelineLayoutProvider({ children }: TimelineLayoutProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 300 })
  const [isScreenGroupCollapsed, setIsScreenGroupCollapsed] = useState(false)

  // Track visibility - which tracks are shown (all visible by default)
  const [visibleTracks, setVisibleTracks] = useState<Set<TimelineTrackType>>(() => new Set([
    TimelineTrackType.Video,
    TimelineTrackType.Audio,
    TimelineTrackType.Webcam,
    TimelineTrackType.Zoom,
    TimelineTrackType.Screen,
    TimelineTrackType.Keystroke,
    TimelineTrackType.Plugin
  ]))

  // Active track - which track is currently being interacted with (expanded)
  const [activeTrack, setActiveTrack] = useState<TimelineTrackType | null>(null)
  const [expandedEffectTrack, setExpandedEffectTrack] = useState<TimelineTrackType | null>(null)
  const [isVideoTrackExpanded, setIsVideoTrackExpanded] = useState(false)

  const zoom = useProjectStore((s) => s.zoom)
  const showTypingSuggestions = useProjectStore((s) => s.settings.showTypingSuggestions)
  const currentProject = useProjectStore((s) => s.currentProject)
  const duration = useTimelineDuration()
  const trackExistence = useTrackExistence()

  const toggleScreenGroupCollapsed = useCallback(() => {
    setIsScreenGroupCollapsed(prev => !prev)
  }, [])

  const toggleTrackVisibility = useCallback((track: TimelineTrackType) => {
    setVisibleTracks(prev => {
      const next = new Set(prev)
      if (next.has(track)) {
        next.delete(track)
      } else {
        next.add(track)
      }
      return next
    })
  }, [])

  const setActiveTrackWithEffectMemory = useCallback((track: TimelineTrackType | null) => {
    setActiveTrack(track)
    if (!track) return
    if (track !== TimelineTrackType.Video && track !== TimelineTrackType.Audio) {
      setExpandedEffectTrack(track)
    }
  }, [])

  const toggleEffectTrackExpanded = useCallback((track: TimelineTrackType) => {
    setExpandedEffectTrack((prev) => (prev === track ? null : track))
  }, [])

  const toggleVideoTrackExpanded = useCallback(() => {
    setIsVideoTrackExpanded((prev) => !prev)
  }, [])

  // Check if track should be expanded (either active or has content and is visible)
  const isTrackExpanded = useCallback((track: TimelineTrackType): boolean => {
    if (!visibleTracks.has(track)) return false
    if (track === TimelineTrackType.Video || track === TimelineTrackType.Audio) return true
    if (expandedEffectTrack === track) return true
    // Always expand video/audio tracks
    return false
  }, [visibleTracks, expandedEffectTrack])

  const hasSpeedUpSuggestions = useMemo(
    () => detectSpeedUpSuggestions(currentProject),
    [currentProject]
  )

  const pixelsPerMs = useMemo(
    () => TimeConverter.calculatePixelsPerMs(containerSize.width, zoom),
    [containerSize.width, zoom]
  )

  const timelineWidth = useMemo(
    () => TimeConverter.calculateTimelineWidth(duration, pixelsPerMs, containerSize.width),
    [duration, pixelsPerMs, containerSize.width]
  )

  // Calculate track heights based on visibility and active state
  const trackHeights = useMemo(
    () => calculateTrackHeights(
      containerSize.height,
      trackExistence,
      hasSpeedUpSuggestions,
      showTypingSuggestions,
      isScreenGroupCollapsed,
      visibleTracks,
      isVideoTrackExpanded,
      expandedEffectTrack
    ),
    [
      containerSize.height,
      trackExistence,
      hasSpeedUpSuggestions,
      showTypingSuggestions,
      isScreenGroupCollapsed,
      visibleTracks,
      isVideoTrackExpanded,
      expandedEffectTrack
    ]
  )

  const trackPositions = useMemo(
    () => calculateTrackPositions(trackHeights, trackExistence, isScreenGroupCollapsed),
    [trackHeights, trackExistence, isScreenGroupCollapsed]
  )

  // Calculate total content height from track heights
  const contentHeight = useMemo(() => {
    const totalTrackHeight =
      trackHeights.ruler +
      trackHeights.screenGroupHeader +
      trackHeights.speedUpBarSpace +
      trackHeights.video +
      trackHeights.audio +
      trackHeights.webcam +
      trackHeights.zoom +
      trackHeights.screen +
      trackHeights.keystroke +
      trackHeights.plugin
    return totalTrackHeight
  }, [trackHeights])

  // Use ResizeObserver for accurate container size detection
  // This catches parent layout changes (workspace manager resize), not just window resize
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

    // Initial size
    updateSize()

    // ResizeObserver for layout changes (panels resizing, etc.)
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(container)

    // Also listen to window resize as fallback
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  const value = useMemo<TimelineLayoutContextValue>(() => ({
    stageWidth: Math.max(timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH, containerSize.width),
    stageHeight: Math.max(containerSize.height, contentHeight),
    containerHeight: containerSize.height,
    containerWidth: containerSize.width,
    timelineWidth,
    duration,
    zoom,
    pixelsPerMs,
    trackHeights,
    trackPositions,
    hasZoomTrack: trackExistence.hasZoomTrack,
    hasScreenTrack: trackExistence.hasScreenTrack,
    hasKeystrokeTrack: trackExistence.hasKeystrokeTrack,
    hasPluginTrack: trackExistence.hasPluginTrack,
    hasCropTrack: trackExistence.hasCropTrack,
    hasWebcamTrack: trackExistence.hasWebcamTrack,
    isScreenGroupCollapsed,
    hasSpeedUpSuggestions,
    showTypingSuggestions,
    toggleScreenGroupCollapsed,
    containerRef,
    // Track visibility & active state
    visibleTracks,
    activeTrack,
    toggleTrackVisibility,
    setActiveTrack: setActiveTrackWithEffectMemory,
    isTrackExpanded,
    toggleEffectTrackExpanded,
    toggleVideoTrackExpanded,
    isVideoTrackExpanded
  }), [
    timelineWidth,
    containerSize,
    contentHeight,
    duration,
    zoom,
    pixelsPerMs,
    trackHeights,
    trackPositions,
    trackExistence,
    isScreenGroupCollapsed,
    hasSpeedUpSuggestions,
    showTypingSuggestions,
    toggleScreenGroupCollapsed,
    visibleTracks,
    activeTrack,
    toggleTrackVisibility,
    isTrackExpanded,
    setActiveTrackWithEffectMemory,
    toggleEffectTrackExpanded,
    toggleVideoTrackExpanded,
    isVideoTrackExpanded
  ])

  return (
    <TimelineLayoutContext.Provider value={value}>
      <div
        ref={containerRef}
        className="h-full w-full"
      >
        {children}
      </div>
    </TimelineLayoutContext.Provider>
  )
}
