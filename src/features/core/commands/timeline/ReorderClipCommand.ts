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
import { reflowClips, calculateTimelineDuration } from '@/features/ui/timeline/clips/clip-reflow'
import { EffectSyncService } from '@/features/effects/sync'
import { TrackType } from '@/types/project'
import { markProjectModified } from '@/features/core/stores/store-utils'

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

        const { clip, track } = result
        const clipIndex = track.clips.findIndex(c => c.id === this.clipId)

        if (clipIndex === -1) {
            throw new Error(`Clip ${this.clipId} not found in track`)
        }

        // Capture old position for effect sync
        const oldStartTime = clip.startTime

        // Perform reorder if position changed
        if (clipIndex !== this.insertIndex) {
            const [removed] = track.clips.splice(clipIndex, 1)
            track.clips.splice(this.insertIndex, 0, removed)
        }

        // Reflow all clips to ensure contiguity from time 0
        reflowClips(track, 0)

        // Sync effects if this is the video track
        if (track.type === TrackType.Video) {
            const clipChange = EffectSyncService.buildReorderChange(clip, oldStartTime, clip.startTime)
            EffectSyncService.syncAfterClipChange(draft.currentProject, clipChange)
        }

        // Update timeline duration
        draft.currentProject.timeline.duration = calculateTimelineDuration(draft.currentProject)
        markProjectModified(draft)

        this.setResult({ success: true, data: { clipId: this.clipId } })
    }
}

