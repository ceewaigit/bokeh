/**
 * Clip Selectors
 *
 * Centralized selectors for clip-related state.
 * Uses ClipLookup as the underlying implementation.
 *
 * Design: React hooks that derive clip state from the project store.
 * 
 * Timeline-Centric Architecture:
 * - Clips are NOT sliced based on transcript edits
 * - Hidden regions are handled by the player sync via getGlobalTimelineSkips()
 */

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '../project-store'
import { ClipLookup, type ClipResult } from '@/features/ui/timeline/clips/clip-lookup'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import type { Clip, Recording } from '@/types/project'
import type { FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout'

/**
 * Get all recordings from the current project.
 */
export function useRecordings(): Recording[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    return project.recordings
  }, [project])
}

/**
 * Get all selected clip IDs.
 */
export function useSelectedClipIds(): string[] {
  return useProjectStore((s) => s.selectedClips)
}

/**
 * Get all video clips from the current project.
 */
export function useVideoClips(): Clip[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    return ClipLookup.videoClips(project)
  }, [project])
}

/**
 * Get all audio clips from the current project.
 */
export function useAudioClips(): Clip[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    return ClipLookup.audioClips(project)
  }, [project])
}


/**
 * Get the currently selected clip.
 */
export function useSelectedClip(): ClipResult | null {
  const project = useProjectStore((s) => s.currentProject)
  const selectedClips = useProjectStore((s) => s.selectedClips)

  return useMemo(() => {
    if (!project || selectedClips.length === 0) return null
    const clipId = selectedClips[selectedClips.length - 1]
    return ClipLookup.byId(project, clipId)
  }, [project, selectedClips])
}


/**
 * Get a recording by ID.
 */
/**
 * Get a recording by ID.
 * Optimized to only re-render if the specific recording changes.
 */
export function useRecordingById(recordingId: string | null): Recording | undefined {
  return useProjectStore(useShallow((s) =>
    s.currentProject?.recordings.find((r) => r.id === recordingId)
  ))
}

/**
 * Get the frame layout for video playback.
 * Timeline-Centric: uses raw video clips (no slicing)
 */
export function useFrameLayout(fps: number): FrameLayoutItem[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    // Timeline-Centric: use raw video clips
    const videoClips = TimelineDataService.getVideoClips(project)
    return TimelineDataService.getFrameLayout(project, fps, videoClips)
  }, [project, fps])
}

/**
 * Get source dimensions from the first recording.
 */
export function useSourceDimensions(): { width: number; height: number } {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return { width: 1920, height: 1080 }
    return TimelineDataService.getSourceDimensions(project)
  }, [project])
}

/**
 * Check if there's any video content.
 */
export function useHasVideoContent(): boolean {
  const videoClips = useVideoClips()
  return videoClips.length > 0
}

/**
 * Check if there's any audio content.
 */
export function useHasAudioContent(): boolean {
  const audioClips = useAudioClips()
  return audioClips.length > 0
}

/**
 * Get all clip IDs for the current project.
 */
export function useAllClipIds(): string[] {
  const videoClips = useVideoClips()
  const audioClips = useAudioClips()

  return useMemo(() => {
    return [...videoClips, ...audioClips].map(c => c.id)
  }, [videoClips, audioClips])
}

/**
 * Get the set of dismissed suggestion keys.
 * Returns a Set for O(1) lookup.
 *
 * IMPORTANT: We directly select the dismissedSuggestions array from the store
 * rather than selecting the whole project. This ensures Zustand properly
 * detects changes to the array and triggers re-renders.
 */
export function useDismissedSuggestions(): Set<string> {
  const dismissedSuggestions = useProjectStore(
    (s) => s.currentProject?.timeline.dismissedSuggestions
  )

  return useMemo(() => {
    if (!dismissedSuggestions) return new Set()
    return new Set(dismissedSuggestions)
  }, [dismissedSuggestions])
}
