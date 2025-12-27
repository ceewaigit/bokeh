/**
 * Settings Slice
 *
 * Manages application settings with clear separation:
 * - UI PREFERENCES: Only in state.settings (not saved with project)
 * - PROJECT SETTINGS: Stored directly on currentProject.settings (single source)
 */
import type { CreateSettingsSlice } from './types'

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
  // PROJECT SETTINGS (stored directly on project)
  // =========================================================================

  setResolution: (width, height) => set((state) => {
    if (!state.currentProject) return
    state.currentProject.settings.resolution = { width, height }
    state.currentProject.modifiedAt = new Date().toISOString()
  }),

  setFramerate: (fps) => set((state) => {
    if (!state.currentProject) return
    state.currentProject.settings.frameRate = fps
    state.currentProject.modifiedAt = new Date().toISOString()
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
  }),

  // =========================================================================
  // BATCH UPDATE (UI preferences only)
  // =========================================================================

  updateSettings: (updates) => set((state) => {
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        // @ts-ignore - dynamic assignment
        state.settings[key] = value
      }
    })
  })
})
