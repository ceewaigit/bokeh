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

/**
 * Cache Invalidation Middleware
 * 
 * PERFORMANCE OPTIMIZATION: Only invalidate caches on STRUCTURAL changes.
 * - Structural = tracks array, timeline.effects array
 * - Non-structural = modifiedAt, recordings metadata, settings
 * 
 * This prevents unnecessary cache rebuilds during:
 * - Playback (time updates)
 * - Proxy generation (recording URL updates)  
 * - Project save (modifiedAt updates)
 */
const cacheInvalidationMiddleware =
  <T extends ProjectStore>(config: (set: any, get: any, api: any) => T) =>
    (set: any, get: any, api: any) =>
      config(
        (args: any, replace?: boolean) => {
          const prevTimeline = get().currentProject?.timeline

          set(args, replace)

          const nextTimeline = get().currentProject?.timeline

          // OPTIMIZED: Only invalidate on structural changes
          // tracks or effects arrays changed (Immer produces new refs on mutation)
          const tracksChanged = prevTimeline?.tracks !== nextTimeline?.tracks
          const effectsChanged = prevTimeline?.effects !== nextTimeline?.effects

          if (tracksChanged || effectsChanged) {
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
