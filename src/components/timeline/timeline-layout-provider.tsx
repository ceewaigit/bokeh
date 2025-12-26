'use client'

/**
 * TimelineLayoutProvider
 *
 * Provides timeline layout values via context.
 * Track heights are calculated as percentages of container height
 * for responsive behavior.
 */

import React, { createContext, useContext, useMemo, useState, useEffect, useRef, type RefObject } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { useTrackExistence, useTimelineDuration } from '@/stores/selectors/timeline-selectors'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'

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

// Group header height constant
const SCREEN_GROUP_HEADER_HEIGHT = 24

/**
 * Calculate fixed track heights.
 * Uses fixed sizes to allow content overflow for scrolling.
 */
function calculateTrackHeights(
  _containerHeight: number, // Kept for API compatibility but unused
  trackExistence: {
    hasZoomTrack: boolean
    hasScreenTrack: boolean
    hasKeystrokeTrack: boolean
    hasPluginTrack: boolean
    hasWebcamTrack: boolean
  },
  hasSpeedUpSuggestions: { typing: boolean; idle: boolean },
  showTypingSuggestions: boolean,
  isScreenGroupCollapsed: boolean
): TrackHeights {
  const { hasZoomTrack, hasScreenTrack, hasKeystrokeTrack, hasPluginTrack, hasWebcamTrack } = trackExistence
  const hasSuggestions = hasSpeedUpSuggestions.typing || hasSpeedUpSuggestions.idle

  const rulerHeight = TimelineConfig.RULER_HEIGHT
  const speedUpBarSpace = (showTypingSuggestions && hasSuggestions) ? 24 : 0
  const screenGroupHeaderHeight = SCREEN_GROUP_HEADER_HEIGHT

  // Use FIXED heights - no proportional scaling
  // This allows content to overflow for scrolling
  const videoHeight = TimelineConfig.MIN_VIDEO_TRACK_HEIGHT || 80
  const audioHeight = isScreenGroupCollapsed ? 0 : (TimelineConfig.MIN_AUDIO_TRACK_HEIGHT || 50)
  const effectHeight = TimelineConfig.MIN_EFFECT_TRACK_HEIGHT || 36
  const webcamHeight = hasWebcamTrack ? 50 : 0

  return {
    ruler: rulerHeight,
    speedUpBarSpace,
    screenGroupHeader: screenGroupHeaderHeight,
    video: videoHeight,
    audio: audioHeight,
    webcam: webcamHeight,
    zoom: hasZoomTrack && !isScreenGroupCollapsed ? effectHeight : 0,
    screen: hasScreenTrack && !isScreenGroupCollapsed ? effectHeight : 0,
    keystroke: hasKeystrokeTrack && !isScreenGroupCollapsed ? effectHeight : 0,
    plugin: hasPluginTrack && !isScreenGroupCollapsed ? effectHeight : 0
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
  const { hasZoomTrack, hasScreenTrack, hasKeystrokeTrack, hasPluginTrack, hasWebcamTrack } = trackExistence

  let y = 0
  const rulerY = y
  y += trackHeights.ruler

  // Screen Group Header
  const screenGroupHeaderY = y
  y += trackHeights.screenGroupHeader

  // Screen Group Content (Video, effects, Audio)
  const videoY = y
  y += trackHeights.video + trackHeights.speedUpBarSpace

  const zoomY = y
  if (hasZoomTrack && !isScreenGroupCollapsed) y += trackHeights.zoom

  const screenY = y
  if (hasScreenTrack && !isScreenGroupCollapsed) y += trackHeights.screen

  const keystrokeY = y
  if (hasKeystrokeTrack && !isScreenGroupCollapsed) y += trackHeights.keystroke

  const pluginY = y
  if (hasPluginTrack && !isScreenGroupCollapsed) y += trackHeights.plugin

  const audioY = y
  if (!isScreenGroupCollapsed) y += trackHeights.audio

  // Webcam Track (separate from screen group)
  const webcamY = y

  return {
    ruler: rulerY,
    screenGroupHeader: screenGroupHeaderY,
    video: videoY,
    zoom: zoomY,
    screen: screenY,
    keystroke: keystrokeY,
    plugin: pluginY,
    audio: audioY,
    webcam: webcamY
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

  const zoom = useProjectStore((s) => s.zoom)
  const showTypingSuggestions = useProjectStore((s) => s.settings.showTypingSuggestions)
  const currentProject = useProjectStore((s) => s.currentProject)
  const duration = useTimelineDuration()
  const trackExistence = useTrackExistence()

  const toggleScreenGroupCollapsed = React.useCallback(() => {
    setIsScreenGroupCollapsed(prev => !prev)
  }, [])

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

  // Calculate track heights as percentages of container
  const trackHeights = useMemo(
    () => calculateTrackHeights(containerSize.height, trackExistence, hasSpeedUpSuggestions, showTypingSuggestions, isScreenGroupCollapsed),
    [containerSize.height, trackExistence, hasSpeedUpSuggestions, showTypingSuggestions, isScreenGroupCollapsed]
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

  useEffect(() => {
    let rafId: number | null = null

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerSize({ width: rect.width, height: rect.height })
      }
    }

    const scheduleUpdate = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        updateSize()
      })
    }

    updateSize()
    window.addEventListener('resize', scheduleUpdate)

    return () => {
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
    containerRef
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
    toggleScreenGroupCollapsed
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
