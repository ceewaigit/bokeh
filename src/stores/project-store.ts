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
import type { ProjectStore } from './slices/types'

// Compose all slices into the main store
export const useProjectStore = create<ProjectStore>()(
  immer((...a) => ({
    ...createCoreSlice(...a),
    ...createTimelineSlice(...a),
    ...createSelectionSlice(...a),
    ...createPlaybackSlice(...a),
    ...createCacheSlice(...a),
  }))
)

// Derived selector: selectedClipId is always the last item in selectedClips
// This replaces the redundant selectedClipId state field
export const useSelectedClipId = () =>
  useProjectStore((state) => state.selectedClips[state.selectedClips.length - 1] ?? null)

// Re-export types for convenience
export type { ProjectStore } from './slices/types'
