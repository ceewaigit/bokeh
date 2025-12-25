/**
 * Core Slice
 *
 * Manages project lifecycle, settings, and recording operations.
 * - Create/open/save projects
 * - Add recordings
 * - Update settings
 * - Project cleanup
 */

import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { addRecordingToProject } from '@/lib/timeline/timeline-operations'
import { ProjectCleanupService } from '@/lib/timeline/project-cleanup'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { ProjectIOService } from '@/lib/storage/project-io-service'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { playbackService } from '@/lib/timeline/playback-service'
import { WaveformAnalyzer } from '@/lib/audio/waveform-analyzer'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { CommandManager } from '@/lib/commands/base/CommandManager'
import type { CreateCoreSlice } from './types'
import { resetSelectionState, DEFAULT_SETTINGS } from './utils'

export const createCoreSlice: CreateCoreSlice = (set, get) => ({
  // State
  currentProject: null,
  settings: DEFAULT_SETTINGS,

  // Actions
  newProject: (name) => {
    set((state) => {
      state.currentProject = ProjectIOService.createNewProject(name)
      resetSelectionState(state)
    })
  },

  setProject: (project) => {
    // Clean up orphaned recordings before setting project
    ProjectCleanupService.cleanupOrphanedRecordings(project)

    set((state) => {
      state.currentProject = project
      resetSelectionState(state)
    })

    // Cache video URLs for all recordings to prevent repeated video-stream requests
    RecordingStorage.cacheVideoUrls(project.recordings || [])
  },

  updateProjectData: (updater) => {
    set((state) => {
      if (state.currentProject) {
        state.currentProject = updater(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()
      }
    })
  },

  openProject: async (projectPath) => {
    try {
      // Use ProjectIOService to load the project
      const project = await ProjectIOService.loadProject(projectPath)

      // Clean up orphaned recordings before setting project
      ProjectCleanupService.cleanupOrphanedRecordings(project)

      // Cache video URLs for all recordings BEFORE setting project
      // This prevents multiple video-stream requests during initial render
      await RecordingStorage.cacheVideoUrls(project.recordings || [])

      set((state) => {
        state.currentProject = project
        resetSelectionState(state)
      })
    } catch (error) {
      console.error('Failed to open project:', error)
      throw error
    }
  },

  saveCurrentProject: async () => {
    const { currentProject, settings } = get()
    if (!currentProject) return

    console.log('[CoreSlice] saveCurrentProject called')

    try {
      // Persist store-level settings that affect rendering/export into the project payload.
      // We do this at save-time to avoid making the entire app re-render on every UI slider tick.
      const projectToSave = {
        ...currentProject,
        settings: {
          ...currentProject.settings,
          audio: {
            ...currentProject.settings.audio,
            ...settings.audio,
          },
          camera: {
            ...currentProject.settings.camera,
            ...settings.camera,
          },
        },
        modifiedAt: new Date().toISOString(),
      }

      // Use ProjectIOService to save the project
      await ProjectIOService.saveProject(projectToSave)
    } catch (error) {
      console.error('Failed to save project:', error)
      throw error
    }
  },

  addRecording: async (recording, videoBlob) => {
    // Load metadata from chunks if needed
    if (recording.folderPath && recording.metadataChunks && (!recording.metadata || Object.keys(recording.metadata).length === 0)) {
      recording.metadata = await RecordingStorage.loadMetadataChunks(
        recording.folderPath,
        recording.metadataChunks
      )
      // Cache the loaded metadata
      RecordingStorage.setMetadata(recording.id, recording.metadata)
    }

    set((state) => {
      if (!state.currentProject) return

      // Use the service to add recording and create clip with effects
      const clip = addRecordingToProject(
        state.currentProject,
        recording,
        EffectsFactory.createInitialEffectsForRecording
      )

      if (clip) {
        // Create blob URL (automatically cached by the manager)
        globalBlobManager.create(videoBlob, `recording-${recording.id}`, 'video')

        state.selectedClips = [clip.id]

        // Enable waveforms by default if the recording has audio
        if (recording.hasAudio) {
          state.settings.editing.showWaveforms = true
        }
      }
    })
  },

  updateSettings: (updates) => {
    set((state) => {
      // Update store settings
      Object.assign(state.settings, updates)

      // Also update project settings if a project is loaded.
      // Only persist settings that are part of the project file format.
      if (state.currentProject) {
        let didPersistToProject = false

        // Deep merge for nested audio settings (persisted)
        if (updates.audio) {
          state.currentProject.settings.audio = {
            ...state.currentProject.settings.audio,
            ...updates.audio
          }
          didPersistToProject = true
        }

        // Note: `settings.preview`, `settings.editing`, `settings.camera`, etc are UI-only for now.
        // Do NOT touch `currentProject` (or `modifiedAt`) for those, otherwise we force expensive rerenders
        // and mark the project as dirty without actually persisting anything.
        if (didPersistToProject) {
          state.currentProject.modifiedAt = new Date().toISOString()
        }
      }
    })
  },

  cleanupProject: () => {
    // Clean up playback
    playbackService.cleanup()

    // MEMORY CLEANUP: Clear all caches to prevent memory accumulation
    // This was causing 9GB+ VTDecoderXPCService memory usage
    WaveformAnalyzer.clearAllCache()
    ThumbnailGenerator.clearAllCache()
    RecordingStorage.clearMetadataCache()

    // Reset store state first so components unmount before we revoke blob URLs
    set((state) => {
      // Clear undo/redo history to release references to old project state
      try {
        CommandManager.getInstance().clearHistory()
      } catch (e) {
        // Ignore if CommandManager not initialized
      }
      state.currentProject = null
      state.currentTime = 0
      state.isPlaying = false
      state.selectedClips = []
      state.selectedEffectLayer = null
      // playhead state is computed, no need to clear
    })

    // Use ProjectIOService to clean up resources
    ProjectIOService.cleanupProjectResources()
  }
})
