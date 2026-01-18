/**
 * Timeline Selectors
 *
 * Centralized selectors for timeline-related state.
 * Design: React hooks that derive state from the project store.
 */

import { useMemo } from 'react'
import { useProjectStore, type ProjectStore } from '../project-store'
import { EffectType, TrackType } from '@/types/project'
import type { Effect } from '@/types/project'
import { EFFECT_TRACK_TYPES } from '@/features/ui/timeline/effect-track-registry'
// PERF: Import at module level instead of inside useMemo to avoid dynamic import overhead
import { TimelineConfig } from '@/features/ui/timeline/config'

// PERF: Narrow selectors to only trigger on specific array changes, not any project change
// CRITICAL: Use constant empty arrays to avoid infinite loop in useSyncExternalStore
const EMPTY_EFFECTS: Effect[] = []
const EMPTY_TRACKS: { type: TrackType; clips: { id: string }[] }[] = []

const selectEffects = (s: ProjectStore): Effect[] =>
  s.currentProject?.timeline?.effects ?? EMPTY_EFFECTS

const selectTracks = (s: ProjectStore) =>
  s.currentProject?.timeline?.tracks ?? EMPTY_TRACKS

/**
 * Get all timeline effects from the current project.
 * Single source of truth.
 */
export function useTimelineEffects(): Effect[] {
  // PERF: Only re-run when effects array reference changes
  return useProjectStore(selectEffects)
}

/**
 * PERF: Get effects of a specific type only.
 * Components using this will only re-render when effects of that type change.
 * Use this instead of useTimelineEffects() + filter for better performance.
 */
export function useEffectsOfType(type: EffectType): Effect[] {
  const effects = useProjectStore(selectEffects)
  return useMemo(() => {
    // Some effects need enabled check for display purposes
    const needsEnabledCheck = [EffectType.Zoom, EffectType.Screen, EffectType.Crop, EffectType.Background].includes(type)
    return effects.filter(e => e.type === type && (needsEnabledCheck ? e.enabled : true))
  }, [effects, type])
}

// PERF: Set for O(1) lookup of types that need enabled check
const NEEDS_ENABLED_CHECK = new Set([EffectType.Zoom, EffectType.Screen, EffectType.Crop, EffectType.Background])

/**
 * Get effects grouped by type.
 * Returns a Record for flexible access.
 * PERF: Single-pass grouping O(n) instead of O(n*m) filtering per type.
 */
export function useEffectsByType(): Record<EffectType, Effect[]> {
  const effects = useTimelineEffects()

  return useMemo(() => {
    // Initialize all types with empty arrays
    const grouped = Object.fromEntries(
      Object.values(EffectType).map(t => [t, [] as Effect[]])
    ) as Record<EffectType, Effect[]>

    // Single pass through effects
    for (const e of effects) {
      const needsCheck = NEEDS_ENABLED_CHECK.has(e.type)
      if (!needsCheck || e.enabled) {
        grouped[e.type].push(e)
      }
    }
    return grouped
  }, [effects])
}

/**
 * Check if any effects exist for effect-track types.
 * Automatically derived from the registry.
 */
export function useEffectTrackExistence(): Record<EffectType, boolean> {
  const effectsByType = useEffectsByType()

  return useMemo(() => {
    const existence: Record<string, boolean> = {}
    for (const type of EFFECT_TRACK_TYPES) {
      existence[type] = effectsByType[type]?.length > 0
    }
    // Annotation track is rendered with a custom component (not in registry),
    // but still needs existence/visibility flags in layout + controls.
    existence[EffectType.Annotation] = (effectsByType[EffectType.Annotation]?.length ?? 0) > 0
    return existence as Record<EffectType, boolean>
  }, [effectsByType])
}

/**
 * PERF: Dedicated selector for crop track existence.
 * Avoids expensive useEffectsByType() call when only checking crop.
 */
export function useHasCropTrack(): boolean {
  const effects = useTimelineEffects()
  return useMemo(() =>
    effects.some(e => e.type === EffectType.Crop && e.enabled),
  [effects])
}

/**
 * Track existence flags for non-effect tracks (webcam, audio, etc.).
 * Effect track existence is handled by useEffectTrackExistence.
 */
export interface MediaTrackExistence {
  hasWebcamTrack: boolean
  hasCropTrack: boolean
  hasAudioContent: boolean
  hasWebcamContent: boolean
}

export function useMediaTrackExistence(): MediaTrackExistence {
  // PERF: Use granular selector instead of full project subscription
  const tracks = useProjectStore(selectTracks)
  // PERF: Use dedicated selector instead of full useEffectsByType()
  const hasCropTrack = useHasCropTrack()

  const hasWebcamTrack = useMemo(() => {
    return tracks.some(t => t.type === TrackType.Webcam)
  }, [tracks])

  const { hasAudioContent, hasWebcamContent } = useMemo(() => {
    const audioTrack = tracks.find(t => t.type === TrackType.Audio)
    const webcamTrack = tracks.find(t => t.type === TrackType.Webcam)
    return {
      hasAudioContent: (audioTrack?.clips?.length ?? 0) > 0,
      hasWebcamContent: (webcamTrack?.clips?.length ?? 0) > 0
    }
  }, [tracks])

  return useMemo(() => ({
    hasWebcamTrack,
    hasCropTrack,
    hasAudioContent,
    hasWebcamContent
  }), [hasWebcamTrack, hasCropTrack, hasAudioContent, hasWebcamContent])
}

/**
 * Get the timeline duration.
 * Timeline-Centric: uses raw timeline.duration (no collapsing)
 */
export function useTimelineDuration(): number {
  return useProjectStore((s) => s.currentProject?.timeline.duration ?? 0)
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

/**
 * Calculate the total content height for the timeline based on visible tracks.
 * Used by workspace-manager for auto-fit height calculation.
 * 
 * This mirrors the logic in timeline-layout-provider.tsx but can be consumed
 * at any level of the component tree.
 */
export function useTimelineContentHeight(): number {
  const effectTrackExistence = useEffectTrackExistence()
  const mediaTrackExistence = useMediaTrackExistence()
  const effectCounts = useEffectCounts()

  return useMemo(() => {
    let height = 0

    // Ruler
    height += TimelineConfig.RULER_HEIGHT

    // Video track (always visible when project exists)
    height += TimelineConfig.TRACK.VIDEO_HEIGHT

    // Audio track (nested under video, visible when video expanded - we assume expanded for max height)
    height += TimelineConfig.TRACK.AUDIO_HEIGHT

    // Webcam track
    if (mediaTrackExistence.hasWebcamTrack) {
      height += TimelineConfig.TRACK.WEBCAM_HEIGHT
    }

    // Effect tracks - use collapsed height for each present track
    for (const type of EFFECT_TRACK_TYPES) {
      if (effectTrackExistence[type]) {
        height += TimelineConfig.TRACK.EFFECT_COLLAPSED
      }
    }

    // Annotation track gets special treatment - header + single collapsed row
    if (effectTrackExistence[EffectType.Annotation]) {
      // Header (20) + collapsed row height (always 1 row when collapsed)
      height += 20 + TimelineConfig.TRACK.EFFECT_COLLAPSED
    }

    // Bottom padding
    height += TimelineConfig.SCROLL.BOTTOM_PADDING

    return height
  }, [effectTrackExistence, mediaTrackExistence, effectCounts])
}

