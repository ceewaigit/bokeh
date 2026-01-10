/**
 * Effect Sync Service
 * 
 * Single entry point for synchronizing effects after any clip change.
 * Consolidates scattered effect logic from multiple commands into one service.
 * 
 * Handles three categories of effects:
 * 1. Clip-bound (Crop): Follow their clipId
 * 2. Time-based (Zoom/Screen/Annotation): Shift/compress with timeline changes
 * 3. Auto-managed (Keystroke): Regenerated from recording metadata
 */

import type { Project, Effect, Clip } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import type { ClipChange, SegmentMapping } from './types'
import { EffectStore } from '@/features/effects/core/store'
import { syncKeystrokeEffects } from './keystroke-sync'

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

export const EffectSyncService = {
    /**
     * Main entry point - call after any clip operation
     */
    syncAfterClipChange(project: Project, change: ClipChange): void {
        // 1. Handle clip-bound effects (Crop follows clipId)
        this.syncClipBoundEffects(project, change)

        // 2. Handle time-based effects (Zoom/Screen shift with content)
        this.syncTimeBasedEffects(project, change)

        // 3. Regenerate auto-managed effects (Keystroke blocks)
        syncKeystrokeEffects(project)

        // 4. Clean up any orphaned effects
        this.cleanupOrphanedEffects(project)
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

        if (change.type === 'reorder' || change.type === 'trim-start' || change.type === 'trim-end') {
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
        if (Math.abs(change.timelineDelta) < 0.001) return
        if (!change.before || !change.after) return

        const allEffects = EffectStore.getAll(project)
        const originalEnd = change.before.endTime

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
    buildDeleteChange(clip: Clip): ClipChange {
        return {
            type: 'delete',
            clipId: clip.id,
            recordingId: clip.recordingId,
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
        oldState: { startTime: number; endTime: number; sourceIn: number; sourceOut: number }
    ): ClipChange {
        const oldDuration = oldState.endTime - oldState.startTime
        const newDuration = clip.duration

        return {
            type: side === 'start' ? 'trim-start' : 'trim-end',
            clipId: clip.id,
            recordingId: clip.recordingId,
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
        rightClipId: string
    ): ClipChange {
        return {
            type: 'split',
            clipId: originalClip.id,
            recordingId: originalClip.recordingId,
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
}
