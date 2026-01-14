/**
 * Settings Selectors
 *
 * Centralized selectors for settings-related state.
 * Provides clear separation between:
 * - Project settings (persisted with project file)
 * - App preferences (persisted separately in localStorage)
 */

import { useMemo } from 'react'
import { useProjectStore } from '../project-store'
import { DEFAULT_PROJECT_SETTINGS, DEFAULT_CAMERA_SETTINGS } from '@/features/core/settings/defaults'
import type { ProjectSettings } from '@/types/project'
import type { StoreSettings } from '../slices/types'

// =============================================================================
// PROJECT SETTINGS (persisted with project)
// =============================================================================

/**
 * Get camera settings from the current project.
 * Camera settings control motion blur, refocus blur, and camera smoothness.
 */
export function useCameraSettings(): ProjectSettings['camera'] {
  const cameraSettings = useProjectStore((s) => s.currentProject?.settings.camera)
  return cameraSettings ?? DEFAULT_CAMERA_SETTINGS
}

/**
 * Get audio settings from the current project.
 */
export function useAudioSettings(): ProjectSettings['audio'] {
  const audioSettings = useProjectStore((s) => s.currentProject?.settings.audio)
  return audioSettings ?? DEFAULT_PROJECT_SETTINGS.audio
}

/**
 * Get canvas/aspect ratio settings from the current project.
 */
export function useCanvasSettings(): ProjectSettings['canvas'] {
  const canvasSettings = useProjectStore((s) => s.currentProject?.settings.canvas)
  return canvasSettings ?? DEFAULT_PROJECT_SETTINGS.canvas
}

/**
 * Get resolution settings from the current project.
 */
export function useResolutionSettings(): ProjectSettings['resolution'] {
  const resolution = useProjectStore((s) => s.currentProject?.settings.resolution)
  return resolution ?? DEFAULT_PROJECT_SETTINGS.resolution
}

/**
 * Get frame rate from the current project.
 */
export function useFrameRate(): number {
  return useProjectStore((s) => s.currentProject?.settings.frameRate ?? DEFAULT_PROJECT_SETTINGS.frameRate)
}

// =============================================================================
// APP PREFERENCES (persisted separately)
// =============================================================================

/**
 * Get editing preferences (snap, waveforms, ripple).
 */
export function useEditingSettings(): StoreSettings['editing'] {
  return useProjectStore((s) => s.settings.editing)
}

/**
 * Get recording preferences (encoder, defaults, app windows).
 */
export function useRecordingSettings(): StoreSettings['recording'] {
  return useProjectStore((s) => s.settings.recording)
}

/**
 * Get playback preferences (preview speed).
 */
export function usePlaybackSettings(): StoreSettings['playback'] {
  return useProjectStore((s) => s.settings.playback)
}

/**
 * Get export quality setting.
 */
export function useQualitySetting() {
  return useProjectStore((s) => s.settings.quality)
}

/**
 * Get export format setting.
 */
export function useFormatSetting() {
  return useProjectStore((s) => s.settings.format)
}

/**
 * Get typing suggestions setting.
 */
export function useShowTypingSuggestions(): boolean {
  return useProjectStore((s) => s.settings.showTypingSuggestions)
}

// =============================================================================
// DERIVED / CONVENIENCE
// =============================================================================

/**
 * Check if motion blur is enabled.
 * Convenience hook for common check.
 */
export function useMotionBlurEnabled(): boolean {
  const cameraSettings = useCameraSettings()
  return cameraSettings.motionBlurEnabled ?? false
}

/**
 * Check if refocus blur is enabled.
 * Convenience hook for common check.
 */
export function useRefocusBlurEnabled(): boolean {
  const cameraSettings = useCameraSettings()
  return cameraSettings.refocusBlurEnabled ?? false
}

/**
 * Get all project settings as a single object.
 * Use sparingly - prefer specific selectors to avoid unnecessary re-renders.
 */
export function useProjectSettings(): ProjectSettings | null {
  return useProjectStore((s) => s.currentProject?.settings ?? null)
}
