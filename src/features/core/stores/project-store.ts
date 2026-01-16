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
 * - settings-slice: Quality, format, editing preferences
 *
 * Note: Progress state has been moved to useProgressStore for decoupling.
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
  <T extends ProjectStore>(config: StateCreator<T, any, any>): StateCreator<T, any, any> =>
    (set, get, api) =>
      config(
        (args, replace) => {
          const prevTimeline = (get() as ProjectStore).currentProject?.timeline
          // Check if this is a layout-only update BEFORE the mutation
          const isLayoutOnly = (get() as ProjectStore)._layoutOnlyUpdate

          set(args, replace as any)

          const nextTimeline = (get() as ProjectStore).currentProject?.timeline

          // Clear the layout-only flag after mutation is processed
          if (isLayoutOnly) {
            (get() as ProjectStore).setLayoutOnlyUpdate(false)
          }

          // OPTIMIZED: Only invalidate on structural changes
          // tracks or effects arrays changed (Immer produces new refs on mutation)
          const tracksChanged = prevTimeline?.tracks !== nextTimeline?.tracks
          const effectsChanged = prevTimeline?.effects !== nextTimeline?.effects
          const transcriptEditsChanged = prevTimeline?.transcriptEdits !== nextTimeline?.transcriptEdits

          if (tracksChanged) {
            if (isLayoutOnly) {
              // Layout-only change (crop, styling) - only clear caches, no player remount
              (get() as ProjectStore).invalidateCachesOnly()
            } else {
              // Structural track change (clip regeneration) - full invalidation with counter increment
              // This triggers Remotion Player remount to handle new clip IDs
              (get() as ProjectStore).invalidateAllCaches()
            }
          } else if (effectsChanged || transcriptEditsChanged) {
            // Non-structural change (effects, annotations, transcript edits)
            // Only clear caches, no player remount needed
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
