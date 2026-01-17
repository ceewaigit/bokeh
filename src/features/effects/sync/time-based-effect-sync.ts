/**
 * Time-Based Effect Sync
 *
 * Handles synchronization of effects based on timeline time ranges (Zoom, Screen, etc.).
 * These effects shift/compress based on timeline changes from clip operations.
 *
 * Uses the two-phase mutation pattern:
 * 1. collectMutations() - collects changes without modifying state
 * 2. EffectStore.applyBatch() - applies all changes atomically
 */

import type { Project, Effect } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import type { ClipChange, SegmentMapping, EffectMutationBatch } from './types'
import { TIME_TOLERANCE_MS } from './types'
import { EffectStore } from '@/features/effects/core/effects-store'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'

// Effect types that should shift with timeline changes
const SHIFTABLE_EFFECT_TYPES = new Set([
    EffectType.Zoom,
    EffectType.Screen,
    EffectType.Plugin,
    EffectType.Annotation,
])

export const TimeBasedEffectSync = {
    /**
     * Collect mutations for time-based effects based on timeline changes.
     * Does not modify state - only populates the mutation batch.
     */
    collectMutations(project: Project, change: ClipChange, batch: EffectMutationBatch): void {
        // Only sync effects based on video track changes
        if (change.sourceTrackType && change.sourceTrackType !== TrackType.Video) return

        const allEffects = EffectStore.getAll(project)

        if (change.type === 'delete') {
            this.collectDeleteMutations(allEffects, change, batch)
            return
        }

        if (change.type === 'speed-up' && change.segmentMapping) {
            this.collectSpeedUpMutations(allEffects, change, batch)
            return
        }

        // Handle operations that shift effects after the modified clip
        if (change.type === 'reorder' ||
            change.type === 'trim-start' ||
            change.type === 'trim-end' ||
            change.type === 'rate-change' ||
            change.type === 'update') {
            this.collectShiftMutations(allEffects, change, batch)
            return
        }
    },

    /**
     * When a clip is deleted, shift effects after the deleted region.
     */
    collectDeleteMutations(
        allEffects: Effect[],
        change: ClipChange,
        batch: EffectMutationBatch
    ): void {
        if (!change.before) return

        const deletedStart = change.before.startTime
        const deletedEnd = change.before.endTime
        const deletedDuration = deletedEnd - deletedStart

        for (const effect of allEffects) {
            if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
            if (effect.clipId) continue // Clip-bound handled separately

            // Effect entirely after deleted clip: shift back
            if (effect.startTime >= deletedEnd) {
                batch.toUpdate.set(effect.id, {
                    startTime: effect.startTime - deletedDuration,
                    endTime: effect.endTime - deletedDuration,
                })
                continue
            }

            // Effect overlaps deleted region: shrink or remove
            if (effect.endTime > deletedStart && effect.startTime < deletedEnd) {
                if (effect.startTime >= deletedStart && effect.endTime <= deletedEnd) {
                    // Entirely within deleted region - mark for removal
                    batch.toRemove.add(effect.id)
                } else if (effect.startTime < deletedStart && effect.endTime > deletedEnd) {
                    // Spans across deleted region - shrink
                    batch.toUpdate.set(effect.id, {
                        endTime: effect.endTime - deletedDuration,
                    })
                } else if (effect.startTime < deletedStart) {
                    // Ends within deleted region - truncate end
                    batch.toUpdate.set(effect.id, {
                        endTime: deletedStart,
                    })
                } else {
                    // Starts within deleted region - truncate start and shift back
                    batch.toUpdate.set(effect.id, {
                        startTime: deletedStart,
                        endTime: effect.endTime - deletedDuration,
                    })
                }
            }
        }
    },

    /**
     * Collect shift mutations based on how clips moved.
     */
    collectShiftMutations(
        allEffects: Effect[],
        change: ClipChange,
        batch: EffectMutationBatch
    ): void {
        if (!change.before || !change.after) return

        const originalStart = change.before.startTime
        const originalEnd = change.before.endTime
        const newStart = change.after.startTime
        const newEnd = change.after.endTime

        // For trim-start, effects inside the clip need special handling
        if (change.type === 'trim-start') {
            this.collectTrimStartMutations(allEffects, change, originalStart, originalEnd, newStart, batch)
            return
        }

        // For trim-end, handle effects inside the clip and after
        if (change.type === 'trim-end') {
            this.collectTrimEndMutations(allEffects, change, originalEnd, newEnd, batch)
            return
        }

        // For other operations (reorder, update, rate-change), shift effects after the clip
        if (Math.abs(change.timelineDelta) < TIME_TOLERANCE_MS) return

        for (const effect of allEffects) {
            if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
            if (effect.clipId) continue

            // Effects starting at or after the change point get shifted
            if (effect.startTime >= originalEnd - 0.01) {
                batch.toUpdate.set(effect.id, {
                    startTime: effect.startTime + change.timelineDelta,
                    endTime: effect.endTime + change.timelineDelta,
                })
            }
        }
    },

    /**
     * Collect trim-start mutations: effects in trimmed content are removed or truncated.
     */
    collectTrimStartMutations(
        allEffects: Effect[],
        change: ClipChange,
        originalStart: number,
        originalEnd: number,
        newStart: number,
        batch: EffectMutationBatch
    ): void {
        if (!change.before || !change.after) return

        // Calculate how much content was removed from start
        const sourceInDelta = change.after.sourceIn - change.before.sourceIn
        const playbackRate = change.after.playbackRate || 1
        const contentShift = TimeConverter.sourceDeltaToTimelineDelta(sourceInDelta, playbackRate)

        for (const effect of allEffects) {
            if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
            if (effect.clipId) continue

            // Effects entirely before the clip: unchanged
            if (effect.endTime <= originalStart) continue

            // Effects that start inside the trimmed portion get truncated or removed
            if (effect.startTime >= originalStart && effect.startTime < originalStart + contentShift) {
                if (effect.endTime <= originalStart + contentShift) {
                    // Entirely in trimmed portion - mark for removal
                    batch.toRemove.add(effect.id)
                } else {
                    // Partially in trimmed portion - truncate start
                    batch.toUpdate.set(effect.id, {
                        startTime: newStart,
                        endTime: effect.endTime - contentShift,
                    })
                }
                continue
            }

            // Effects inside remaining content shift with the content
            if (effect.startTime >= originalStart + contentShift && effect.startTime < originalEnd) {
                batch.toUpdate.set(effect.id, {
                    startTime: effect.startTime - contentShift,
                    endTime: effect.endTime - contentShift,
                })
                continue
            }

            // Effects after the clip shift by timeline delta
            if (effect.startTime >= originalEnd - 0.01) {
                batch.toUpdate.set(effect.id, {
                    startTime: effect.startTime + change.timelineDelta,
                    endTime: effect.endTime + change.timelineDelta,
                })
            }
        }
    },

    /**
     * Collect trim-end mutations: effects past new end are removed, effects after shift.
     */
    collectTrimEndMutations(
        allEffects: Effect[],
        change: ClipChange,
        originalEnd: number,
        newEnd: number,
        batch: EffectMutationBatch
    ): void {
        for (const effect of allEffects) {
            if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
            if (effect.clipId) continue

            // Effects entirely before the new end: check if they extend past it
            if (effect.startTime < newEnd && effect.endTime > newEnd) {
                // Truncate effect to new clip end
                batch.toUpdate.set(effect.id, {
                    endTime: newEnd,
                })
                continue
            }

            // Effects starting after new end but before original end: mark for removal
            if (effect.startTime >= newEnd && effect.startTime < originalEnd) {
                batch.toRemove.add(effect.id)
                continue
            }

            // Effects after the original clip: shift by timeline delta
            if (effect.startTime >= originalEnd - 0.01) {
                batch.toUpdate.set(effect.id, {
                    startTime: effect.startTime + change.timelineDelta,
                    endTime: effect.endTime + change.timelineDelta,
                })
            }
        }
    },

    /**
     * Collect speed-up mutations: proportionally adjust effects when speed-up changes timeline duration.
     */
    collectSpeedUpMutations(
        allEffects: Effect[],
        change: ClipChange,
        batch: EffectMutationBatch
    ): void {
        if (!change.segmentMapping) return

        const { originalClipStart, originalClipEnd, segments } = change.segmentMapping

        // Calculate total delta
        const newDuration = segments.reduce((sum, s) => sum + (s.timelineEnd - s.timelineStart), 0)
        const originalDuration = originalClipEnd - originalClipStart
        const delta = newDuration - originalDuration

        for (const effect of allEffects) {
            if (!SHIFTABLE_EFFECT_TYPES.has(effect.type)) continue
            if (effect.clipId) continue

            // Effect entirely after: shift by delta
            if (effect.startTime >= originalClipEnd) {
                batch.toUpdate.set(effect.id, {
                    startTime: effect.startTime + delta,
                    endTime: effect.endTime + delta,
                })
                continue
            }

            // Effect overlaps: remap proportionally
            if (effect.endTime > originalClipStart && effect.startTime < originalClipEnd) {
                const newStart = this.mapTimeToNewPosition(effect.startTime, change.segmentMapping)
                const newEnd = this.mapTimeToNewPosition(effect.endTime, change.segmentMapping)

                const updates: Partial<Effect> = {}
                if (newStart !== null) updates.startTime = newStart
                if (newEnd !== null) updates.endTime = newEnd

                if (Object.keys(updates).length > 0) {
                    batch.toUpdate.set(effect.id, updates)
                }
            }
        }
    },

    /**
     * Map a timeline position through segment mapping.
     * Uses basePlaybackRate to calculate original timeline positions correctly.
     */
    mapTimeToNewPosition(time: number, mapping: SegmentMapping): number | null {
        const { originalClipStart, basePlaybackRate, segments } = mapping

        // Before clip: unchanged
        if (time < originalClipStart) return time

        const safeBaseRate = Math.max(0.0001, basePlaybackRate || 1)
        const firstSourceStart = segments[0]?.sourceStart ?? 0

        // Find which segment this time falls into using original timeline positions
        for (const segment of segments) {
            // Calculate where this segment was in the ORIGINAL timeline (pre-speed-up)
            // Using direct formula to avoid cumulative float drift
            const segmentOriginalStart =
                originalClipStart + (segment.sourceStart - firstSourceStart) / safeBaseRate
            const segmentOriginalEnd =
                originalClipStart + (segment.sourceEnd - firstSourceStart) / safeBaseRate

            if (time <= segmentOriginalEnd) {
                // Time is in or before this segment - interpolate
                if (time <= segmentOriginalStart) {
                    // Time is before this segment - return segment start
                    return segment.timelineStart
                }

                // Interpolate within segment
                const originalSegmentDuration = segmentOriginalEnd - segmentOriginalStart
                const newSegmentDuration = segment.timelineEnd - segment.timelineStart
                const offsetInOriginal = time - segmentOriginalStart
                const ratio = offsetInOriginal / originalSegmentDuration
                return segment.timelineStart + (ratio * newSegmentDuration)
            }
        }

        // After all segments: shift by total delta
        const lastSegment = segments[segments.length - 1]
        if (!lastSegment) return time

        const lastSegmentOriginalEnd =
            originalClipStart + (lastSegment.sourceEnd - firstSourceStart) / safeBaseRate
        return lastSegment.timelineEnd + (time - lastSegmentOriginalEnd)
    },
}
