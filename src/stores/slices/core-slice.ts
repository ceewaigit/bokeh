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
import { addRecordingToProject } from '@/features/timeline/timeline-operations'
import { ProjectCleanupService } from '@/features/timeline/project-cleanup'
import { EffectsFactory } from '@/features/effects/effects-factory'
import { ProjectIOService } from '@/lib/storage/project-io-service'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { playbackService } from '@/features/timeline/playback/playback-service'
import { WaveformAnalyzer } from '@/lib/audio/waveform-analyzer'
import { ThumbnailGenerator } from '@/shared/utils/thumbnail-generator'
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
    ProjectCleanupService.cleanupInvalidEffects(project)
    EffectsFactory.ensureGlobalEffects(project)

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
      ProjectCleanupService.cleanupInvalidEffects(project)
      EffectsFactory.ensureGlobalEffects(project)

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
    const { currentProject } = get()
    if (!currentProject) return

    try {
      // Persist store-level settings that affect rendering/export into the project payload.
      // We do this at save-time to avoid making the entire app re-render on every UI slider tick.
      const projectToSave = {
        ...currentProject,
        modifiedAt: new Date().toISOString(),
      }

      // Use ProjectIOService to save the project
      const savedPath = await ProjectIOService.saveProject(projectToSave)
      if (savedPath && savedPath !== currentProject.filePath) {
        set((state) => {
          if (!state.currentProject) return
          state.currentProject.filePath = savedPath
        })
      }
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
      // Clear ephemeral proxy URLs
      state.proxyUrls = {}
      // playhead state is computed, no need to clear
    })

    // Use ProjectIOService to clean up resources
    ProjectIOService.cleanupProjectResources()
  }
})
