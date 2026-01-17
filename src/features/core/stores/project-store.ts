/**
 * Project Store
 *
 * Main Zustand store composed from focused slices.
 * Each slice handles a specific domain of functionality.
 */

import { create, StateCreator } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createCoreSlice } from './slices/core-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createPlaybackSlice } from './slices/playback-slice'
import { createTimelineSlice } from './slices/timeline-slice'
import { createCacheSlice } from './slices/cache-slice'
import { createSettingsSlice } from './slices/settings-slice'
import type { ProjectStore } from './slices/types'

/** Check if track structure is the same (same clips in same order) */
function isTrackStructureSame(
  prevTracks: { clips: { id: string }[] }[] | undefined,
  nextTracks: { clips: { id: string }[] }[] | undefined
): boolean {
  if (!prevTracks || !nextTracks) return prevTracks === nextTracks
  if (prevTracks.length !== nextTracks.length) return false

  for (let i = 0; i < prevTracks.length; i++) {
    const prevClips = prevTracks[i].clips
    const nextClips = nextTracks[i].clips
    if (prevClips.length !== nextClips.length) return false
    for (let j = 0; j < prevClips.length; j++) {
      if (prevClips[j].id !== nextClips[j].id) return false
    }
  }
  return true
}

/**
 * Middleware that handles automatic cache invalidation on timeline changes.
 *
 * NOTE: Timeline sync (effect synchronization) is now handled INLINE within
 * TimelineCommand.mutate() to ensure sync changes are captured in Immer patches
 * for proper undo/redo support. This middleware only handles cache invalidation.
 */
const cacheInvalidationMiddleware =
  <T extends ProjectStore>(config: StateCreator<T, any, any>): StateCreator<T, any, any> =>
    (set, get, api) =>
      config(
        (args, replace) => {
          const prevTimeline = (get() as ProjectStore).currentProject?.timeline

          set(args, replace as any)

          const state = get() as ProjectStore
          const nextTimeline = state.currentProject?.timeline

          // Skip cache invalidation if timeline unchanged
          if (!prevTimeline || !nextTimeline || prevTimeline === nextTimeline) {
            return
          }

          const tracksRefChanged = prevTimeline.tracks !== nextTimeline.tracks
          const effectsChanged = prevTimeline.effects !== nextTimeline.effects
          const transcriptEditsChanged = prevTimeline.transcriptEdits !== nextTimeline.transcriptEdits

          if (tracksRefChanged) {
            const isStructuralChange = !isTrackStructureSame(prevTimeline?.tracks, nextTimeline?.tracks)
            if (isStructuralChange) {
              (get() as ProjectStore).invalidateAllCaches()
            } else {
              (get() as ProjectStore).invalidateCachesOnly()
            }
          } else if (effectsChanged || transcriptEditsChanged) {
            (get() as ProjectStore).invalidateCachesOnly()
          }
        },
        get,
        api
      )

// Compose all slices into the main store
export const useProjectStore = create<ProjectStore>()(
  cacheInvalidationMiddleware(
    immer((...a) => ({
      ...createCoreSlice(...a),
      ...createTimelineSlice(...a),
      ...createSelectionSlice(...a),
      ...createPlaybackSlice(...a),
      ...createCacheSlice(...a),
      ...createSettingsSlice(...a),
    }))
  )
)

// Derived selector: selectedClipId is always the last item in selectedClips
// This replaces the redundant selectedClipId state field
export const useSelectedClipId = () =>
  useProjectStore((state) => state.selectedClips[state.selectedClips.length - 1] ?? null)

// Re-export types for convenience
export type { ProjectStore } from './slices/types'
