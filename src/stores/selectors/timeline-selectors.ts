/**
 * Timeline Selectors
 *
 * Centralized selectors for timeline-related state.
 * Design: React hooks that derive state from the project store.
 */

import { useMemo } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { EffectStore } from '@/lib/core/effects'
import { EffectType, TrackType } from '@/types/project'
import type { Effect } from '@/types/project'

/**
 * Get all timeline effects from the current project.
 * Single source of truth - uses EffectStore.
 */
export function useTimelineEffects(): Effect[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    return EffectStore.getAll(project)
  }, [project])
}

/**
 * Effects grouped by type.
 * Cached derivation to avoid repeated filtering.
 */
export interface EffectsByType {
  zoom: Effect[]
  screen: Effect[]
  keystroke: Effect[]
  plugin: Effect[]
  crop: Effect[]
  background: Effect[]
  cursor: Effect[]
}

export function useEffectsByType(): EffectsByType {
  const effects = useTimelineEffects()

  return useMemo(() => ({
    zoom: effects.filter(e => e.type === EffectType.Zoom && e.enabled),
    screen: effects.filter(e => e.type === EffectType.Screen && e.enabled),
    keystroke: effects.filter(e => e.type === EffectType.Keystroke),
    plugin: effects.filter(e => e.type === EffectType.Plugin),
    crop: effects.filter(e => e.type === EffectType.Crop && e.enabled),
    background: effects.filter(e => e.type === EffectType.Background && e.enabled),
    cursor: effects.filter(e => e.type === EffectType.Cursor)
  }), [effects])
}

/**
 * Track existence flags.
 * Used to conditionally render timeline tracks.
 */
export interface TrackExistence {
  hasZoomTrack: boolean
  hasScreenTrack: boolean
  hasKeystrokeTrack: boolean
  hasPluginTrack: boolean
  hasCropTrack: boolean
  hasWebcamTrack: boolean
}

export function useTrackExistence(): TrackExistence {
  const { zoom, screen, keystroke, plugin, crop } = useEffectsByType()
  const project = useProjectStore((s) => s.currentProject)

  // Check if project has a webcam track (show even when empty for drop zone)
  const hasWebcamTrack = useMemo(() => {
    if (!project?.timeline?.tracks) return false
    const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)
    return !!webcamTrack
  }, [project?.timeline?.tracks])

  return useMemo(() => ({
    hasZoomTrack: zoom.length > 0,
    hasScreenTrack: screen.length > 0,
    hasKeystrokeTrack: keystroke.length > 0,
    hasPluginTrack: plugin.length > 0,
    hasCropTrack: crop.length > 0,
    hasWebcamTrack
  }), [zoom.length, screen.length, keystroke.length, plugin.length, crop.length, hasWebcamTrack])
}

/**
 * Get the timeline duration.
 */
export function useTimelineDuration(): number {
  return useProjectStore((s) => s.currentProject?.timeline?.duration ?? 0)
}

/**
 * Get the project FPS.
 */
export function useProjectFps(): number {
  return useProjectStore((s) => s.currentProject?.settings?.frameRate ?? 60)
}

/**
 * Get effects that are active at a specific time.
 */
export function useActiveEffectsAtTime(timeMs: number): Effect[] {
  const effects = useTimelineEffects()

  return useMemo(() => {
    return effects.filter(
      e => e.enabled !== false &&
        e.startTime <= timeMs &&
        e.endTime > timeMs
    )
  }, [effects, timeMs])
}

/**
 * Get the count of effects by type.
 * Useful for UI indicators.
 */
export function useEffectCounts(): Record<EffectType, number> {
  const effects = useTimelineEffects()

  return useMemo(() => {
    const counts: Record<string, number> = {}
    for (const type of Object.values(EffectType)) {
      counts[type] = effects.filter(e => e.type === type).length
    }
    return counts as Record<EffectType, number>
  }, [effects])
}
