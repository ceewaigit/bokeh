/**
 * Clip-Bound Effect Sync
 *
 * Handles synchronization of effects bound to specific clips (e.g., Crop).
 * These effects follow their clipId and update timing when the bound clip moves.
 *
 * Uses the two-phase mutation pattern:
 * 1. collectMutations() - collects changes without modifying state
 * 2. EffectStore.applyBatch() - applies all changes atomically
 */

import type { Project, Effect } from '@/types/project'
import { TrackType } from '@/types/project'
import type { ClipChange, EffectMutationBatch } from './types'
import { EffectStore } from '@/features/effects/core/effects-store'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'

export const ClipBoundEffectSync = {
    /**
     * Collect mutations for clip-bound effects (e.g., Crop) to match their bound clip's position.
     * Does not modify state - only populates the mutation batch.
     */
    collectMutations(project: Project, change: ClipChange, batch: EffectMutationBatch): void {
        // Only sync clip-bound effects based on video track changes
        if (change.sourceTrackType && change.sourceTrackType !== TrackType.Video) return

        const allEffects = EffectStore.getAll(project)
        const videoClips = project.timeline.tracks
            .filter(t => t.type === TrackType.Video)
            .flatMap(t => t.clips)

        for (const effect of allEffects) {
            // Only handle clip-bound effects
            if (!effect.clipId) continue

            // For delete: clip-bound effects removed by orphan cleanup
            if (change.type === 'delete' && effect.clipId === change.clipId) {
                continue
            }

            // For split: duplicate crop effects for new clips
            if (change.type === 'split' && effect.clipId === change.clipId && change.newClipIds) {
                this.collectSplitMutations(project, effect, change, batch)
                continue
            }

            // Update timing to match bound clip
            const boundClip = videoClips.find(c => c.id === effect.clipId)
            if (boundClip) {
                const newStartTime = boundClip.startTime
                const newEndTime = TimeConverter.getEndTime(boundClip)

                // Only add update if timing actually changed
                if (effect.startTime !== newStartTime || effect.endTime !== newEndTime) {
                    batch.toUpdate.set(effect.id, { startTime: newStartTime, endTime: newEndTime })
                }
            }
        }
    },

    /**
     * Collect mutations for splitting clip-bound effects when a clip is split.
     */
    collectSplitMutations(
        project: Project,
        effect: Effect,
        change: ClipChange,
        batch: EffectMutationBatch
    ): void {
        if (!change.newClipIds || change.newClipIds.length < 2) return

        const videoClips = project.timeline.tracks
            .filter(t => t.type === TrackType.Video)
            .flatMap(t => t.clips)

        // Create a copy of the effect for each new clip
        for (const newClipId of change.newClipIds) {
            const clip = videoClips.find(c => c.id === newClipId)
            if (!clip) continue

            const startTime = clip.startTime
            const endTime = TimeConverter.getEndTime(clip)

            // First clip keeps original effect, subsequent clips get copies
            if (newClipId === change.newClipIds[0]) {
                // Update original effect to point to first new clip
                batch.toUpdate.set(effect.id, {
                    clipId: newClipId,
                    startTime,
                    endTime,
                })
            } else {
                // Create cloned effect for subsequent clips
                const clonedEffect: Effect = {
                    ...effect,
                    id: crypto.randomUUID(),
                    clipId: newClipId,
                    startTime,
                    endTime,
                    data: effect.data ? JSON.parse(JSON.stringify(effect.data)) : undefined,
                }
                batch.toAdd.push(clonedEffect)
            }
        }
    },
}
