/**
 * PROJECT SETTINGS: Stored directly on currentProject.settings (single source)
 */
import type { CreateSettingsSlice } from './types'
import { markProjectModified, clearCameraPathCache } from '../store-utils'

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
    markProjectModified(state)
    clearCameraPathCache(state)
  }),

  setFramerate: (fps) => set((state) => {
    if (!state.currentProject) return
    state.currentProject.settings.frameRate = fps
    markProjectModified(state)
    clearCameraPathCache(state)
  }),

  setAudioSettings: (updates) => set((state) => {
    if (!state.currentProject) return
    Object.assign(state.currentProject.settings.audio, updates)
    markProjectModified(state)
  }),

  setCameraSettings: (updates) => set((state) => {
    if (!state.currentProject) return
    Object.assign(state.currentProject.settings.camera, updates)
    markProjectModified(state)
    clearCameraPathCache(state)
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
