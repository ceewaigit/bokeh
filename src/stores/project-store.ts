/**
 * Project Store
 *
 * Main Zustand store composed from focused slices.
 * Each slice handles a specific domain of functionality.
 *
 * Slices:
 * - core-slice: Project lifecycle, settings, recordings
 * - clip-slice: Clip CRUD, speed-up, undo
 * - selection-slice: Selection state, clipboard
 * - playback-slice: Playback controls, zoom
 * - effects-slice: Effects management, camera path cache
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createCoreSlice } from './slices/core-slice'
import { createClipSlice } from './slices/clip-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createPlaybackSlice } from './slices/playback-slice'
import { createEffectsSlice } from './slices/effects-slice'
import type { ProjectStore } from './slices/types'

// Compose all slices into the main store
export const useProjectStore = create<ProjectStore>()(
  immer((...a) => ({
    ...createCoreSlice(...a),
    ...createClipSlice(...a),
    ...createSelectionSlice(...a),
    ...createPlaybackSlice(...a),
    ...createEffectsSlice(...a),
  }))
)

// Derived selector: selectedClipId is always the last item in selectedClips
// This replaces the redundant selectedClipId state field
export const useSelectedClipId = () =>
  useProjectStore((state) => state.selectedClips[state.selectedClips.length - 1] ?? null)

// Re-export types for convenience
export type { ProjectStore } from './slices/types'
