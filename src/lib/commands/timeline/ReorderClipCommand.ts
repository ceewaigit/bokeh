import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export class ReorderClipCommand extends Command<{ clipId: string }> {
    private originalClips?: Clip[]
    private trackId?: string

    constructor(
        private context: CommandContext,
        private clipId: string,
        private insertIndex: number
    ) {
        super({
            name: 'ReorderClip',
            description: `Move clip ${clipId} to index ${insertIndex}`,
            category: 'timeline'
        })
    }

    canExecute(): boolean {
        return !!this.context.findClip(this.clipId)
    }

    doExecute(): CommandResult<{ clipId: string }> {
        const store = this.context.getStore()
        const clipInfo = this.context.findClip(this.clipId)

        if (!clipInfo) {
            return { success: false, error: `Clip ${this.clipId} not found` }
        }

        this.trackId = clipInfo.track.id
        // Snapshot original clips array for exact undo
        this.originalClips = JSON.parse(JSON.stringify(clipInfo.track.clips))

        store.reorderClip(this.clipId, this.insertIndex)

        return {
            success: true,
            data: { clipId: this.clipId }
        }
    }

    doUndo(): CommandResult<{ clipId: string }> {
        if (!this.trackId || !this.originalClips) {
            return { success: false, error: 'No original state to restore' }
        }

        const store = this.context.getStore()

        store.updateProjectData((project) => {
            const track = project.timeline.tracks.find(t => t.id === this.trackId)
            if (track && this.originalClips) {
                track.clips = this.originalClips
            }
            return project
        })

        return {
            success: true,
            data: { clipId: this.clipId }
        }
    }

    doRedo(): CommandResult<{ clipId: string }> {
        const store = this.context.getStore()
        store.reorderClip(this.clipId, this.insertIndex)
        return {
            success: true,
            data: { clipId: this.clipId }
        }
    }
}
