/**
 * Timeline Sync Service
 *
 * Single entry point for synchronizing timeline state after any clip change.
 * Consolidates scattered sync logic from multiple commands into one service.
 *
 * Handles four categories of synchronization:
 * 1. Clip-bound effects (Crop): Follow their clipId
 * 2. Time-based effects (Zoom/Screen/Annotation): Shift/compress with timeline changes
 * 3. Auto-managed effects (Keystroke): Regenerated from recording metadata
 * 4. Linked webcam clips: Stay aligned with video clips after operations
 */

import type { Project, Effect, Clip, Track } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import type { ClipChange, SegmentMapping } from './types'
import { EffectStore } from '@/features/effects/core/effects-store'
import { syncKeystrokeEffects } from './keystroke-sync'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { TimeRange } from '@/features/ui/timeline/time/time-range'
import { executeSplitClip } from '@/features/ui/timeline/clips/clip-split'
import { executeTrimClipStart, executeTrimClipEnd, MIN_CLIP_DURATION_MS } from '@/features/ui/timeline/clips/clip-trim'
import { removeClipFromTrack } from '@/features/ui/timeline/clips/clip-crud'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'

// Effect types that should shift with timeline changes
const SHIFTABLE_EFFECT_TYPES = new Set([
    EffectType.Zoom,
    EffectType.Screen,
    EffectType.Plugin,
    EffectType.Annotation,
])

// Effect types that are global and should not be modified
const GLOBAL_EFFECT_TYPES = new Set([
    EffectType.Background,
    EffectType.Cursor,
])

export const TimelineSyncService = {
    /**
     * Main entry point - commit all sync operations after a clip change.
     * Called by middleware after commands set _pendingClipChange.
     */
    commit(project: Project, change: ClipChange): void {
        // 1. Handle clip-bound effects (Crop follows clipId)
        this.syncClipBoundEffects(project, change)

        // 2. Handle time-based effects (Zoom/Screen shift with content)
        this.syncTimeBasedEffects(project, change)

        // 3. Sync linked webcam clips for video track changes
        this.syncLinkedWebcamClips(project, change)

        // 4. Regenerate keystroke effects
        syncKeystrokeEffects(project)

        // 5. Clean up any orphaned effects
        this.cleanupOrphanedEffects(project)

        // 6. Invalidate timeline caches
        // IMPORTANT: Always invalidate after clip changes to prevent stale data
        TimelineDataService.invalidateCache(project)
    },

    /**
     * Sync clip-bound effects (e.g., Crop) to match their bound clip's position.
     */
    syncClipBoundEffects(project: Project, change: ClipChange): void {
        const allEffects = EffectStore.getAll(project)
        const videoClips = project.timeline.tracks
            .filter(t => t.type === TrackType.Video)
            .flatMap(t => t.clips)

        for (const effect of allEffects) {
            // Only handle clip-bound effects
            if (!effect.clipId) continue

            // For delete: clip-bound effects removed by cleanupOrphanedEffects
            if (change.type === 'delete' && effect.clipId === change.clipId) {
                continue
            }

            // For split: duplicate crop effects for new clips
            if (change.type === 'split' && effect.clipId === change.clipId && change.newClipIds) {
                this.handleSplitClipBoundEffect(project, effect, change)
                continue
            }

            // Update timing to match bound clip
            const boundClip = videoClips.find(c => c.id === effect.clipId)
            if (boundClip) {
                effect.startTime = boundClip.startTime
                effect.endTime = boundClip.startTime + boundClip.duration
            }
        }
    },

    /**
     * Handle splitting clip-bound effects when a clip is split.
     */
    handleSplitClipBoundEffect(project: Project, effect: Effect, change: ClipChange): void {
        if (!change.newClipIds || change.newClipIds.length < 2) return

        const videoClips = project.timeline.tracks
            .filter(t => t.type === TrackType.Video)
            .flatMap(t => t.clips)

        // Create a copy of the effect for each new clip
        for (const newClipId of change.newClipIds) {
            const clip = videoClips.find(c => c.id === newClipId)
            if (!clip) continue

            // First clip keeps original effect, subsequent clips get copies
            if (newClipId === change.newClipIds[0]) {
                effect.clipId = newClipId
                effect.startTime = clip.startTime
                effect.endTime = clip.startTime + clip.duration
            } else {
                const clonedEffect: Effect = {
                    ...effect,
                    id: crypto.randomUUID(),
                    clipId: newClipId,
                    startTime: clip.startTime,
                    endTime: clip.startTime + clip.duration,
                    data: effect.data ? JSON.parse(JSON.stringify(effect.data)) : undefined,
                }
                EffectStore.add(project, clonedEffect)
            }
        }
    },

    /**
     * Sync time-based effects (Zoom, Screen, etc.) based on timeline changes.
     */
    syncTimeBasedEffects(project: Project, change: ClipChange): void {
        if (change.type === 'delete') {
            this.handleDeleteTimeBasedEffects(project, change)
            return
        }

        if (change.type === 'speed-up' && change.segmentMapping) {
            this.handleSpeedUpTimeBasedEffects(project, change)
            return
        }

        // Handle operations that shift effects after the modified clip
        if (change.type === 'reorder' ||
            change.type === 'trim-start' ||
            change.type === 'trim-end' ||
            change.type === 'rate-change' ||
            change.type === 'update') {
            this.handleShiftTimeBasedEffects(project, change)
            return
        }
    },

    /**
     * When a clip is deleted, shift effects after the deleted region.
     */
    handleDeleteTimeBasedEffects(project: Project, change: ClipChange): void {
        if (!change.before) return

        const allEffects = EffectStore.getAll(project)
        const deletedStart = change.before.startTime
        const deletedEnd = change.before.endTime
        const deletedDuration = deletedEnd - deletedStart

        for (const effect of allEffects) {
            if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
            if (effect.clipId) continue // Clip-bound handled separately

            // Effect entirely after deleted clip: shift back
            if (effect.startTime >= deletedEnd) {
                effect.startTime -= deletedDuration
                effect.endTime -= deletedDuration
                continue
            }

            // Effect overlaps deleted region: shrink or remove
            if (effect.endTime > deletedStart && effect.startTime < deletedEnd) {
                if (effect.startTime >= deletedStart && effect.endTime <= deletedEnd) {
                    // Entirely within deleted region - mark for removal
                    effect.startTime = -1
                    effect.endTime = -1
                } else if (effect.startTime < deletedStart && effect.endTime > deletedEnd) {
                    // Spans across deleted region - shrink
                    effect.endTime -= deletedDuration
                } else if (effect.startTime < deletedStart) {
                    // Ends within deleted region - truncate end
                    effect.endTime = deletedStart
                } else {
                    // Starts within deleted region - truncate start, shift
                    effect.startTime = deletedStart
                    effect.endTime = effect.endTime - deletedDuration + (deletedStart - effect.startTime)
                }
            }
        }

        // Remove effects marked for deletion
        project.timeline.effects = project.timeline.effects?.filter(
            e => !(e.startTime === -1 && e.endTime === -1)
        )
    },

    /**
     * Shift effects based on how clips moved.
     */
    handleShiftTimeBasedEffects(project: Project, change: ClipChange): void {
        if (!change.before || !change.after) return

        const allEffects = EffectStore.getAll(project)
        const originalStart = change.before.startTime
        const originalEnd = change.before.endTime
        const newStart = change.after.startTime
        const newEnd = change.after.endTime

        // For trim-start, effects inside the clip need special handling
        if (change.type === 'trim-start') {
            // Calculate how much content was removed from start
            // Note: sourceIn delta indicates how much source content was trimmed
            const sourceInDelta = change.after.sourceIn - change.before.sourceIn
            const playbackRate = change.after.playbackRate || 1
            const contentShift = sourceInDelta / playbackRate

            for (const effect of allEffects) {
                if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
                if (effect.clipId) continue

                // Effects entirely before the clip: unchanged
                if (effect.endTime <= originalStart) continue

                // Effects that start inside the trimmed portion get truncated or removed
                if (effect.startTime >= originalStart && effect.startTime < originalStart + contentShift) {
                    // Effect starts in trimmed content
                    if (effect.endTime <= originalStart + contentShift) {
                        // Entirely in trimmed portion - mark for removal
                        effect.startTime = -1
                        effect.endTime = -1
                    } else {
                        // Partially in trimmed portion - truncate start
                        effect.startTime = newStart
                        effect.endTime = effect.endTime - contentShift
                    }
                    continue
                }

                // Effects inside remaining content shift with the content
                if (effect.startTime >= originalStart + contentShift && effect.startTime < originalEnd) {
                    effect.startTime -= contentShift
                    effect.endTime -= contentShift
                    continue
                }

                // Effects after the clip shift by timeline delta (usually negative for trim-start)
                if (effect.startTime >= originalEnd - 0.01) {
                    effect.startTime += change.timelineDelta
                    effect.endTime += change.timelineDelta
                }
            }

            // Remove effects marked for deletion
            project.timeline.effects = project.timeline.effects?.filter(
                e => !(e.startTime === -1 && e.endTime === -1)
            )
            return
        }

        // For trim-end, handle effects inside the clip and after
        if (change.type === 'trim-end') {
            for (const effect of allEffects) {
                if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
                if (effect.clipId) continue

                // Effects entirely before the new end: check if they extend past it
                if (effect.startTime < newEnd && effect.endTime > newEnd) {
                    // Truncate effect to new clip end
                    effect.endTime = newEnd
                    continue
                }

                // Effects starting after new end but before original end: mark for removal
                if (effect.startTime >= newEnd && effect.startTime < originalEnd) {
                    effect.startTime = -1
                    effect.endTime = -1
                    continue
                }

                // Effects after the original clip: shift by timeline delta
                if (effect.startTime >= originalEnd - 0.01) {
                    effect.startTime += change.timelineDelta
                    effect.endTime += change.timelineDelta
                }
            }

            // Remove effects marked for deletion
            project.timeline.effects = project.timeline.effects?.filter(
                e => !(e.startTime === -1 && e.endTime === -1)
            )
            return
        }

        // For other operations (reorder, update, rate-change), shift effects after the clip
        if (Math.abs(change.timelineDelta) < 0.001) return

        for (const effect of allEffects) {
            if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
            if (effect.clipId) continue

            // Effects starting at or after the change point get shifted
            if (effect.startTime >= originalEnd - 0.01) {
                effect.startTime += change.timelineDelta
                effect.endTime += change.timelineDelta
            }
        }
    },

    /**
     * Proportionally adjust effects when speed-up changes timeline duration.
     */
    handleSpeedUpTimeBasedEffects(project: Project, change: ClipChange): void {
        if (!change.segmentMapping) return

        const { originalClipStart, originalClipEnd, segments } = change.segmentMapping
        const allEffects = EffectStore.getAll(project)

        // Calculate total delta
        const newDuration = segments.reduce((sum, s) => sum + (s.timelineEnd - s.timelineStart), 0)
        const originalDuration = originalClipEnd - originalClipStart
        const delta = newDuration - originalDuration

        for (const effect of allEffects) {
            if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
            if (effect.clipId) continue

            // Effect entirely after: shift by delta
            if (effect.startTime >= originalClipEnd) {
                effect.startTime += delta
                effect.endTime += delta
                continue
            }

            // Effect overlaps: remap proportionally
            if (effect.endTime > originalClipStart && effect.startTime < originalClipEnd) {
                const newStart = this.mapTimeToNewPosition(effect.startTime, change.segmentMapping)
                const newEnd = this.mapTimeToNewPosition(effect.endTime, change.segmentMapping)

                if (newStart !== null) effect.startTime = newStart
                if (newEnd !== null) effect.endTime = newEnd
            }
        }
    },

    /**
     * Map a timeline position through segment mapping.
     */
    mapTimeToNewPosition(time: number, mapping: SegmentMapping): number | null {
        const { originalClipStart, segments } = mapping

        // Before clip: unchanged
        if (time < originalClipStart) return time

        // Find which segment this time falls into
        let accumulatedTime = originalClipStart
        for (const segment of segments) {
            const segmentSourceDuration = segment.sourceEnd - segment.sourceStart
            const segmentTimelineDuration = segment.timelineEnd - segment.timelineStart

            // Check if time falls within this segment's original range
            const segmentOriginalEnd = accumulatedTime + segmentSourceDuration / segment.speedMultiplier

            if (time <= segmentOriginalEnd) {
                // Interpolate within segment
                const offsetInOriginal = time - accumulatedTime
                const ratio = offsetInOriginal / (segmentSourceDuration / segment.speedMultiplier)
                return segment.timelineStart + (ratio * segmentTimelineDuration)
            }

            accumulatedTime = segmentOriginalEnd
        }

        // After all segments: shift by total delta
        const lastSegment = segments[segments.length - 1]
        return lastSegment ? lastSegment.timelineEnd + (time - accumulatedTime) : time
    },

    /**
     * Remove effects bound to clips that no longer exist.
     */
    cleanupOrphanedEffects(project: Project): void {
        const allClipIds = new Set(
            project.timeline.tracks.flatMap(t => t.clips.map(c => c.id))
        )

        const effects = project.timeline.effects
        if (!effects) return

        project.timeline.effects = effects.filter(effect => {
            // Keep global effects
            if (GLOBAL_EFFECT_TYPES.has(effect.type)) return true

            // Keep effects not bound to a clip
            if (!effect.clipId) return true

            // Keep if bound clip still exists
            return allClipIds.has(effect.clipId)
        })
    },

    /**
     * Build ClipChange for a reorder operation.
     */
    buildReorderChange(
        clip: Clip,
        oldStartTime: number,
        newStartTime: number
    ): ClipChange {
        const duration = clip.duration
        return {
            type: 'reorder',
            clipId: clip.id,
            recordingId: clip.recordingId,
            before: {
                startTime: oldStartTime,
                endTime: oldStartTime + duration,
                playbackRate: clip.playbackRate || 1,
                sourceIn: clip.sourceIn || 0,
                sourceOut: clip.sourceOut || duration,
            },
            after: {
                startTime: newStartTime,
                endTime: newStartTime + duration,
                playbackRate: clip.playbackRate || 1,
                sourceIn: clip.sourceIn || 0,
                sourceOut: clip.sourceOut || duration,
            },
            timelineDelta: newStartTime - oldStartTime,
        }
    },

    /**
     * Build ClipChange for a delete operation.
     */
    buildDeleteChange(clip: Clip, sourceTrackType?: TrackType): ClipChange {
        return {
            type: 'delete',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: {
                startTime: clip.startTime,
                endTime: clip.startTime + clip.duration,
                playbackRate: clip.playbackRate || 1,
                sourceIn: clip.sourceIn || 0,
                sourceOut: clip.sourceOut || clip.duration,
            },
            after: null,
            timelineDelta: -clip.duration,
        }
    },

    /**
     * Build ClipChange for a trim operation.
     */
    buildTrimChange(
        clip: Clip,
        side: 'start' | 'end',
        oldState: { startTime: number; endTime: number; sourceIn: number; sourceOut: number },
        sourceTrackType?: TrackType
    ): ClipChange {
        const oldDuration = oldState.endTime - oldState.startTime
        const newDuration = clip.duration

        return {
            type: side === 'start' ? 'trim-start' : 'trim-end',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: {
                startTime: oldState.startTime,
                endTime: oldState.endTime,
                playbackRate: clip.playbackRate || 1,
                sourceIn: oldState.sourceIn,
                sourceOut: oldState.sourceOut,
            },
            after: {
                startTime: clip.startTime,
                endTime: clip.startTime + clip.duration,
                playbackRate: clip.playbackRate || 1,
                sourceIn: clip.sourceIn || 0,
                sourceOut: clip.sourceOut || clip.duration,
            },
            timelineDelta: newDuration - oldDuration,
        }
    },

    /**
     * Build ClipChange for a split operation.
     */
    buildSplitChange(
        originalClip: Clip,
        leftClipId: string,
        rightClipId: string,
        sourceTrackType?: TrackType
    ): ClipChange {
        return {
            type: 'split',
            clipId: originalClip.id,
            recordingId: originalClip.recordingId,
            sourceTrackType,
            before: {
                startTime: originalClip.startTime,
                endTime: originalClip.startTime + originalClip.duration,
                playbackRate: originalClip.playbackRate || 1,
                sourceIn: originalClip.sourceIn || 0,
                sourceOut: originalClip.sourceOut || originalClip.duration,
            },
            after: null, // Split creates new clips
            timelineDelta: 0, // Total duration unchanged
            newClipIds: [leftClipId, rightClipId],
        }
    },

    /**
     * Build ClipChange for a playback rate change operation.
     */
    buildRateChange(
        clip: Clip,
        oldDuration: number,
        sourceTrackType?: TrackType
    ): ClipChange {
        const newDuration = clip.duration
        return {
            type: 'rate-change',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: {
                startTime: clip.startTime,
                endTime: clip.startTime + oldDuration,
                playbackRate: (clip.sourceOut != null && clip.sourceIn != null)
                    ? (clip.sourceOut - clip.sourceIn) / oldDuration
                    : 1,
                sourceIn: clip.sourceIn || 0,
                sourceOut: clip.sourceOut || oldDuration,
            },
            after: {
                startTime: clip.startTime,
                endTime: clip.startTime + newDuration,
                playbackRate: clip.playbackRate || 1,
                sourceIn: clip.sourceIn || 0,
                sourceOut: clip.sourceOut || newDuration,
            },
            timelineDelta: newDuration - oldDuration,
        }
    },

    /**
     * Build ClipChange for a clip update operation.
     * Only used when timing properties changed (startTime, duration, sourceIn/Out, playbackRate).
     */
    buildUpdateChange(
        clip: Clip,
        oldState: { startTime: number; endTime: number; sourceIn: number; sourceOut: number; playbackRate: number },
        sourceTrackType?: TrackType
    ): ClipChange {
        const newEndTime = clip.startTime + clip.duration
        return {
            type: 'update',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: {
                startTime: oldState.startTime,
                endTime: oldState.endTime,
                playbackRate: oldState.playbackRate,
                sourceIn: oldState.sourceIn,
                sourceOut: oldState.sourceOut,
            },
            after: {
                startTime: clip.startTime,
                endTime: newEndTime,
                playbackRate: clip.playbackRate || 1,
                sourceIn: clip.sourceIn || 0,
                sourceOut: clip.sourceOut || clip.duration,
            },
            timelineDelta: newEndTime - oldState.endTime,
        }
    },

    // ==========================================
    // Webcam Clip Synchronization
    // ==========================================

    /**
     * Sync linked webcam clips when video clips change.
     * Only runs for VIDEO track changes to prevent recursion.
     */
    syncLinkedWebcamClips(project: Project, change: ClipChange): void {
        // Skip if explicitly marked as non-video track
        if (change.sourceTrackType && change.sourceTrackType !== TrackType.Video) return

        // Fallback: check if clip is in a video track (won't work for delete after clip is gone)
        if (!change.sourceTrackType && change.type !== 'delete') {
            const clipResult = ClipLookup.byId(project, change.clipId)
            if (clipResult && clipResult.track.type !== TrackType.Video) return
        }

        // Check if webcam tracks exist
        const webcamTracks = project.timeline.tracks.filter(t => t.type === TrackType.Webcam)
        if (webcamTracks.length === 0) return

        // Dispatch to specific handler
        switch (change.type) {
            case 'split':
                this.handleWebcamSplit(project, change)
                break
            case 'trim-start':
                this.handleWebcamTrimStart(project, change)
                break
            case 'trim-end':
                this.handleWebcamTrimEnd(project, change)
                break
            case 'delete':
                this.handleWebcamDelete(project, change)
                break
            case 'speed-up':
                // Speed-up is already handled by SpeedUpApplicationService.syncWebcamClips()
                // Skip to avoid double-processing
                break
        }
    },

    /**
     * Find webcam clips that overlap with a time range.
     */
    findOverlappingWebcamClips(
        project: Project,
        range: TimeRange,
        recordingId?: string
    ): Array<{ clip: Clip; track: Track }> {
        const results: Array<{ clip: Clip; track: Track }> = []

        for (const track of project.timeline.tracks) {
            if (track.type !== TrackType.Webcam) continue

            for (const clip of track.clips) {
                const clipRange = TimeRange.fromClip(clip)
                if (TimeRange.overlaps(range, clipRange)) {
                    // Optionally filter by recordingId if provided
                    if (!recordingId || clip.recordingId === recordingId) {
                        results.push({ clip, track })
                    }
                }
            }
        }

        return results
    },

    /**
     * Shift all webcam clips after a time point by delta.
     */
    shiftWebcamClipsAfter(
        project: Project,
        afterTime: number,
        deltaMs: number,
        excludeClipIds?: Set<string>
    ): void {
        if (Math.abs(deltaMs) < 0.001) return

        for (const track of project.timeline.tracks) {
            if (track.type !== TrackType.Webcam) continue

            for (const clip of track.clips) {
                if (excludeClipIds?.has(clip.id)) continue
                if (clip.startTime >= afterTime - 0.01) {
                    clip.startTime += deltaMs
                }
            }
        }
    },

    /**
     * Handle webcam split: split webcam at same point as video.
     */
    handleWebcamSplit(project: Project, change: ClipChange): void {
        if (!change.before || !change.newClipIds || change.newClipIds.length < 2) return

        // Find the split point from the first new clip's end time
        const firstNewClipResult = ClipLookup.byId(project, change.newClipIds[0])
        if (!firstNewClipResult) return

        const splitTime = firstNewClipResult.clip.startTime + firstNewClipResult.clip.duration

        // Find overlapping webcam clips
        const overlapping = this.findOverlappingWebcamClips(project, {
            startTime: change.before.startTime,
            endTime: change.before.endTime
        })

        for (const { clip } of overlapping) {
            const clipEnd = clip.startTime + clip.duration
            // Only split if split point is within the webcam clip
            if (splitTime > clip.startTime && splitTime < clipEnd) {
                executeSplitClip(project, clip.id, splitTime)
            }
        }
    },

    /**
     * Handle webcam trim start: trim webcam start to match video.
     */
    handleWebcamTrimStart(project: Project, change: ClipChange): void {
        if (!change.before || !change.after) return

        const overlapping = this.findOverlappingWebcamClips(project, {
            startTime: change.before.startTime,
            endTime: change.before.endTime
        })

        const processedIds = new Set<string>()

        for (const { clip } of overlapping) {
            // Trim webcam start by same amount as video
            const trimDelta = change.after.startTime - change.before.startTime
            if (trimDelta > 0) {
                const newStart = clip.startTime + trimDelta
                if (newStart < clip.startTime + clip.duration - MIN_CLIP_DURATION_MS) {
                    executeTrimClipStart(project, clip.id, newStart)
                }
            }
            processedIds.add(clip.id)
        }

        // Shift subsequent clips by timeline delta
        if (change.timelineDelta < 0) {
            this.shiftWebcamClipsAfter(project, change.after.endTime, change.timelineDelta, processedIds)
        }
    },

    /**
     * Handle webcam trim end: trim webcam end to match video.
     */
    handleWebcamTrimEnd(project: Project, change: ClipChange): void {
        if (!change.before || !change.after) return

        const overlapping = this.findOverlappingWebcamClips(project, {
            startTime: change.before.startTime,
            endTime: change.before.endTime
        })

        const processedIds = new Set<string>()

        for (const { clip } of overlapping) {
            const clipEnd = clip.startTime + clip.duration
            // If webcam extends past new video end, trim it
            if (clipEnd > change.after.endTime) {
                const newDuration = change.after.endTime - clip.startTime
                if (newDuration >= MIN_CLIP_DURATION_MS) {
                    executeTrimClipEnd(project, clip.id, change.after.endTime)
                }
            }
            processedIds.add(clip.id)
        }

        // Shift subsequent clips
        if (Math.abs(change.timelineDelta) > 0.001) {
            this.shiftWebcamClipsAfter(project, change.before.endTime, change.timelineDelta, processedIds)
        }
    },

    /**
     * Handle webcam delete: delete overlapping webcam + ripple.
     */
    handleWebcamDelete(project: Project, change: ClipChange): void {
        if (!change.before) return

        const overlapping = this.findOverlappingWebcamClips(project, {
            startTime: change.before.startTime,
            endTime: change.before.endTime
        })

        const deletedIds = new Set<string>()

        for (const { clip, track } of overlapping) {
            const clipStart = clip.startTime
            const clipEnd = clip.startTime + clip.duration
            const delStart = change.before.startTime
            const delEnd = change.before.endTime

            // Case 1: Webcam entirely within deleted region - delete it
            if (clipStart >= delStart && clipEnd <= delEnd) {
                removeClipFromTrack(project, clip.id, track)
                deletedIds.add(clip.id)
            }
            // Case 2: Webcam spans deleted region - trim end to deleted start
            else if (clipStart < delStart && clipEnd > delEnd) {
                executeTrimClipEnd(project, clip.id, delStart)
            }
            // Case 3: Webcam starts inside deleted region - trim start
            else if (clipStart >= delStart && clipStart < delEnd && clipEnd > delEnd) {
                executeTrimClipStart(project, clip.id, delStart)
            }
            // Case 4: Webcam ends inside deleted region - trim end
            else if (clipStart < delStart && clipEnd > delStart && clipEnd <= delEnd) {
                executeTrimClipEnd(project, clip.id, delStart)
            }
        }

        // Ripple: shift all webcam clips after deleted region backward
        this.shiftWebcamClipsAfter(project, change.before.endTime, change.timelineDelta, deletedIds)
    },
}
