/**
 * Store Slice Utilities
 *
 * Shared helper functions used by multiple slices.
 * These are extracted to prevent duplication and ensure consistency.
 */

import type { ProjectStore } from './types'
import { QualityLevel, ExportFormat, type Project } from '@/types/project'

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
  state.currentTime = 0
  // Note: playhead state is now computed via usePlayheadState() hook - no need to update here
}

/**
 * Synchronize project settings to the store settings state.
 * Used when loading or setting a project to ensure UI reflects the project's configuration.
 */
export function syncProjectSettingsToStore(state: ProjectStore, project: Project): void {
  if (!project.settings) return

  // Sync unified settings
  if (project.settings.resolution) {
    state.settings.resolution = project.settings.resolution
  }
  if (project.settings.frameRate) {
    state.settings.framerate = project.settings.frameRate
  }

  // Sync nested settings (shallow merge properties)
  if (project.settings.audio) {
    Object.assign(state.settings.audio, project.settings.audio)
  }
  if (project.settings.camera) {
    Object.assign(state.settings.camera, project.settings.camera)
  }
}

/**
 * Default settings for new stores.
 * Used by the core slice for initial state.
 */
export const DEFAULT_SETTINGS: ProjectStore['settings'] = {
  quality: QualityLevel.High,
  resolution: { width: 1920, height: 1080 },
  framerate: 60,
  format: ExportFormat.MP4,

  showTypingSuggestions: true,
  audio: {
    volume: 100,
    muted: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
    enhanceAudio: false
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
  },
  recording: {
    lowMemoryEncoder: false,
    useMacOSDefaults: true,
    includeAppWindows: false
  }
}
