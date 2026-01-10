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

import type { Clip, Recording, Effect, Project } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import { calculateTimelineDuration, reflowClips } from '@/features/ui/timeline/clips/clip-reflow'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { executeSplitClip } from '@/features/ui/timeline/clips/clip-split'
import { executeTrimClipStart, executeTrimClipEnd } from '@/features/ui/timeline/clips/clip-trim'
import { getReorderTarget } from '@/features/ui/timeline/utils/drag-positioning'
import {
    updateClipInTrack,
    addClipToTrack,
    removeClipFromTrack,
    duplicateClipInTrack,
    restoreClipToTrack,
    restoreClipsToTrack
} from '@/features/ui/timeline/clips/clip-crud'
import { ProjectCleanupService } from '@/features/ui/timeline/project-cleanup'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { SpeedUpApplicationService } from '@/features/ui/timeline/speed-up-application'
import { PlayheadService } from '@/features/ui/timeline/playback/playhead-service'
import { playbackService } from '@/features/ui/timeline/playback/playback-service'
import { ProjectStorage } from '@/features/core/storage/project-storage'
import { CursorReturnService } from '@/features/effects/cursor/cursor-return-service'
import { EffectStore } from '@/features/effects/core/store'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import type { CreateTimelineSlice } from './types'

const reflowTimeline = (project: Project): void => {
    EffectInitialization.syncKeystrokeEffects(project)
    TimelineDataService.invalidateCache(project)
}

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
                // Determine if we need to sync keystrokes (only if recording has metadata)
                const recordingId = typeof clipOrRecordingId === 'string' ? clipOrRecordingId : clipOrRecordingId.recordingId
                const recording = state.currentProject.recordings.find(r => r.id === recordingId)

                // Only sync if strictly necessary - this prevents global scan lag on every paste
                if (recording && (recording.metadata?.keyboardEvents?.length || 0) > 0) {
                    EffectInitialization.syncKeystrokeEffects(state.currentProject)
                }

                state.selectedClips = [clip.id]

                // Enable waveforms by default if the recording has audio
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
            project.modifiedAt = new Date().toISOString()


            EffectInitialization.syncKeystrokeEffects(project)

            state.selectedClips = [clip.id]
        })
    },

    addImageClip: ({ imagePath, width, height, durationMs, startTime, syntheticMouseEvents, effects }) => {
        let created: { clip: Clip; recording: Recording } | null = null

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
            project.modifiedAt = new Date().toISOString()


            state.selectedClips = [clip.id]

            const resolvedClip = videoTrack.clips.find(c => c.id === clipId)
            if (resolvedClip) {
                created = { clip: resolvedClip, recording }
            }
        })

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
            state.currentProject.modifiedAt = new Date().toISOString()


            // Sync effects
            EffectInitialization.syncKeystrokeEffects(state.currentProject)
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
                reflowTimeline(state.currentProject)
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

            // Clip timing/position can change; keep derived keystroke blocks aligned.
            EffectInitialization.syncKeystrokeEffects(state.currentProject)


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

            // Clip restoration changes layout; rebuild derived keystroke blocks.
            reflowTimeline(state.currentProject)
        })
    },

    splitClip: (clipId, splitTime) => {
        set((state) => {
            if (!state.currentProject) {
                console.error('splitClip: No current project')
                return
            }

            const result = executeSplitClip(state.currentProject, clipId, splitTime)
            if (!result) {
                return
            }

            const { firstClip } = result

            // Select the left clip to keep focus at the split point
            state.selectedClips = [firstClip.id]

            // Move playhead to just before the split point
            if (state.currentTime >= splitTime) {
                state.currentTime = playbackService.seek(splitTime - 1, state.currentProject.timeline.duration)
            }

            // Clear render caches to prevent stale data after split
            reflowTimeline(state.currentProject)
        })
    },

    trimClipStart: (clipId, newStartTime) => {
        set((state) => {
            if (!state.currentProject) return

            if (!executeTrimClipStart(state.currentProject, clipId, newStartTime)) {
                return
            }

            // Trim changes clip boundaries; rebuild derived keystroke blocks.
            reflowTimeline(state.currentProject)
        })
    },

    trimClipEnd: (clipId, newEndTime) => {
        set((state) => {
            if (!state.currentProject) return

            if (!executeTrimClipEnd(state.currentProject, clipId, newEndTime)) {
                return
            }

            // Trim changes clip boundaries; rebuild derived keystroke blocks.
            reflowTimeline(state.currentProject)
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
            EffectInitialization.syncKeystrokeEffects(state.currentProject)


            // Select the duplicated clip
            state.selectedClips = [newClip.id]
        })

        return newClipId
    },

    reorderClip: (clipId, newIndex) => {
        set((state) => {
            if (!state.currentProject) return

            for (const track of state.currentProject.timeline.tracks) {
                const clipIndex = track.clips.findIndex(c => c.id === clipId)
                if (clipIndex === -1) continue

                const oldRanges = track.clips.map(c => ({
                    id: c.id,
                    startTime: c.startTime,
                    endTime: c.startTime + c.duration
                }))

                if (clipIndex !== newIndex) {
                    // Remove clip from current position
                    const [clip] = track.clips.splice(clipIndex, 1)
                    // Insert at new position
                    track.clips.splice(newIndex, 0, clip)
                }

                // Reflow all clips to ensure contiguity from time 0
                reflowClips(track, 0)

                const newRanges = new Map<string, { startTime: number; endTime: number }>()
                for (const updatedClip of track.clips) {
                    newRanges.set(updatedClip.id, {
                        startTime: updatedClip.startTime,
                        endTime: updatedClip.startTime + updatedClip.duration
                    })
                }

                const deltaByClipId = new Map<string, number>()
                for (const oldRange of oldRanges) {
                    const updatedRange = newRanges.get(oldRange.id)
                    if (!updatedRange) continue
                    const delta = updatedRange.startTime - oldRange.startTime
                    if (delta !== 0) {
                        deltaByClipId.set(oldRange.id, delta)
                    }
                }

                if (track.type === TrackType.Video) {
                    const effects = state.currentProject.timeline.effects ?? []
                    const shiftableTypes = new Set<EffectType>([
                        EffectType.Zoom,
                        EffectType.Screen,
                        EffectType.Plugin,
                        EffectType.Keystroke
                    ])

                    for (const effect of effects) {
                        if (effect.clipId && deltaByClipId.has(effect.clipId)) {
                            const delta = deltaByClipId.get(effect.clipId) ?? 0
                            effect.startTime += delta
                            effect.endTime += delta
                            continue
                        }

                        if (!shiftableTypes.has(effect.type)) continue

                        const owningClip = oldRanges.find(range =>
                            effect.startTime >= range.startTime &&
                            effect.endTime <= range.endTime
                        )
                        if (!owningClip) continue
                        const delta = deltaByClipId.get(owningClip.id)
                        if (!delta) continue

                        effect.startTime += delta
                        effect.endTime += delta
                    }

                    if (effects.length > 0) {
                        state.currentProject.timeline.effects = [...effects]
                    }

                    // Start times changed; rebuild derived keystroke blocks.
                    EffectInitialization.syncKeystrokeEffects(state.currentProject)
                }

                // Force new array reference
                track.clips = [...track.clips]

                // Update timeline duration
                state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
                state.currentProject.modifiedAt = new Date().toISOString()

                break
            }
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
        let result = { affectedClips: [] as string[], originalClips: [] as Clip[], modifiedEffects: [] as Effect[] }

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
            result = SpeedUpApplicationService.applySpeedUpToClip(
                state.currentProject,
                clipId,
                periods,
                speedUpTypes
            )

            // Speed-up can change durations/time-remaps; rebuild derived keystroke blocks.
            EffectInitialization.syncKeystrokeEffects(state.currentProject)

            // Update modified timestamp
            state.currentProject.modifiedAt = new Date().toISOString()

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
                // Clip layout changed; rebuild derived keystroke blocks.
                reflowTimeline(state.currentProject)
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
            state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
            state.currentProject.modifiedAt = new Date().toISOString()

        })
    },

    removeEffect: (effectId) => {
        set((state) => {
            if (!state.currentProject) return

            // Use EffectStore as SSOT for removing effects
            const removed = EffectStore.remove(state.currentProject, effectId)
            if (removed) {
                state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
                state.currentProject.modifiedAt = new Date().toISOString()
            }
        })
    },

    updateEffect: (effectId, updates) => {
        set((state) => {
            if (!state.currentProject) return

            // Use EffectStore as SSOT for updating effects
            const updated = EffectStore.update(state.currentProject, effectId, updates)
            if (updated) {
                state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
                state.currentProject.modifiedAt = new Date().toISOString()
            }
        })
    },

    restoreEffect: (effect: Effect) => {
        set((state) => {
            if (!state.currentProject) return
            // Use force=true to bypass overlap checks during restore
            EffectStore.update(state.currentProject, effect.id, effect, true)
            state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
            state.currentProject.modifiedAt = new Date().toISOString()
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
            import('@/features/ui/timeline/activity-detection/idle-detector'),
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
