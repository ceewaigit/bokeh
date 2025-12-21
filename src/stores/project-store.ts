import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Clip, Effect, Project, Recording, Track } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import type { ClipboardEffect } from '@/types/stores'
import type { SelectedEffectLayer, EffectLayerType } from '@/types/effects'
import { globalBlobManager } from '@/lib/security/blob-url-manager'

// Import new services
import {
  findClipById,
  executeSplitClip,
  executeTrimClipStart,
  executeTrimClipEnd,
  updateClipInTrack,
  addClipToTrack,
  removeClipFromTrack,
  duplicateClipInTrack,
  addRecordingToProject,
  restoreClipToTrack,
  restoreClipsToTrack,
  calculateTimelineDuration,
  reflowClips
} from '@/lib/timeline/timeline-operations'
import { ProjectCleanupService } from '@/lib/timeline/project-cleanup'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { SpeedUpApplicationService } from '@/lib/timeline/speed-up-application'
import { PlayheadService, type PlayheadState } from '@/lib/timeline/playhead-service'
import { ProjectIOService } from '@/lib/storage/project-io-service'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { playbackService } from '@/lib/timeline/playback-service'
import { WaveformAnalyzer } from '@/lib/audio/waveform-analyzer'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { CommandManager } from '@/lib/commands/base/CommandManager'
import { ClipPositioning } from '@/lib/timeline/clip-positioning'

interface ProjectStore {
  // State
  currentProject: Project | null
  currentTime: number
  isPlaying: boolean
  zoom: number
  zoomManuallyAdjusted: boolean

  // Playhead State (reactive - auto-updates with currentTime)
  playheadClip: Clip | null
  playheadRecording: Recording | null
  nextClip: Clip | null
  nextRecording: Recording | null

  // Selection State
  selectedClipId: string | null
  selectedClips: string[]
  selectedEffectLayer: SelectedEffectLayer
  clipboard: {
    clip?: Clip
    effect?: ClipboardEffect
  }

  // Settings
  settings: {
    showTypingSuggestions: boolean
    // Audio
    audio: {
      volume: number      // 0-200 (percentage)
      muted: boolean
      fadeInDuration: number // seconds
      fadeOutDuration: number // seconds
      enhanceAudio: boolean
      enhancementPreset?: 'off' | 'subtle' | 'balanced' | 'broadcast' | 'custom'
      customEnhancement?: {
        threshold: number
        ratio: number
        attack: number
        release: number
        knee: number
      }
    }
    // Preview Guides
    preview: {
      showRuleOfThirds: boolean
      showCenterGuides: boolean
      showSafeZones: boolean
      guideColor: string
      guideOpacity: number
      safeZoneMargin: number
    }
    // Editing behavior
    editing: {
      snapToGrid: boolean
      showWaveforms: boolean
      autoRipple: boolean
    }
    // Playback
    playback: {
      previewSpeed: number  // 0.5, 1, 2
    }
    // Camera
    camera: {
      motionBlurEnabled: boolean
      motionBlurIntensity: number  // 0-100 (maps to maxBlurRadius 0-6)
      motionBlurThreshold: number  // 0-100 (maps to velocityThreshold 5-25)
      refocusBlurEnabled: boolean  // Camera-like focus pull during zoom transitions
      refocusBlurIntensity: number // 0-100 (default 40)
    }
  }

  // Core Actions
  newProject: (name: string) => void
  openProject: (projectPath: string) => Promise<void>
  saveCurrentProject: () => Promise<void>
  setProject: (project: Project) => void
  updateProjectData: (updater: (project: Project) => Project) => void

  // Recording
  addRecording: (recording: Recording, videoBlob: Blob) => Promise<void>

  // Clip Management
  addClip: (clip: Clip | string, startTime?: number) => void
  addGeneratedClip: (options: { pluginId: string; params?: Record<string, unknown>; durationMs?: number; startTime?: number }) => void
  resizeGeneratedClip: (clipId: string, durationMs: number) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>, options?: { exact?: boolean }) => void
  restoreClip: (trackId: string, clip: Clip, index: number) => void
  selectClip: (clipId: string | null, multi?: boolean) => void
  selectEffectLayer: (type: EffectLayerType, id?: string) => void
  clearEffectSelection: () => void
  clearSelection: () => void
  splitClip: (clipId: string, splitTime: number) => void
  trimClipStart: (clipId: string, newStartTime: number) => void
  trimClipEnd: (clipId: string, newEndTime: number) => void
  duplicateClip: (clipId: string) => string | null
  reorderClip: (clipId: string, newIndex: number) => void

  // Clipboard
  copyClip: (clip: Clip) => void
  copyEffect: (type: EffectType.Zoom | EffectType.Cursor | EffectType.Background, data: any, sourceClipId: string) => void
  clearClipboard: () => void

  // Playback
  play: () => void
  pause: () => void
  seek: (time: number) => void
  setZoom: (zoom: number, isManual?: boolean) => void
  setAutoZoom: (zoom: number) => void

  // Cleanup
  cleanupProject: () => void

  // Effects Management (timeline-global)
  addEffect: (effect: Effect) => void
  removeEffect: (effectId: string) => void
  updateEffect: (effectId: string, updates: Partial<Effect>) => void
  getEffectsAtTimeRange: (clipId: string) => Effect[]  // Gets effects overlapping with clip's time range
  regenerateAllEffects: (config?: import('@/lib/effects/effect-generation-service').EffectGenerationConfig) => Promise<void>  // Regenerate zoom, screen, and keystroke effects from recording data

  // Settings
  updateSettings: (updates: Partial<ProjectStore['settings']>) => void

  // Typing Speed (legacy - use applySpeedUpToClip for new code)
  applyTypingSpeedToClip: (clipId: string, periods: Array<{
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
  }>) => { affectedClips: string[]; originalClips: Clip[] }
  cacheTypingPeriods: (recordingId: string, periods: Array<{
    startTime: number
    endTime: number
    keyCount: number
    averageWpm: number
    suggestedSpeedMultiplier: number
  }>) => void

  // Speed-Up (unified - supports typing, idle, etc.)
  applySpeedUpToClip: (clipId: string, periods: Array<{
    type: 'typing' | 'idle'
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
  }>, speedUpTypes: Array<'typing' | 'idle'>) => { affectedClips: string[]; originalClips: Clip[] }
  cacheIdlePeriods: (recordingId: string, periods: Array<{
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
    confidence: number
  }>) => void

  // Atomic undo for speed-up - restores clips without intermediate reflows
  restoreClipsFromUndo: (trackId: string, clipIdsToRemove: string[], clipsToRestore: Clip[]) => void
}

// Helper to update playhead state using the new PlayheadService
const updatePlayheadState = (state: any) => {
  const prevState: PlayheadState = {
    playheadClip: state.playheadClip,
    playheadRecording: state.playheadRecording,
    nextClip: state.nextClip,
    nextRecording: state.nextRecording
  }

  const newState = PlayheadService.updatePlayheadState(
    state.currentProject,
    state.currentTime,
    prevState
  )

  state.playheadClip = newState.playheadClip
  state.playheadRecording = newState.playheadRecording
  state.nextClip = newState.nextClip
  state.nextRecording = newState.nextRecording
}

// Default metadata structure for recordings
const DEFAULT_METADATA = {
  mouseEvents: [],
  keyboardEvents: [],
  clickEvents: [],
  screenEvents: []
}

// Helper: Reset selection and zoom state when switching projects
// Used by newProject, setProject, and openProject to maintain consistent behavior
function resetSelectionState(state: any): void {
  state.selectedClipId = null
  state.selectedClips = []
  state.selectedEffectLayer = null
  state.zoomManuallyAdjusted = false
  state.currentTime = 0
  updatePlayheadState(state)
}

export const useProjectStore = create<ProjectStore>()(
  immer<ProjectStore>((set, get) => ({
    currentProject: null,
    currentTime: 0,
    isPlaying: false,
    zoom: 0.5,
    zoomManuallyAdjusted: false,

    // Playhead State
    playheadClip: null,
    playheadRecording: null,
    nextClip: null,
    nextRecording: null,

    // Selection State
    selectedClipId: null,
    selectedClips: [],
    selectedEffectLayer: null,
    clipboard: {},

    // Settings
    settings: {
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
        motionBlurIntensity: 40,  // moderate blur
        motionBlurThreshold: 30,  // moderate threshold
        refocusBlurEnabled: true, // camera-like focus pull during zoom
        refocusBlurIntensity: 40  // moderate intensity
      }
    },

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

          state.selectedClipId = clip.id
          state.selectedClips = [clip.id]

          // Enable waveforms by default if the recording has audio
          if (recording.hasAudio) {
            state.settings.editing.showWaveforms = true
          }
        }
      })
    },

    addClip: (clipOrRecordingId, startTime) => {
      set((state) => {
        if (!state.currentProject) return

        const clip = addClipToTrack(state.currentProject, clipOrRecordingId, startTime)

        if (clip) {
          // New clip can change mapping; keep derived keystroke blocks aligned.
          EffectsFactory.syncKeystrokeEffects(state.currentProject)

          state.selectedClipId = clip.id
          state.selectedClips = [clip.id]

          // Update playhead state in case the new clip is at current time
          updatePlayheadState(state)

          // Enable waveforms by default if the recording has audio
          const recordingId = typeof clipOrRecordingId === 'string' ? clipOrRecordingId : clipOrRecordingId.recordingId
          const recording = state.currentProject.recordings.find(r => r.id === recordingId)
          if (recording?.hasAudio) {
            state.settings.editing.showWaveforms = true
          }
        }
      })
    },

    addGeneratedClip: ({ pluginId, params, durationMs, startTime }) => {
      set((state) => {
        if (!state.currentProject) return

        const project = state.currentProject
        const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
        if (!videoTrack) return

        const duration = Math.max(100, durationMs ?? 2000)
        const recordingId = `generated-${pluginId}-${Date.now()}`

        const recording: Recording = {
          id: recordingId,
          filePath: '',
          duration,
          width: project.settings.resolution.width,
          height: project.settings.resolution.height,
          frameRate: project.settings.frameRate,
          hasAudio: false,
          effects: [],
          sourceType: 'generated',
          generatedSource: {
            pluginId,
            params: params ?? {}
          }
        }

        project.recordings.push(recording)

        const insertTime = startTime ?? state.currentTime
        const { insertIndex } = ClipPositioning.getReorderTarget(insertTime, videoTrack.clips)

        const clip: Clip = {
          id: `clip-${Date.now()}`,
          recordingId,
          startTime: insertTime,
          duration,
          sourceIn: 0,
          sourceOut: duration
        }

        videoTrack.clips.splice(insertIndex, 0, clip)
        reflowClips(videoTrack, insertIndex)

        project.timeline.duration = calculateTimelineDuration(project)
        project.modifiedAt = new Date().toISOString()

        EffectsFactory.syncKeystrokeEffects(project)

        state.selectedClipId = clip.id
        state.selectedClips = [clip.id]

        updatePlayheadState(state)
      })
    },

    resizeGeneratedClip: (clipId, durationMs) => {
      set((state) => {
        if (!state.currentProject) return

        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        const { clip, track } = result
        const recording = state.currentProject.recordings.find(r => r.id === clip.recordingId)

        if (!recording || recording.sourceType !== 'generated') {
          console.warn('resizeGeneratedClip: Clip is not a generated source')
          return
        }

        const newDuration = Math.max(100, durationMs)

        // Update recording duration
        recording.duration = newDuration

        // Update clip duration directly (generated clips typically use full duration)
        // We assume generated clips are always playing the full generated content
        clip.duration = newDuration
        clip.sourceOut = newDuration

        // Reflow clips in the track to handle ripple
        const clipIndex = track.clips.findIndex(c => c.id === clip.id)
        if (clipIndex !== -1) {
          reflowClips(track, clipIndex)
        }

        // Update timeline metadata
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()

        // Sync effects
        EffectsFactory.syncKeystrokeEffects(state.currentProject)

        // Update playhead
        updatePlayheadState(state)
      })
    },

    removeClip: (clipId) => {
      set((state) => {
        if (!state.currentProject) return

        // Get clip info BEFORE removal to check recording reference
        const clipInfo = findClipById(state.currentProject, clipId)
        const recordingIdToCheck = clipInfo?.clip?.recordingId

        if (removeClipFromTrack(state.currentProject, clipId, clipInfo?.track)) {
          // Clip removal changes layout; rebuild derived keystroke blocks.
          EffectsFactory.syncKeystrokeEffects(state.currentProject)

          // Clear selection if removed clip was selected
          if (state.selectedClipId === clipId) {
            state.selectedClipId = null
          }
          state.selectedClips = state.selectedClips.filter(id => id !== clipId)

          // Update playhead state in case removed clip was at current time
          updatePlayheadState(state)

          // MEMORY CLEANUP: Check if recording is still referenced by other clips
          // If not, clean up caches to prevent memory accumulation
          if (recordingIdToCheck) {
            ProjectCleanupService.cleanupUnusedRecordings(state.currentProject, recordingIdToCheck)
          }

          // Always clean up clip-specific resources
          ProjectCleanupService.cleanupClipResources(clipId)
        }
      })
    },

    updateClip: (clipId, updates, options) => {
      set((state) => {
        if (!state.currentProject) return

        // Get clip info before update for playhead tracking
        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        // Use the service to update the clip
        if (!updateClipInTrack(state.currentProject, clipId, updates, options, result.track)) {
          console.error('updateClip: Failed to update clip')
          return
        }

        // Clip timing/position can change (drag/trim/etc); keep derived keystroke blocks aligned.
        EffectsFactory.syncKeystrokeEffects(state.currentProject)

        // Maintain playhead relative position inside the edited clip
        const updatedResult = findClipById(state.currentProject, clipId)
        if (updatedResult) {
          const newTime = PlayheadService.trackPlayheadDuringClipEdit(
            state.currentTime,
            result.clip,
            updatedResult.clip
          )
          if (newTime !== null) {
            state.currentTime = newTime
          }
        }

        // Clamp current time inside new timeline bounds to keep preview stable
        state.currentTime = PlayheadService.clampToTimelineBounds(
          state.currentTime,
          state.currentProject.timeline.duration
        )

        // Update playhead state in case the updated clip affects current time
        updatePlayheadState(state)
      })
    },

    // New: Restore a removed clip at a specific index within a track
    restoreClip: (trackId, clip, index) => {
      set((state) => {
        if (!state.currentProject) return

        // Use the service to restore the clip
        if (!restoreClipToTrack(state.currentProject, trackId, clip, index)) {
          return
        }

        // Clip restoration changes layout; rebuild derived keystroke blocks.
        EffectsFactory.syncKeystrokeEffects(state.currentProject)

        // Update playhead state
        updatePlayheadState(state)
      })
    },

    selectClip: (clipId, multi = false) => {
      set((state) => {
        if (!clipId) {
          state.selectedClipId = null
          state.selectedClips = []
          state.selectedEffectLayer = null  // Clear effect selection when clearing clip
          return
        }

        if (multi) {
          const index = state.selectedClips.indexOf(clipId)
          if (index !== -1) {
            state.selectedClips.splice(index, 1)
          } else {
            state.selectedClips.push(clipId)
          }
          state.selectedClipId = state.selectedClips[state.selectedClips.length - 1] || null
        } else {
          state.selectedClipId = clipId
          state.selectedClips = [clipId]
          state.selectedEffectLayer = null  // Clear effect selection when selecting new clip
        }
      })
    },

    selectEffectLayer: (type, id) => {
      set((state) => {
        state.selectedClips = []
        state.selectedClipId = null
        state.selectedEffectLayer = { type, id }
      })
    },

    clearEffectSelection: () => {
      set((state) => {
        state.selectedEffectLayer = null
      })
    },

    clearSelection: () => {
      set((state) => {
        state.selectedClipId = null
        state.selectedClips = []
        state.selectedEffectLayer = null
      })
    },

    splitClip: (clipId, splitTime) => {
      set((state) => {
        if (!state.currentProject) {
          console.error('splitClip: No current project')
          return
        }

        // Note: splitTime is in timeline space (what user sees on UI)
        // executeSplitClip expects timeline-relative position, not clip-relative
        // The conversion to clip-relative happens inside executeSplitClip
        const result = executeSplitClip(state.currentProject, clipId, splitTime)
        if (!result) {
          return
        }

        // Split changes clip boundaries; rebuild derived keystroke blocks.
        EffectsFactory.syncKeystrokeEffects(state.currentProject)

        const { firstClip } = result

        // Select the left clip to keep focus at the split point
        state.selectedClipId = firstClip.id
        state.selectedClips = [firstClip.id]

        // Move playhead to just before the split point to ensure we're in the first clip
        if (state.currentTime >= splitTime) {
          state.currentTime = splitTime - 1
        }

        // Update playhead state to reflect the current clip
        updatePlayheadState(state)
      })
    },

    trimClipStart: (clipId, newStartTime) => {
      set((state) => {
        if (!state.currentProject) return

        // Use the service to execute the trim
        if (!executeTrimClipStart(state.currentProject, clipId, newStartTime)) {
          return
        }

        // Trim changes clip boundaries; rebuild derived keystroke blocks.
        EffectsFactory.syncKeystrokeEffects(state.currentProject)

        // Update playhead state in case trim affects current time
        updatePlayheadState(state)
      })
    },

    trimClipEnd: (clipId, newEndTime) => {
      set((state) => {
        if (!state.currentProject) return

        // Use the service to execute the trim
        if (!executeTrimClipEnd(state.currentProject, clipId, newEndTime)) {
          return
        }

        // Trim changes clip boundaries; rebuild derived keystroke blocks.
        EffectsFactory.syncKeystrokeEffects(state.currentProject)

        // Update playhead state in case trim affects current time
        updatePlayheadState(state)
      })
    },

    duplicateClip: (clipId) => {
      let newClipId: string | null = null

      set((state) => {
        if (!state.currentProject) return

        const newClip = duplicateClipInTrack(state.currentProject, clipId)
        if (!newClip) return

        newClipId = newClip.id

        // Duplicated clips should get matching derived keystroke blocks.
        EffectsFactory.syncKeystrokeEffects(state.currentProject)

        // Select the duplicated clip
        state.selectedClipId = newClip.id
        state.selectedClips = [newClip.id]

        // Update playhead state in case duplication affects current time context
        updatePlayheadState(state)
      })

      return newClipId
    },

    reorderClip: (clipId, newIndex) => {
      set((state) => {
        if (!state.currentProject) return

        for (const track of state.currentProject.timeline.tracks) {
          const clipIndex = track.clips.findIndex(c => c.id === clipId)
          if (clipIndex !== -1 && clipIndex !== newIndex) {
            // Remove clip from current position
            const [clip] = track.clips.splice(clipIndex, 1)
            // No index adjustment needed - newIndex is already the absolute insertion point
            const adjustedIndex = newIndex
            // Insert at new position
            track.clips.splice(adjustedIndex, 0, clip)

            // Reflow all clips to ensure contiguity from time 0
            // reflowClips() preserves array order - it never sorts
            reflowClips(track, 0)

            // Start times changed; rebuild derived keystroke blocks.
            EffectsFactory.syncKeystrokeEffects(state.currentProject)

            // Force new array reference to ensure all consumers get fresh data
            // This breaks any stale references in memoized contexts
            track.clips = [...track.clips]

            // Update timeline duration
            state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
            state.currentProject.modifiedAt = new Date().toISOString()

            // Update playhead state to reflect new clip positions
            updatePlayheadState(state)
            break
          }
        }
      })
    },

    copyClip: (clip) => {
      set((state) => {
        state.clipboard = { clip }
      })
    },

    copyEffect: (type, data, sourceClipId) => {
      set((state) => {
        state.clipboard = { effect: { type, data, sourceClipId } }
      })
    },

    clearClipboard: () => {
      set((state) => {
        state.clipboard = {}
      })
    },

    play: () => {
      const state = get()
      if (!state.currentProject) return

      set({ isPlaying: true })

      playbackService.play(
        state.currentTime,
        state.currentProject.timeline.duration,
        (newTime) => {
          set((state) => {
            state.currentTime = newTime
            updatePlayheadState(state)
          })
        },
        () => {
          set({ isPlaying: false })
        }
      )
    },

    pause: () => {
      playbackService.pause()
      set({ isPlaying: false })
    },

    seek: (time) => {
      set((state) => {
        const duration = state.currentProject?.timeline?.duration || 0
        state.currentTime = playbackService.seek(time, duration)

        // Update playhead state using helper
        updatePlayheadState(state)
      })
    },

    setZoom: (zoom, isManual = true) => {
      set((state) => {
        state.zoom = Math.max(0.1, Math.min(10, zoom))
        if (isManual) {
          state.zoomManuallyAdjusted = true
        }
      })
    },

    setAutoZoom: (zoom) => {
      set((state) => {
        // Only set auto zoom if user hasn't manually adjusted
        if (!state.zoomManuallyAdjusted) {
          state.zoom = Math.max(0.1, Math.min(10, zoom))
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
        state.selectedClipId = null
        state.selectedClips = []
        state.selectedEffectLayer = null
        // Clear playhead state
        state.playheadClip = null
        state.playheadRecording = null
      })

      // Use ProjectIOService to clean up resources
      ProjectIOService.cleanupProjectResources()
    },

    // New: Independent Effects Management
    addEffect: (effect) => {
      set((state) => {
        if (!state.currentProject) return
        EffectsFactory.addEffectToProject(state.currentProject, effect)
        // Update playhead state to refresh recording references
        updatePlayheadState(state)
      })
    },

    removeEffect: (effectId) => {
      set((state) => {
        if (!state.currentProject) return
        EffectsFactory.removeEffectFromProject(state.currentProject, effectId)
        // Update playhead state to refresh recording references
        updatePlayheadState(state)
      })
    },

    updateEffect: (effectId, updates) => {
      set((state) => {
        if (!state.currentProject) return

        // With Immer middleware, we can directly mutate the draft state
        // Immer will handle creating the immutable copy for us
        EffectsFactory.updateEffectInProject(state.currentProject, effectId, updates)

        // Update playhead state to refresh recording references
        updatePlayheadState(state)
      })
    },

    // Gets all effects that overlap with a clip's time range
    // Note: Effects are timeline-global, not clip-owned
    getEffectsAtTimeRange: (clipId) => {
      const { currentProject } = get()
      if (!currentProject) return []
      return EffectsFactory.getEffectsForClip(currentProject, clipId)
    },

    // Settings
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

    // Typing Speed - Legacy wrapper, delegates to unified applySpeedUpToClip
    applyTypingSpeedToClip: (clipId, periods) => {
      // Convert to unified format and delegate
      const periodsWithType = periods.map(p => ({ ...p, type: 'typing' as const }))
      return get().applySpeedUpToClip(clipId, periodsWithType, ['typing'])
    },

    // Cache typing periods for a recording
    cacheTypingPeriods: (recordingId, periods) => {
      set((state) => {
        RecordingStorage.cacheAnalysisPeriods(
          state.currentProject,
          recordingId,
          'detectedTypingPeriods',
          periods,
          p => ({
            startTime: p.startTime,
            endTime: p.endTime,
            keyCount: p.keyCount,
            averageWPM: p.averageWpm,
            suggestedSpeedMultiplier: p.suggestedSpeedMultiplier
          })
        )
      })
    },

    // Unified Speed-Up - Apply speed-up suggestions to a clip (supports typing, idle, etc.)
    applySpeedUpToClip: (clipId, periods, speedUpTypes) => {
      let result = { affectedClips: [] as string[], originalClips: [] as Clip[] }

      set((state) => {
        if (!state.currentProject) {
          console.error('applySpeedUpToClip: No current project')
          return
        }

        // Verify clip exists
        const clipBefore = findClipById(state.currentProject, clipId)
        if (!clipBefore) {
          console.error('applySpeedUpToClip: Clip not found:', clipId)
          return
        }

        // Apply speed-up using the unified service
        result = SpeedUpApplicationService.applySpeedUpToClip(
          state.currentProject,
          clipId,
          periods,
          speedUpTypes
        )

        // Speed-up can change durations/time-remaps; rebuild derived keystroke blocks.
        EffectsFactory.syncKeystrokeEffects(state.currentProject)

        // Update modified timestamp to trigger save button
        state.currentProject.modifiedAt = new Date().toISOString()

        // Ensure playhead is within valid range after timeline changes
        const newTimelineDuration = calculateTimelineDuration(state.currentProject)
        if (state.currentTime >= newTimelineDuration) {
          state.currentTime = Math.max(0, newTimelineDuration - 1)
        }

        // Update playhead state
        updatePlayheadState(state)
      })

      return result
    },

    // Cache idle periods for a recording
    cacheIdlePeriods: (recordingId, periods) => {
      set((state) => {
        RecordingStorage.cacheAnalysisPeriods(
          state.currentProject,
          recordingId,
          'detectedIdlePeriods',
          periods,
          p => ({
            startTime: p.startTime,
            endTime: p.endTime,
            suggestedSpeedMultiplier: p.suggestedSpeedMultiplier,
            confidence: p.confidence
          })
        )
      })
    },

    // Atomic undo for speed-up - removes affected clips and restores originals in ONE update
    // This prevents intermediate reflows that cause incorrect clip positions
    restoreClipsFromUndo: (trackId, clipIdsToRemove, clipsToRestore) => {
      set((state) => {
        if (!state.currentProject) return

        if (restoreClipsToTrack(state.currentProject, trackId, clipIdsToRemove, clipsToRestore)) {
          // Clip layout changed; rebuild derived keystroke blocks.
          EffectsFactory.syncKeystrokeEffects(state.currentProject)

          // Update playhead state
          updatePlayheadState(state)
        }
      })
    },

    // Regenerate all auto-detected effects (zoom, screen, keystroke) from recording data
    regenerateAllEffects: async (config) => {
      const projectSnapshot = get().currentProject
      if (!projectSnapshot) return

      const [{ EffectGenerationService }, { metadataLoader }] = await Promise.all([
        import('@/lib/effects/effect-generation-service'),
        import('@/lib/export/metadata-loader'),
      ])

      let metadataByRecordingId: Map<string, import('@/types/project').RecordingMetadata> | undefined
      try {
        metadataByRecordingId = await metadataLoader.loadAllMetadata(projectSnapshot.recordings || [])
      } catch (error) {
        console.warn('[ProjectStore] Failed to load metadata for effect regeneration:', error)
      }

      set((state) => {
        if (state.currentProject) {
          EffectGenerationService.regenerateAllEffects(state.currentProject, config, metadataByRecordingId)
          updatePlayheadState(state)
        }
      })
    }
  }))
)
