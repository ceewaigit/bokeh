/**
 * ReorderClipCommand - Move a clip to a new position in the timeline.
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { reflowClips, calculateTimelineDuration } from '@/features/ui/timeline/clips/clip-reflow'
import { ClipChangeBuilder } from '@/features/effects/sync'
import { TrackType } from '@/types/project'
import { markProjectModified } from '@/features/core/stores/store-utils'

export class ReorderClipCommand extends TimelineCommand<{ clipId: string }> {
    private clipId: string
    private insertIndex: number

    constructor(
        context: CommandContext,
        clipId: string,
        insertIndex: number
    ) {
        super(context, {
            name: 'ReorderClip',
            description: 'Reorder clip',
            category: 'timeline'
        })
        this.clipId = clipId
        this.insertIndex = insertIndex
    }

    canExecute(): boolean {
        return this.clipExists(this.clipId)
    }

    protected doMutate(draft: WritableDraft<ProjectStore>): void {
        const project = draft.currentProject
        if (!project) throw new Error('No active project')

        const lookup = this.findClip(project, this.clipId)
        if (!lookup) throw new Error(`Clip ${this.clipId} not found`)

        const { clip, track, index: clipIndex } = lookup
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
            const clipChange = ClipChangeBuilder.buildReorderChange(clip, oldStartTime, clip.startTime, track.type)
            this.deferClipChange(clipChange)
        }

        // Update timeline duration
        project.timeline.duration = calculateTimelineDuration(project)
        markProjectModified(draft)

        this.setResult({ success: true, data: { clipId: this.clipId } })
    }
}

