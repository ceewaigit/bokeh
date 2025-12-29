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

import type { Clip, Recording, Effect } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import {
    findClipById,
    executeSplitClip,
    executeTrimClipStart,
    executeTrimClipEnd,
    updateClipInTrack,
    addClipToTrack,
    removeClipFromTrack,
    duplicateClipInTrack,
    restoreClipToTrack,
    restoreClipsToTrack,
    calculateTimelineDuration,
    reflowClips,
    syncCropEffectTimes
} from '@/features/timeline/timeline-operations'
import { ProjectCleanupService } from '@/features/timeline/project-cleanup'
import { EffectsFactory } from '@/features/effects/effects-factory'
import { SpeedUpApplicationService } from '@/features/timeline/speed-up-application'
import { PlayheadService } from '@/features/timeline/playback/playhead-service'
import { RecordingStorage, resolveProjectRoot } from '@/lib/storage/recording-storage'
import { ClipPositioning } from '@/features/timeline/clips/clip-positioning'
import { CursorReturnService } from '@/lib/cursor/cursor-return-service'
import { EffectStore } from '@/lib/core/effects'
import { TimelineDataService } from '@/features/timeline/timeline-data-service'
import type { CreateTimelineSlice } from './types'

export const createTimelineSlice: CreateTimelineSlice = (set, get) => ({
    // ===========================================================================
    // CLIP ACTIONS
    // ===========================================================================

    addClip: (clipOrRecordingId, startTime) => {
        set((state) => {
            if (!state.currentProject) return

            const clip = addClipToTrack(state.currentProject, clipOrRecordingId, startTime)

            if (clip) {
                // Determine if we need to sync keystrokes (only if recording has metadata)
                const recordingId = typeof clipOrRecordingId === 'string' ? clipOrRecordingId : clipOrRecordingId.recordingId
                const recording = state.currentProject.recordings.find(r => r.id === recordingId)

                // Only sync if strictly necessary - this prevents global scan lag on every paste
                if (recording && (recording.metadata?.keyboardEvents?.length || 0) > 0) {
                    EffectsFactory.syncKeystrokeEffects(state.currentProject)
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
            const { insertIndex } = ClipPositioning.getReorderTarget(insertTime, videoTrack.clips)

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
            EffectsFactory.syncKeystrokeEffects(state.currentProject)
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
            const result = findClipById(state.currentProject, clipId)
            if (!result) return

            // Use the service to update the clip
            if (!updateClipInTrack(state.currentProject, clipId, updates, options, result.track)) {
                console.error('updateClip: Failed to update clip')
                return
            }

            // Clip timing/position can change; keep derived keystroke blocks aligned.
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

            // Clamp current time inside new timeline bounds
            state.currentTime = PlayheadService.clampToTimelineBounds(
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
            EffectsFactory.syncKeystrokeEffects(state.currentProject)

            // Clear render caches to ensure fresh lookups after restoration
            TimelineDataService.invalidateCache(state.currentProject)
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

            // Split changes clip boundaries; rebuild derived keystroke blocks.
            EffectsFactory.syncKeystrokeEffects(state.currentProject)


            const { firstClip } = result

            // Select the left clip to keep focus at the split point
            state.selectedClips = [firstClip.id]

            // Move playhead to just before the split point
            if (state.currentTime >= splitTime) {
                state.currentTime = splitTime - 1
            }

            // Clear render caches to prevent stale data after split
            TimelineDataService.invalidateCache(state.currentProject)
        })
    },

    trimClipStart: (clipId, newStartTime) => {
        set((state) => {
            if (!state.currentProject) return

            if (!executeTrimClipStart(state.currentProject, clipId, newStartTime)) {
                return
            }

            // Trim changes clip boundaries; rebuild derived keystroke blocks.
            EffectsFactory.syncKeystrokeEffects(state.currentProject)

            // Clear render caches after trim operation
            TimelineDataService.invalidateCache(state.currentProject)
        })
    },

    trimClipEnd: (clipId, newEndTime) => {
        set((state) => {
            if (!state.currentProject) return

            if (!executeTrimClipEnd(state.currentProject, clipId, newEndTime)) {
                return
            }

            // Trim changes clip boundaries; rebuild derived keystroke blocks.
            EffectsFactory.syncKeystrokeEffects(state.currentProject)

            // Clear render caches after trim operation
            TimelineDataService.invalidateCache(state.currentProject)
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
                        EffectType.Plugin
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

                    syncCropEffectTimes(state.currentProject)

                    // Start times changed; rebuild derived keystroke blocks.
                    EffectsFactory.syncKeystrokeEffects(state.currentProject)
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

            // Update modified timestamp
            state.currentProject.modifiedAt = new Date().toISOString()

            // Ensure playhead is within valid range after timeline changes
            const newTimelineDuration = calculateTimelineDuration(state.currentProject)
            if (state.currentTime >= newTimelineDuration) {
                state.currentTime = Math.max(0, newTimelineDuration - 1)
            }
        })

        return result
    },

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

    restoreClipsFromUndo: (trackId, clipIdsToRemove, clipsToRestore) => {
        set((state) => {
            if (!state.currentProject) return

            if (restoreClipsToTrack(state.currentProject, trackId, clipIdsToRemove, clipsToRestore)) {
                // Clip layout changed; rebuild derived keystroke blocks.
                EffectsFactory.syncKeystrokeEffects(state.currentProject)

                // Clear render caches after undo/redo
                TimelineDataService.invalidateCache(state.currentProject)
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

    getEffectsAtTimeRange: (clipId) => {
        const { currentProject } = get()
        if (!currentProject) return []
        return EffectsFactory.getEffectsForClip(currentProject, clipId)
    },

    regenerateAllEffects: async (config) => {
        const projectSnapshot = get().currentProject
        if (!projectSnapshot) return

        const [{ EffectGenerationService }, { metadataLoader }] = await Promise.all([
            import('@/features/effects/services/effect-generation-service'),
            import('@/lib/export/metadata-loader'),
        ])

        let metadataByRecordingId: Map<string, import('@/types/project').RecordingMetadata> | undefined
        try {
            metadataByRecordingId = await metadataLoader.loadAllMetadata(projectSnapshot.recordings || [])
        } catch (error) {
            console.warn('[TimelineSlice] Failed to load metadata for effect regeneration:', error)
        }

        set((state) => {
            if (state.currentProject) {
                EffectGenerationService.regenerateAllEffects(state.currentProject, config, metadataByRecordingId)
                // playhead state computed via hook

            }
        })
    }
})
