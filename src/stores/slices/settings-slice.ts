import type { CreateSettingsSlice } from './types'

export const createSettingsSlice: CreateSettingsSlice = (set, _get) => ({
    setQuality: (quality) => set((state) => {
        state.settings.quality = quality
    }),
    setResolution: (width, height) => set((state) => {
        state.settings.resolution = { width, height }
        // Sync to project
        if (state.currentProject) {
            state.currentProject.settings.resolution = { width, height }
            state.currentProject.modifiedAt = new Date().toISOString()
        }
    }),
    setFramerate: (fps) => set((state) => {
        state.settings.framerate = fps
        // Sync to project
        if (state.currentProject) {
            state.currentProject.settings.frameRate = fps
            state.currentProject.modifiedAt = new Date().toISOString()
        }
    }),
    setFormat: (format) => set((state) => {
        state.settings.format = format
    }),

    updateSettings: (updates) => set((state) => {
        // Shallow merge top-level properties
        // We iterate to avoid overwriting with undefined from Partial arguments
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                // @ts-ignore - dynamic assignment
                state.settings[key] = value
            }
        })

        // Sync persisted settings to project
        if (state.currentProject) {
            let didPersist = false

            if (updates.audio) {
                state.currentProject.settings.audio = {
                    ...state.currentProject.settings.audio,
                    ...updates.audio
                }
                didPersist = true
            }

            if (updates.camera) {
                state.currentProject.settings.camera = {
                    ...state.currentProject.settings.camera,
                    ...updates.camera
                }
                didPersist = true
            }

            if (updates.resolution) {
                state.currentProject.settings.resolution = updates.resolution
                didPersist = true
            }

            if (updates.framerate !== undefined) {
                state.currentProject.settings.frameRate = updates.framerate
                didPersist = true
            }

            if (didPersist) {
                state.currentProject.modifiedAt = new Date().toISOString()
            }
        }
    }),

    // Helpers for nested settings
    setAudioSettings: (updates) => set((state) => {
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                // @ts-ignore
                state.settings.audio[key] = value
            }
        })

        if (state.currentProject) {
            // Sync to project
            Object.entries(updates).forEach(([key, value]) => {
                // @ts-ignore
                if (value !== undefined) state.currentProject.settings.audio[key] = value
            })
            state.currentProject.modifiedAt = new Date().toISOString()
        }
    }),

    setEditingSettings: (updates) => set((state) => {
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                // @ts-ignore
                state.settings.editing[key] = value
            }
        })
    }),

    setCameraSettings: (updates) => set((state) => {
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                // @ts-ignore
                state.settings.camera[key] = value
            }
        })

        if (state.currentProject) {
            Object.entries(updates).forEach(([key, value]) => {
                // @ts-ignore
                if (value !== undefined) state.currentProject.settings.camera[key] = value
            })
            state.currentProject.modifiedAt = new Date().toISOString()
        }
    }),

    setRecordingSettings: (updates) => set((state) => {
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                // @ts-ignore
                state.settings.recording[key] = value
            }
        })
    })
})
