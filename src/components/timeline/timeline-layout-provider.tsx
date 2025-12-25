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
  zoom: number
  screen: number
  keystroke: number
  plugin: number
}

export interface TrackPositions {
  ruler: number
  video: number
  zoom: number
  screen: number
  keystroke: number
  plugin: number
  audio: number
}

export interface TimelineLayoutContextValue {
  stageWidth: number
  stageHeight: number
  containerHeight: number
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
  hasSpeedUpSuggestions: { typing: boolean; idle: boolean }
  showTypingSuggestions: boolean
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

/**
 * Calculate track heights as percentages of available space.
 * This ensures tracks fill the container responsively.
 */
function calculateTrackHeights(
  containerHeight: number,
  trackExistence: {
    hasZoomTrack: boolean
    hasScreenTrack: boolean
    hasKeystrokeTrack: boolean
    hasPluginTrack: boolean
  },
  hasSpeedUpSuggestions: { typing: boolean; idle: boolean },
  showTypingSuggestions: boolean
): TrackHeights {
  const { hasZoomTrack, hasScreenTrack, hasKeystrokeTrack, hasPluginTrack } = trackExistence
  const hasSuggestions = hasSpeedUpSuggestions.typing || hasSpeedUpSuggestions.idle

  const rulerHeight = TimelineConfig.RULER_HEIGHT
  const speedUpBarSpace = (showTypingSuggestions && hasSuggestions) ? 24 : 0

  // Available height for tracks (excluding ruler and speed-up bar)
  const availableHeight = containerHeight - rulerHeight - speedUpBarSpace

  // Count active tracks
  const effectTrackCount =
    (hasZoomTrack ? 1 : 0) +
    (hasScreenTrack ? 1 : 0) +
    (hasKeystrokeTrack ? 1 : 0) +
    (hasPluginTrack ? 1 : 0)

  // Distribute height more evenly across tracks
  // Video and audio are slightly larger, effect tracks share the rest equally
  const videoPercent = 0.27
  const audioPercent = 0.15
  const effectPercent = effectTrackCount > 0 ? (1 - videoPercent - audioPercent) / effectTrackCount : 0

  const videoHeight = Math.floor(availableHeight * videoPercent)
  const audioHeight = Math.floor(availableHeight * audioPercent)
  const effectHeight = Math.floor(availableHeight * effectPercent)

  return {
    ruler: rulerHeight,
    speedUpBarSpace,
    video: videoHeight,
    audio: audioHeight,
    zoom: hasZoomTrack ? effectHeight : 0,
    screen: hasScreenTrack ? effectHeight : 0,
    keystroke: hasKeystrokeTrack ? effectHeight : 0,
    plugin: hasPluginTrack ? effectHeight : 0
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
  }
): TrackPositions {
  const { hasZoomTrack, hasScreenTrack, hasKeystrokeTrack, hasPluginTrack } = trackExistence

  let y = 0
  const rulerY = y
  y += trackHeights.ruler

  const videoY = y
  y += trackHeights.video + trackHeights.speedUpBarSpace

  const zoomY = y
  if (hasZoomTrack) y += trackHeights.zoom

  const screenY = y
  if (hasScreenTrack) y += trackHeights.screen

  const keystrokeY = y
  if (hasKeystrokeTrack) y += trackHeights.keystroke

  const pluginY = y
  if (hasPluginTrack) y += trackHeights.plugin

  const audioY = y

  return {
    ruler: rulerY,
    video: videoY,
    zoom: zoomY,
    screen: screenY,
    keystroke: keystrokeY,
    plugin: pluginY,
    audio: audioY
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

  const zoom = useProjectStore((s) => s.zoom)
  const showTypingSuggestions = useProjectStore((s) => s.settings.showTypingSuggestions)
  const currentProject = useProjectStore((s) => s.currentProject)
  const duration = useTimelineDuration()
  const trackExistence = useTrackExistence()

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
    () => calculateTrackHeights(containerSize.height, trackExistence, hasSpeedUpSuggestions, showTypingSuggestions),
    [containerSize.height, trackExistence, hasSpeedUpSuggestions, showTypingSuggestions]
  )

  const trackPositions = useMemo(
    () => calculateTrackPositions(trackHeights, trackExistence),
    [trackHeights, trackExistence]
  )

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
    stageHeight: containerSize.height,
    containerHeight: containerSize.height,
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
    hasSpeedUpSuggestions,
    showTypingSuggestions,
    containerRef
  }), [
    timelineWidth,
    containerSize,
    duration,
    zoom,
    pixelsPerMs,
    trackHeights,
    trackPositions,
    trackExistence,
    hasSpeedUpSuggestions,
    showTypingSuggestions
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
