/**
 * Project Store
 *
 * Main Zustand store composed from focused slices.
 * Each slice handles a specific domain of functionality.
 *
 * Slices:
 * - core-slice: Project lifecycle, settings, recordings
 * - timeline-slice: Clip & Effect operations (merged)
 * - selection-slice: Selection state, clipboard
 * - playback-slice: Playback controls, zoom
 * - cache-slice: Centralized caching (camera path, frame layout)
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createCoreSlice } from './slices/core-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createPlaybackSlice } from './slices/playback-slice'
import { createTimelineSlice } from './slices/timeline-slice'
import { createCacheSlice } from './slices/cache-slice'
import { createSettingsSlice } from './slices/settings-slice'
import { createProgressSlice } from './slices/progress-slice'
import type { ProjectStore } from './slices/types'

const cacheInvalidationMiddleware =
  <T extends ProjectStore>(config: (set: any, get: any, api: any) => T) =>
    (set: any, get: any, api: any) =>
      config(
        (args: any, replace?: boolean) => {
          const prevTimeline = get().currentProject?.timeline
          const prevRecordings = get().currentProject?.recordings
          const prevEffects = get().currentProject?.effects

          set(args, replace)

          const nextTimeline = get().currentProject?.timeline
          const nextRecordings = get().currentProject?.recordings
          const nextEffects = get().currentProject?.effects

          if (
            prevTimeline !== nextTimeline ||
            prevRecordings !== nextRecordings ||
            prevEffects !== nextEffects
          ) {
            get().invalidateAllCaches()
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
      ...createProgressSlice(...a),
    }))
  )
)

// Derived selector: selectedClipId is always the last item in selectedClips
// This replaces the redundant selectedClipId state field
export const useSelectedClipId = () =>
  useProjectStore((state) => state.selectedClips[state.selectedClips.length - 1] ?? null)

// Re-export types for convenience
export type { ProjectStore } from './slices/types'
