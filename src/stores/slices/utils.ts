/**
 * Store Slice Utilities
 *
 * Shared helper functions used by multiple slices.
 * These are extracted to prevent duplication and ensure consistency.
 */

import type { ProjectStore } from './types'

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
 * Default settings for new stores.
 * Used by the core slice for initial state.
 */
export const DEFAULT_SETTINGS: ProjectStore['settings'] = {
  showTypingSuggestions: true,
  audio: {
    volume: 100,
    muted: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
    enhanceAudio: false
  },
  preview: {
    showRuleOfThirds: false,
    showCenterGuides: false,
    showSafeZones: false,
    guideColor: 'rgba(255, 255, 255, 0.5)',
    guideOpacity: 0.5,
    safeZoneMargin: 10
  },
  editing: {
    snapToGrid: true,
    showWaveforms: false,
    autoRipple: true
  },
  playback: { previewSpeed: 1 },
  camera: {
    motionBlurEnabled: true,
    motionBlurIntensity: 40,
    motionBlurThreshold: 30,
    refocusBlurEnabled: true,
    refocusBlurIntensity: 40
  }
}
