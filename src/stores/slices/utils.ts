/**
 * Store Slice Utilities
 *
 * Shared helper functions used by multiple slices.
 * These are extracted to prevent duplication and ensure consistency.
 */

import type { ProjectStore } from './types'
import type { Project } from '@/types/project'
import { DEFAULT_STORE_SETTINGS } from '@/lib/settings/defaults'
import { normalizeProjectSettings } from '@/lib/settings/normalize-project-settings'

/**
 * CENTRALIZED CACHE INVALIDATION
 * All cache invalidation goes through this single function.
 * When adding new caches, update this function instead of scattering nullifications.
 *
 * Called by: addClip, removeClip, updateClip, splitClip, duplicateClip, reorderClip,
 *            addGeneratedClip, addImageClip, resizeGeneratedClip,
 *            addEffect, removeEffect, updateEffect, regenerateAllEffects
 *
 * NOTE: This pattern (explicit invalidation) was chosen over automatic middleware
 * invalidation because:
 * 1. It's explicit and clear - no magic behind the scenes
 * 2. Not all state changes need cache invalidation
 * 3. Performance - avoids diffing entire state tree on every update
 */
export function invalidateCaches(state: ProjectStore): void {
  state.cameraPathCache = null
  state.frameLayoutCache = null
  state.timelineMutationCounter = (state.timelineMutationCounter ?? 0) + 1
}

/**
 * Reset selection and zoom state when switching projects.
 * Used by newProject, setProject, and openProject to maintain consistent behavior.
 */
export function resetSelectionState(state: ProjectStore): void {
  state.selectedClips = []
  state.selectedEffectLayer = null
  state.zoomManuallyAdjusted = false
  state.currentTime = 0
  // Note: playhead state is now computed via usePlayheadState() hook - no need to update here
}

/**
 * Synchronize project settings to the store settings state.
 * Used when loading or setting a project to ensure UI reflects the project's configuration.
 */
export function syncProjectSettingsToStore(state: ProjectStore, project: Project): void {
  if (!project.settings) return

  const normalized = normalizeProjectSettings(project.settings)

  state.settings.resolution = normalized.resolution
  state.settings.framerate = normalized.frameRate
  Object.assign(state.settings.audio, normalized.audio)
  Object.assign(state.settings.camera, normalized.camera)
}

/**
 * Default settings for new stores.
 * Used by the core slice for initial state.
 */
export const DEFAULT_SETTINGS: ProjectStore['settings'] = DEFAULT_STORE_SETTINGS
