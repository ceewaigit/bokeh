/**
 * Store Slice Utilities
 *
 * Shared helper functions used by multiple slices.
 * These are extracted to prevent duplication and ensure consistency.
 */

import type { ProjectStore } from './types'
import { DEFAULT_STORE_SETTINGS } from '@/features/core/settings/defaults'
import { playbackService } from '@/features/playback/services/playback-service'

/**
 * Reset selection and zoom state when switching projects.
 * Used by newProject, setProject, and openProject to maintain consistent behavior.
 */
export function resetSelectionState(state: ProjectStore): void {
  state.selectedClips = []
  state.selectedEffectLayer = null
  state.zoomManuallyAdjusted = false
  state.currentTime = playbackService.seek(0, 0)
  // Note: playhead state is now computed via usePlayheadState() hook - no need to update here
}

/**
 * Default settings for new stores.
 * Used by the core slice for initial state.
 */
export const DEFAULT_SETTINGS: ProjectStore['settings'] = DEFAULT_STORE_SETTINGS
