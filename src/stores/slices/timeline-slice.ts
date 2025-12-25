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
} from '@/lib/timeline/timeline-operations'
import { ProjectCleanupService } from '@/lib/timeline/project-cleanup'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { SpeedUpApplicationService } from '@/lib/timeline/speed-up-application'
import { PlayheadService } from '@/lib/timeline/playhead-service'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { ClipPositioning } from '@/lib/timeline/clip-positioning'
import { getActiveCropEffect, getCropEffectForClip } from '@/lib/effects/effect-filters'
import { captureLastFrame } from '@/lib/utils/frame-capture'
import { generateCursorReturnFromSource } from '@/lib/cursor/synthetic-events'
import { EffectStore } from '@/lib/core/effects'
import type { CreateTimelineSlice } from './types'
import { invalidateCaches } from './utils'

export const createTimelineSlice: CreateTimelineSlice = (set, get) => ({
    // State
    // (Currently empty as per types definition, but ready for future)

    // ===========================================================================
    // CLIP ACTIONS
    // ===========================================================================

    addClip: (clipOrRecordingId, startTime) => {
        set((state) => {
            if (!state.currentProject) return

            const clip = addClipToTrack(state.currentProject, clipOrRecordingId, startTime)

            if (clip) {
                // New clip can change mapping; keep derived keystroke blocks aligned.
                EffectsFactory.syncKeystrokeEffects(state.currentProject)

                state.selectedClips = [clip.id]

                // Enable waveforms by default if the recording has audio
                const recordingId = typeof clipOrRecordingId === 'string' ? clipOrRecordingId : clipOrRecordingId.recordingId
                const recording = state.currentProject.recordings.find(r => r.id === recordingId)
                if (recording?.hasAudio) {
                    state.settings.editing.showWaveforms = true
                }

                // Invalidate cache on clip add
                invalidateCaches(state)
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

            // Invalidate cache
            invalidateCaches(state)

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

            // Invalidate cache
            invalidateCaches(state)

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

        const project = state.currentProject
        const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
        if (!videoTrack) return

        // Find source clip - either specified or current playhead clip
        let sourceClip: Clip | null = null
        let sourceRecording: Recording | null = null

        if (sourceClipId) {
            const result = findClipById(project, sourceClipId)
            if (result) {
                sourceClip = result.clip
                sourceRecording = project.recordings.find(r => r.id === sourceClip!.recordingId) ?? null
            }
        } else {
            // Compute playhead state on-demand (SSOT - no stored playhead state)
            const playheadState = PlayheadService.updatePlayheadState(project, state.currentTime)
            sourceClip = playheadState.playheadClip
            sourceRecording = playheadState.playheadRecording
        }

        if (!sourceClip || !sourceRecording) {
            console.warn('addCursorReturnClip: No source clip found')
            return
        }

        // Only work with video clips (not generated or image)
        if (sourceRecording.sourceType && sourceRecording.sourceType !== 'video') {
            console.warn('addCursorReturnClip: Source must be a video clip')
            return
        }

        // Capture freeze frame from last frame of source clip
        const captureResult = await captureLastFrame(
            sourceRecording.filePath,
            sourceClip.sourceOut
        )

        if (!captureResult.success || !captureResult.dataUrl) {
            console.error('addCursorReturnClip: Failed to capture freeze frame:', captureResult.error)
            return
        }

        // Get mouse events from source recording
        const sourceEvents = sourceRecording.metadata?.mouseEvents ?? []

        // Generate synthetic cursor return events
        const syntheticEvents = generateCursorReturnFromSource(
            sourceEvents,
            sourceClip.sourceIn ?? 0,
            sourceClip.sourceOut,
            durationMs
        )

        if (!syntheticEvents) {
            console.warn('addCursorReturnClip: Could not generate cursor return events (no mouse data)')
        }

        // Collect effects to copy from both source recording and timeline
        const timelineEffects = EffectStore.getAll(project)
        const clipEnd = sourceClip!.startTime + sourceClip!.duration

        // Get crop effect using clipId-based matching first, then fall back to active-at-end
        const cropEffect = getCropEffectForClip(timelineEffects, sourceClip!)
            ?? getActiveCropEffect(timelineEffects, Math.max(0, clipEnd - 1))

        // Get other effects (Background, Screen) using time-range filtering
        const activeTimelineEffects = timelineEffects.filter(e =>
            e.type !== EffectType.Crop &&
            e.startTime <= clipEnd && e.endTime >= clipEnd
        )

        const sourceOut = sourceClip!.sourceOut
        const activeSourceEffects = (sourceRecording.effects ?? []).filter(e =>
            e.startTime <= sourceOut && e.endTime >= sourceOut
        )

        const effectsToCopy = [
            ...(cropEffect ? [cropEffect] : []),
            ...activeTimelineEffects.filter(e =>
                e.type === EffectType.Background || e.type === EffectType.Screen
            ),
            ...activeSourceEffects.filter(e =>
                e.type === EffectType.Background || e.type === EffectType.Screen
            )
        ]

        // Clone and adjust timing for new clip
        // Calculate insert time (right after source clip ends)
        const insertTime = sourceClip.startTime + sourceClip.duration

        // Save freeze frame to disk instead of using data URL directly
        let imagePath = captureResult.dataUrl

        if (window.electronAPI?.saveRecording && project.filePath) {
            try {
                const projectFolder = project.filePath.substring(0, project.filePath.lastIndexOf('/'))
                const freezeFrameId = `freeze-${Date.now()}`
                const freezeFramePath = `${projectFolder}/${freezeFrameId}.jpg`

                const match = captureResult.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
                if (match) {
                    const base64 = match[2]
                    const binary = atob(base64)
                    const bytes = new Uint8Array(binary.length)
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i)
                    }

                    const saveResult = await window.electronAPI.saveRecording(freezeFramePath, bytes.buffer)
                    if (saveResult?.success) {
                        imagePath = freezeFramePath
                        console.log('[CursorReturn] Saved freeze frame to:', freezeFramePath)
                    } else {
                        console.warn('[CursorReturn] Failed to save freeze frame, using data URL fallback')
                    }
                }
            } catch (error) {
                console.warn('[CursorReturn] Error saving freeze frame to disk:', error)
            }
        }

        // Add image clip with freeze frame and synthetic events
        const created = get().addImageClip({
            imagePath,
            width: captureResult.width,
            height: captureResult.height,
            durationMs,
            startTime: insertTime,
            syntheticMouseEvents: syntheticEvents ?? undefined,
            effects: []
        })

        if (!created) return

        const clipStart = created.clip.startTime
        const newClipEnd = created.clip.startTime + created.clip.duration

        const clonedEffects = effectsToCopy.map(effect => {
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
                invalidateCaches(state)
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

            // Invalidate cache
            invalidateCaches(state)

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

                // Invalidate cache on clip removal
                invalidateCaches(state)
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

            // Invalidate cache
            invalidateCaches(state)

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

            // Invalidate cache
            invalidateCaches(state)

            const { firstClip } = result

            // Select the left clip to keep focus at the split point
            state.selectedClips = [firstClip.id]

            // Move playhead to just before the split point
            if (state.currentTime >= splitTime) {
                state.currentTime = splitTime - 1
            }
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

            // Invalidate cache
            invalidateCaches(state)

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

                // Invalidate cache
                invalidateCaches(state)
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

            // Invalidate cache
            invalidateCaches(state)
        })
    },

    removeEffect: (effectId) => {
        set((state) => {
            if (!state.currentProject) return

            // Use EffectStore as SSOT for removing effects
            const removed = EffectStore.remove(state.currentProject, effectId)
            if (removed) {
                // Invalidate cache
                invalidateCaches(state)
            }
        })
    },

    updateEffect: (effectId, updates) => {
        set((state) => {
            if (!state.currentProject) return

            // Use EffectStore as SSOT for updating effects
            const updated = EffectStore.update(state.currentProject, effectId, updates)
            if (updated) {
                // Invalidate cache
                invalidateCaches(state)
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
            import('@/lib/effects/effect-generation-service'),
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

                // Invalidate cache
                invalidateCaches(state)
            }
        })
    }
})
