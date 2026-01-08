/**
 * ReorderClipCommand - Move a clip to a new position in the timeline
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { reflowClips, syncCropEffectTimes, calculateTimelineDuration } from '@/features/ui/timeline/clips/clip-reflow'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { TrackType, EffectType } from '@/types/project'

export class ReorderClipCommand extends PatchedCommand<{ clipId: string }> {
    private clipId: string
    private insertIndex: number

    constructor(
        context: CommandContext,
        clipId: string,
        insertIndex: number
    ) {
        super(context, {
            name: 'ReorderClip',
            description: `Move clip ${clipId} to index ${insertIndex}`,
            category: 'timeline'
        })
        this.clipId = clipId
        this.insertIndex = insertIndex
    }

    canExecute(): boolean {
        return !!this.context.findClip(this.clipId)
    }

    protected mutate(draft: WritableDraft<ProjectStore>): void {
        if (!draft.currentProject) {
            throw new Error('No active project')
        }

        const result = ClipLookup.byId(draft.currentProject, this.clipId)
        if (!result) {
            throw new Error(`Clip ${this.clipId} not found`)
        }

        const { track } = result
        const clipIndex = track.clips.findIndex(c => c.id === this.clipId)

        if (clipIndex === -1) {
            throw new Error(`Clip ${this.clipId} not found in track`)
        }

        // Track old positions for effect shifting
        const oldRanges = track.clips.map(c => ({
            id: c.id,
            startTime: c.startTime,
            endTime: c.startTime + c.duration
        }))

        // Perform reorder if position changed
        if (clipIndex !== this.insertIndex) {
            const [clip] = track.clips.splice(clipIndex, 1)
            track.clips.splice(this.insertIndex, 0, clip)
        }

        // Reflow all clips to ensure contiguity from time 0
        reflowClips(track, 0)

        // Calculate how each clip moved
        const newRanges = new Map<string, { startTime: number; endTime: number }>()
        for (const clip of track.clips) {
            newRanges.set(clip.id, {
                startTime: clip.startTime,
                endTime: clip.startTime + clip.duration
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

        // Shift effects if this is the video track
        if (track.type === TrackType.Video) {
            const effects = draft.currentProject.timeline.effects ?? []
            const shiftableTypes = new Set([
                EffectType.Zoom,
                EffectType.Screen,
                EffectType.Plugin,
                EffectType.Keystroke
            ])

            for (const effect of effects) {
                // Clip-bound effects shift with their clip
                if (effect.clipId && deltaByClipId.has(effect.clipId)) {
                    const delta = deltaByClipId.get(effect.clipId) ?? 0
                    effect.startTime += delta
                    effect.endTime += delta
                    continue
                }

                if (!shiftableTypes.has(effect.type)) continue

                // Find which clip this effect originally belonged to
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

            syncCropEffectTimes(draft.currentProject)
            EffectInitialization.syncKeystrokeEffects(draft.currentProject)
        }

        // Update timeline duration
        draft.currentProject.timeline.duration = calculateTimelineDuration(draft.currentProject)
        draft.currentProject.modifiedAt = new Date().toISOString()

        this.setResult({ success: true, data: { clipId: this.clipId } })
    }
}
