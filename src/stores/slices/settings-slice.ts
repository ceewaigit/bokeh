/**
 * Settings Slice
 *
 * Manages application settings with clear separation:
 * - UI PREFERENCES: Only in state.settings (not saved with project)
 * - PROJECT SETTINGS: Synced to project.settings (saved with project)
 *
 * The sync helper ensures project settings stay in sync without duplicated logic.
 */
import type { CreateSettingsSlice } from './types'
import type { ProjectStore } from './types'

/**
 * Settings that are persisted with the project file.
 * These are synced from state.settings → project.settings.
 */
type ProjectPersistedSettings = {
  resolution?: { width: number; height: number }
  framerate?: number
  audio?: Partial<ProjectStore['settings']['audio']>
  camera?: Partial<ProjectStore['settings']['camera']>
}

/**
 * Sync persisted settings from state.settings to project.settings.
 * Call this after updating state.settings for project-specific settings.
 */
function syncToProject(state: ProjectStore, updates: ProjectPersistedSettings): void {
  if (!state.currentProject) return

  let didSync = false

  if (updates.resolution) {
    state.currentProject.settings.resolution = updates.resolution
    didSync = true
  }

  if (updates.framerate !== undefined) {
    state.currentProject.settings.frameRate = updates.framerate
    didSync = true
  }

  if (updates.audio) {
    state.currentProject.settings.audio = {
      ...state.currentProject.settings.audio,
      ...updates.audio
    }
    didSync = true
  }

  if (updates.camera) {
    state.currentProject.settings.camera = {
      ...state.currentProject.settings.camera,
      ...updates.camera
    }
    didSync = true
  }

  if (didSync) {
    state.currentProject.modifiedAt = new Date().toISOString()
  }
}

export const createSettingsSlice: CreateSettingsSlice = (set, _get) => ({
  // =========================================================================
  // UI PREFERENCES (not synced to project)
  // =========================================================================

  setQuality: (quality) => set((state) => {
    state.settings.quality = quality
  }),

  setFormat: (format) => set((state) => {
    state.settings.format = format
  }),

  setEditingSettings: (updates) => set((state) => {
    Object.assign(state.settings.editing, updates)
  }),

  setRecordingSettings: (updates) => set((state) => {
    Object.assign(state.settings.recording, updates)
  }),

  // =========================================================================
  // PROJECT SETTINGS (synced to project.settings)
  // =========================================================================

  setResolution: (width, height) => set((state) => {
    const resolution = { width, height }
    state.settings.resolution = resolution
    syncToProject(state, { resolution })
  }),

  setFramerate: (fps) => set((state) => {
    state.settings.framerate = fps
    syncToProject(state, { framerate: fps })
  }),

  setAudioSettings: (updates) => set((state) => {
    Object.assign(state.settings.audio, updates)
    syncToProject(state, { audio: updates })
  }),

  setCameraSettings: (updates) => set((state) => {
    Object.assign(state.settings.camera, updates)
    syncToProject(state, { camera: updates })
  }),

  // =========================================================================
  // BATCH UPDATE (handles both types)
  // =========================================================================

  updateSettings: (updates) => set((state) => {
    // Apply all updates to state.settings
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        // @ts-ignore - dynamic assignment
        state.settings[key] = value
      }
    })

    // Sync project-persisted settings
    syncToProject(state, {
      resolution: updates.resolution,
      framerate: updates.framerate,
      audio: updates.audio,
      camera: updates.camera
    })
  })
})
