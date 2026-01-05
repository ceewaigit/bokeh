/**
/**
 * PROJECT SETTINGS: Stored directly on currentProject.settings (single source)
 */
import type { CreateSettingsSlice } from './types'

export const createSettingsSlice: CreateSettingsSlice = (set) => ({
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
  // PROJECT SETTINGS (stored directly on project)
  // =========================================================================

  setResolution: (width, height) => set((state) => {
    if (!state.currentProject) return
    state.currentProject.settings.resolution = { width, height }
    state.currentProject.modifiedAt = new Date().toISOString()
    state.cameraPathCache = null
    state.cameraPathCacheDimensions = null
  }),

  setFramerate: (fps) => set((state) => {
    if (!state.currentProject) return
    state.currentProject.settings.frameRate = fps
    state.currentProject.modifiedAt = new Date().toISOString()
    state.cameraPathCache = null
    state.cameraPathCacheDimensions = null
  }),

  setAudioSettings: (updates) => set((state) => {
    if (!state.currentProject) return
    Object.assign(state.currentProject.settings.audio, updates)
    state.currentProject.modifiedAt = new Date().toISOString()
  }),

  setCameraSettings: (updates) => set((state) => {
    if (!state.currentProject) return
    Object.assign(state.currentProject.settings.camera, updates)
    state.currentProject.modifiedAt = new Date().toISOString()
    // Invalidate camera path cache to trigger recalculation
    state.cameraPathCache = null
    state.cameraPathCacheDimensions = null
  }),

  // =========================================================================
  // BATCH UPDATE (UI preferences only)
  // =========================================================================

  updateSettings: (updates) => set((state) => {
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        // @ts-expect-error - dynamic assignment
        state.settings[key] = value
      }
    })
  })
})
