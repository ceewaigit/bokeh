/**
 * Timeline Slice
 *
 * Consolidated slice for all timeline operations:
 * - Clip CRUD (add, remove, update, split, trim)
 * - Timeline effects (add, remove, update, regenerate)
 * - Track management (implicitly via clip ops)
 * - Speed-up effects
 * - Undo/Redo restoration
 */

import { toast } from 'sonner'
import type { Clip, Recording, Effect } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import { calculateTimelineDuration, reflowClips } from '@/features/ui/timeline/clips/clip-reflow'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { getReorderTarget } from '@/features/ui/timeline/utils/drag-positioning'
import {
    updateClipInTrack,
    addClipToTrack,
    removeClipFromTrack,
    restoreClipToTrack,
    restoreClipsToTrack
} from '@/features/ui/timeline/clips/clip-crud'
import { ProjectCleanupService } from '@/features/ui/timeline/project-cleanup'
import { SpeedUpApplicationService } from '@/features/ui/timeline/speed-up-application'
import { PlayheadService } from '@/features/playback/services/playhead-service'
import { playbackService } from '@/features/playback/services/playback-service'
import { ProjectStorage } from '@/features/core/storage/project-storage'
import { CursorReturnService } from '@/features/effects/cursor/cursor-return-service'
import { EffectStore } from '@/features/effects/core/effects-store'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import type { CreateTimelineSlice } from './types'
import { markModified, markProjectModified } from '../store-utils'

// NOTE: Keystroke sync and cache invalidation are handled via TimelineSyncOrchestrator.commit()
// which is called by TimelineCommand after mutations. For direct store actions that don't
// use commands, just invalidate cache - keystroke sync will happen on next operation.

export const createTimelineSlice: CreateTimelineSlice = (set, get) => ({
    // ===========================================================================
    // CLIP ACTIONS
    // ===========================================================================

    addClip: (clipOrRecordingId: Clip | string, startTime?: number, options?: { trackType?: TrackType }) => {
        set((state) => {
            if (!state.currentProject) return

            // Track type should be explicitly provided by caller
            const targetTrackType = options?.trackType

            // Ensure Webcam track exists if we are targeting it
            if (targetTrackType === TrackType.Webcam) {
                const hasWebcamTrack = state.currentProject.timeline.tracks.some(t => t.type === TrackType.Webcam)
                if (!hasWebcamTrack) {
                    state.currentProject.timeline.tracks.push({
                        id: `track-webcam-${Date.now()}`,
                        name: 'Webcam',
                        type: TrackType.Webcam,
                        clips: [],
                        muted: false,
                        locked: false
                    })
                }
            }

            const clip = addClipToTrack(state.currentProject, clipOrRecordingId, startTime, {
                ...options,
                trackType: targetTrackType
            })

            if (clip) {
                // Determine if recording has audio for waveform display
                const recordingId = typeof clipOrRecordingId === 'string' ? clipOrRecordingId : clipOrRecordingId.recordingId
                const recording = state.currentProject.recordings.find(r => r.id === recordingId)

                // NOTE: Keystroke sync handled via commands/middleware
                // Cache invalidation triggers re-render with updated clip
                TimelineDataService.invalidateCache(state.currentProject)

                state.selectedClips = [clip.id]

                // Enable waveforms by default if the recording has audio
                if (recording?.hasAudio) {
                    state.settings.editing.showWaveforms = true
                }
            }
        })
    },

    // ===========================================================================
    // QUICK ADD ACTIONS (Intentionally bypass command pattern)
    // ===========================================================================
    // These actions are for quick, simple operations that:
    // 1. Don't require complex undo (clip can be deleted to "undo")
    // 2. Don't need effect sync (no recording metadata)
    // 3. Are typically auto-generated (plugins, cursor return)
    //
    // Affected actions: addGeneratedClip, addImageClip, addCursorReturnClip

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
            const insertIndex = videoTrack.clips.findIndex((existing) => existing.startTime >= insertTime)
            const safeInsertIndex = insertIndex === -1 ? videoTrack.clips.length : insertIndex

            const clip: Clip = {
                id: `clip-${Date.now()}`,
                recordingId,
                startTime: insertTime,
                duration,
                sourceIn: 0,
                sourceOut: duration
            }

            // Avoid shifting existing clips; generated clips can overlap.
            videoTrack.clips.splice(safeInsertIndex, 0, clip)

            project.timeline.duration = calculateTimelineDuration(project)
            markModified(project)

            // NOTE: Generated clips have no keystroke data - just invalidate cache
            TimelineDataService.invalidateCache(project)

            state.selectedClips = [clip.id]
        })
    },

    addImageClip: ({ imagePath, width, height, durationMs, startTime, syntheticMouseEvents, effects }) => {
        let created: { clip: Clip; recording: Recording } | null = null

        // Capture dimensions before adding to detect canvas size changes
        const currentState = get()
        const prevDimensions = currentState.currentProject
            ? TimelineDataService.getSourceDimensions(currentState.currentProject)
            : null

        set((state) => {
            if (!state.currentProject) return

            const project = state.currentProject
            const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
            if (!videoTrack) return

            const duration = Math.max(100, durationMs ?? 5000) // Default 5 seconds for images
            const recordingId = `image-${Date.now()}`
            const clipId = `clip-${Date.now()}`

            const recording: Recording = {
                id: recordingId,
                filePath: imagePath,
                duration,
                width,
                height,
                frameRate: project.settings.frameRate,
                hasAudio: false,
                effects: effects || [],
                sourceType: 'image',
                imageSource: {
                    imagePath
                },
                syntheticMouseEvents,
                metadata: syntheticMouseEvents ? {
                    mouseEvents: syntheticMouseEvents,
                    keyboardEvents: [],
                    clickEvents: [],
                    scrollEvents: [],
                    screenEvents: []
                } : undefined
            }

            project.recordings.push(recording)

            const insertTime = startTime ?? state.currentTime
            const blocks = videoTrack.clips.map(c => ({ id: c.id, startTime: c.startTime, endTime: c.startTime + c.duration }))
            const { insertIndex } = getReorderTarget(insertTime, blocks)

            const clip: Clip = {
                id: clipId,
                recordingId,
                startTime: insertTime,
                duration,
                sourceIn: 0,
                sourceOut: duration
            }

            videoTrack.clips.splice(insertIndex, 0, clip)
            reflowClips(videoTrack, insertIndex)

            project.timeline.duration = calculateTimelineDuration(project)
            markModified(project)


            state.selectedClips = [clip.id]

            const resolvedClip = videoTrack.clips.find(c => c.id === clipId)
            if (resolvedClip) {
                created = { clip: resolvedClip, recording }
            }
        })

        // Check if canvas dimensions changed after adding the image
        const updatedState = get()
        if (updatedState.currentProject && prevDimensions) {
            const newDimensions = TimelineDataService.getSourceDimensions(updatedState.currentProject)
            if (newDimensions.width !== prevDimensions.width || newDimensions.height !== prevDimensions.height) {
                toast.info(`Canvas updated to ${newDimensions.width}×${newDimensions.height} to fit new media`)
            }
        }

        return created
    },

    addCursorReturnClip: async ({ sourceClipId, durationMs = 2000 } = {}) => {
        const state = get()
        if (!state.currentProject) return

        const fileSystem = {
            saveRecording: window.electronAPI?.saveRecording,
            fileExists: window.electronAPI?.fileExists
        }

        const data = await CursorReturnService.prepareCursorReturn(
            state.currentProject,
            state.currentTime,
            sourceClipId,
            fileSystem,
            durationMs
        )

        if (!data) return

        // Add image clip with freeze frame and synthetic events
        const created = get().addImageClip({
            imagePath: data.imagePath,
            width: data.width,
            height: data.height,
            durationMs: data.durationMs,
            startTime: data.startTime,
            syntheticMouseEvents: data.syntheticEvents,
            effects: []
        })

        if (!created) return

        const clipStart = created.clip.startTime
        const newClipEnd = created.clip.startTime + created.clip.duration

        const clonedEffects = data.effectsToCopy.map(effect => {
            const cloned = {
                ...effect,
                id: `${effect.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                startTime: clipStart,
                endTime: newClipEnd,
                data: effect.data ? { ...effect.data } : effect.data
            } as Effect
            if (effect.type === EffectType.Crop) {
                cloned.clipId = created.clip.id
            }
            return cloned
        })

        if (clonedEffects.length > 0) {
            set((state) => {
                if (!state.currentProject) return
                EffectStore.addMany(state.currentProject, clonedEffects)
            })
        }
    },

    resizeGeneratedClip: (clipId, durationMs) => {
        set((state) => {
            if (!state.currentProject) return

            const result = ClipLookup.byId(state.currentProject, clipId)
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

            // Update clip duration directly
            clip.duration = newDuration
            clip.sourceOut = newDuration

            // Reflow clips in the track to handle ripple
            const clipIndex = track.clips.findIndex(c => c.id === clip.id)
            if (clipIndex !== -1) {
                reflowClips(track, clipIndex)
            }

            // Update timeline metadata
            state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
            markProjectModified(state)

            // NOTE: Generated clips have no keystroke data - just invalidate cache
            TimelineDataService.invalidateCache(state.currentProject)
        })
    },

    removeClip: (clipId) => {
        set((state) => {
            if (!state.currentProject) return

            // Get clip info BEFORE removal to check recording reference
            const clipInfo = ClipLookup.byId(state.currentProject, clipId)
            const recordingIdToCheck = clipInfo?.clip?.recordingId

            if (removeClipFromTrack(state.currentProject, clipId, clipInfo?.track)) {

                // Clear selection if removed clip was selected
                state.selectedClips = state.selectedClips.filter(id => id !== clipId)

                // MEMORY CLEANUP: Check if recording is still referenced by other clips
                if (recordingIdToCheck) {
                    ProjectCleanupService.cleanupUnusedRecordings(state.currentProject, recordingIdToCheck)
                }

                // Always clean up clip-specific resources
                ProjectCleanupService.cleanupClipResources(clipId)

                // Clear render caches to prevent stale data after clip removal
                TimelineDataService.invalidateCache(state.currentProject)
            }
        })
    },

    updateClip: (clipId, updates, options) => {
        set((state) => {
            if (!state.currentProject) return

            // Get clip info before update for playhead tracking
            const result = ClipLookup.byId(state.currentProject, clipId)
            if (!result) return

            // Use the service to update the clip
            if (!updateClipInTrack(state.currentProject, clipId, updates, options, result.track)) {
                console.error('updateClip: Failed to update clip')
                return
            }

            // NOTE: For timing changes, use UpdateClipCommand for proper effect sync
            // This direct store action just invalidates cache
            TimelineDataService.invalidateCache(state.currentProject)

            // Maintain playhead relative position inside the edited clip
            const updatedResult = ClipLookup.byId(state.currentProject, clipId)
            if (updatedResult) {
                const newTime = PlayheadService.trackPlayheadDuringClipEdit(
                    state.currentTime,
                    result.clip,
                    updatedResult.clip
                )
                if (newTime !== null) {
                    state.currentTime = playbackService.seek(newTime, state.currentProject.timeline.duration)
                }
            }

            // Clamp current time inside new timeline bounds
            state.currentTime = playbackService.seek(
                state.currentTime,
                state.currentProject.timeline.duration
            )
        })
    },

    restoreClip: (trackId, clip, index) => {
        set((state) => {
            if (!state.currentProject) return

            // Use the service to restore the clip
            if (!restoreClipToTrack(state.currentProject, trackId, clip, index)) {
                return
            }

            // Clip restoration changes layout; invalidate cache
            TimelineDataService.invalidateCache(state.currentProject)
        })
    },

    // Speed-Up Actions

    applyTypingSpeedToClip: (clipId, periods) => {
        // Convert to unified format and delegate
        const periodsWithType = periods.map(p => ({ ...p, type: 'typing' as const }))
        return get().applySpeedUpToClip(clipId, periodsWithType, ['typing'])
    },

    cacheTypingPeriods: (recordingId, periods) => {
        set((state) => {
            ProjectStorage.cacheAnalysisPeriods(
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

    applySpeedUpToClip: (clipId, periods, speedUpTypes) => {
        let result: { affectedClips: string[]; originalClips: Clip[] } = { affectedClips: [], originalClips: [] }

        set((state) => {
            if (!state.currentProject) {
                console.error('applySpeedUpToClip: No current project')
                return
            }

            // Verify clip exists
            const clipBefore = ClipLookup.byId(state.currentProject, clipId)
            if (!clipBefore) {
                console.error('applySpeedUpToClip: Clip not found:', clipId)
                return
            }

            // Apply speed-up using the unified service
            const speedUpResult = SpeedUpApplicationService.applySpeedUpToClip(
                state.currentProject,
                clipId,
                periods,
                speedUpTypes
            )
            result = {
                affectedClips: speedUpResult.affectedClips,
                originalClips: speedUpResult.originalClips
            }

            // NOTE: Use ApplySpeedUpCommand for full effect sync with undo/redo support
            // This direct store action just invalidates cache
            TimelineDataService.invalidateCache(state.currentProject)

            // Update modified timestamp
            markProjectModified(state)

            // Ensure playhead is within valid range after timeline changes
            const newTimelineDuration = calculateTimelineDuration(state.currentProject)
            if (state.currentTime >= newTimelineDuration) {
                state.currentTime = playbackService.seek(Math.max(0, newTimelineDuration - 1), newTimelineDuration)
            }
        })

        return result
    },

    cacheIdlePeriods: (recordingId, periods) => {
        set((state) => {
            ProjectStorage.cacheAnalysisPeriods(
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

    restoreClipsFromUndo: (trackId, clipIdsToRemove, clipsToRestore) => {
        set((state) => {
            if (!state.currentProject) return

            if (restoreClipsToTrack(state.currentProject, trackId, clipIdsToRemove, clipsToRestore)) {
                // Clip layout changed; invalidate cache
                TimelineDataService.invalidateCache(state.currentProject)
            }
        })
    },

    clearDetectionPeriods: (recordingIds) => {
        set((state) => {
            if (!state.currentProject) return

            for (const recording of state.currentProject.recordings) {
                // If specific recordingIds provided, only clear those
                if (recordingIds && !recordingIds.includes(recording.id)) continue
                if (!recording.metadata) continue

                delete recording.metadata.detectedTypingPeriods
                delete recording.metadata.detectedIdlePeriods
            }
        })
    },

    restoreDetectionPeriods: (periods) => {
        set((state) => {
            if (!state.currentProject) return

            for (const [recordingId, saved] of periods) {
                const recording = state.currentProject.recordings.find(r => r.id === recordingId)
                if (!recording?.metadata) continue

                if (saved.detectedTypingPeriods) {
                    recording.metadata.detectedTypingPeriods = [...saved.detectedTypingPeriods]
                }
                if (saved.detectedIdlePeriods) {
                    recording.metadata.detectedIdlePeriods = [...saved.detectedIdlePeriods]
                }
            }
        })
    },

    // ===========================================================================
    // EFFECT ACTIONS
    // ===========================================================================

    addEffect: (effect) => {
        set((state) => {
            if (!state.currentProject) return

            // Use EffectStore as SSOT for adding effects
            EffectStore.add(state.currentProject, effect)
            // PERF: Effects don't extend timeline duration - only clips do.
            // See calculateTimelineDuration() which only considers clips.
            markProjectModified(state)
        })
    },

    removeEffect: (effectId) => {
        set((state) => {
            if (!state.currentProject) return

            // Use EffectStore as SSOT for removing effects
            const removed = EffectStore.remove(state.currentProject, effectId)
            if (removed) {
                // PERF: Effects don't affect timeline duration
                markProjectModified(state)
            }
        })
    },

    updateEffect: (effectId, updates) => {
        set((state) => {
            if (!state.currentProject) return

            // Use EffectStore as SSOT for updating effects
            const updated = EffectStore.update(state.currentProject, effectId, updates)
            if (updated) {
                // PERF: Effects don't affect timeline duration
                markProjectModified(state)
            }
        })
    },

    restoreEffect: (effect: Effect) => {
        set((state) => {
            if (!state.currentProject) return
            // Use force=true to bypass overlap checks during restore
            EffectStore.update(state.currentProject, effect.id, effect, true)
            // PERF: Effects don't affect timeline duration
            markProjectModified(state)
        })
    },

    getEffectsAtTimeRange: (clipId) => {
        const { currentProject } = get()
        if (!currentProject) return []
        return EffectStore.getAll(currentProject).filter(effect => effect.clipId === clipId)
    },

    regenerateAllEffects: async (config) => {
        const projectSnapshot = get().currentProject
        if (!projectSnapshot) return { trimSuggestions: [] }

        const [
            { regenerateProjectEffects },
            { metadataLoader },
            { IdleActivityDetector }
        ] = await Promise.all([
            import('@/features/effects/logic/effect-applier'),
            import('@/features/core/export/metadata-loader'),
            import('@/features/media/analysis/idle-detector'),
        ])

        let metadataByRecordingId: Map<string, import('@/types/project').RecordingMetadata> | undefined
        try {
            metadataByRecordingId = await metadataLoader.loadAllMetadata(projectSnapshot.recordings || [])
        } catch (error) {
            console.warn('[TimelineSlice] Failed to load metadata for effect regeneration:', error)
        }

        let result: { trimSuggestions: any[] } = { trimSuggestions: [] }

        set((state) => {
            if (state.currentProject) {
                result = regenerateProjectEffects(
                    state.currentProject,
                    IdleActivityDetector,
                    config,
                    metadataByRecordingId
                )
            }
        })

        return result
    }
})
