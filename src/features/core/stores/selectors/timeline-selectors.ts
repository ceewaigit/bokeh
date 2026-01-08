/**
 * Timeline Selectors
 *
 * Centralized selectors for timeline-related state.
 * Design: React hooks that derive state from the project store.
 */

import { useMemo } from 'react'
import { useProjectStore } from '../project-store'
import { EffectStore } from '@/features/effects/core/store'
import { EffectType, TrackType } from '@/types/project'
import type { Effect } from '@/types/project'
import { EFFECT_TRACK_TYPES } from '@/features/ui/timeline/effect-track-registry'

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
 * Get effects grouped by type.
 * Returns a Record for flexible access.
 */
export function useEffectsByType(): Record<EffectType, Effect[]> {
  const effects = useTimelineEffects()

  return useMemo(() => {
    const grouped: Record<string, Effect[]> = {}
    for (const type of Object.values(EffectType)) {
      // Some effects need enabled check, some don't
      const needsEnabledCheck = [EffectType.Zoom, EffectType.Screen, EffectType.Crop, EffectType.Background].includes(type)
      grouped[type] = effects.filter(e =>
        e.type === type && (needsEnabledCheck ? e.enabled : true)
      )
    }
    return grouped as Record<EffectType, Effect[]>
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
  const project = useProjectStore((s) => s.currentProject)
  const effectsByType = useEffectsByType()

  const hasWebcamTrack = useMemo(() => {
    if (!project?.timeline?.tracks) return false
    return project.timeline.tracks.some(t => t.type === TrackType.Webcam)
  }, [project?.timeline?.tracks])

  const { hasAudioContent, hasWebcamContent } = useMemo(() => {
    if (!project?.timeline?.tracks) return { hasAudioContent: false, hasWebcamContent: false }
    const audioTrack = project.timeline.tracks.find(t => t.type === TrackType.Audio)
    const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)
    return {
      hasAudioContent: (audioTrack?.clips?.length ?? 0) > 0,
      hasWebcamContent: (webcamTrack?.clips?.length ?? 0) > 0
    }
  }, [project?.timeline?.tracks])

  return useMemo(() => ({
    hasWebcamTrack,
    hasCropTrack: effectsByType[EffectType.Crop]?.length > 0,
    hasAudioContent,
    hasWebcamContent
  }), [hasWebcamTrack, effectsByType, hasAudioContent, hasWebcamContent])
}

/**
 * Combined track existence - for backwards compatibility.
 * Prefer using useEffectTrackExistence + useMediaTrackExistence directly.
 */
export interface TrackExistence extends MediaTrackExistence {
  hasZoomTrack: boolean
  hasScreenTrack: boolean
  hasKeystrokeTrack: boolean
  hasPluginTrack: boolean
  hasAnnotationTrack: boolean
}

export function useTrackExistence(): TrackExistence {
  const effectTrackExistence = useEffectTrackExistence()
  const mediaTrackExistence = useMediaTrackExistence()

  return useMemo(() => ({
    hasZoomTrack: effectTrackExistence[EffectType.Zoom] ?? false,
    hasScreenTrack: effectTrackExistence[EffectType.Screen] ?? false,
    hasKeystrokeTrack: effectTrackExistence[EffectType.Keystroke] ?? false,
    hasPluginTrack: effectTrackExistence[EffectType.Plugin] ?? false,
    hasAnnotationTrack: effectTrackExistence[EffectType.Annotation] ?? false,
    ...mediaTrackExistence
  }), [effectTrackExistence, mediaTrackExistence])
}

/**
 * Get the timeline duration.
 * Timeline-Centric: uses raw timeline.duration (no collapsing)
 */
export function useTimelineDuration(): number {
  return useProjectStore((s) => s.currentProject?.timeline.duration ?? 0)
}

/**
 * Get the project FPS.
 */
export function useProjectFps(): number {
  return useProjectStore((s) => s.currentProject?.settings.frameRate ?? 60)
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
  const { TimelineConfig } = require('@/features/ui/timeline/config')

  return useMemo(() => {
    // Import config lazily to avoid circular dependency at module level
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

    // Annotation track gets special treatment - header + rows
    if (effectTrackExistence[EffectType.Annotation]) {
      const annotationCount = effectCounts[EffectType.Annotation] ?? 0
      // Header (20) + collapsed row height
      height += 20 + TimelineConfig.TRACK.EFFECT_COLLAPSED * Math.max(1, annotationCount > 1 ? 1 : 1)
    }

    // Bottom padding
    height += TimelineConfig.SCROLL.BOTTOM_PADDING

    return height
  }, [effectTrackExistence, mediaTrackExistence, effectCounts, TimelineConfig])
}

