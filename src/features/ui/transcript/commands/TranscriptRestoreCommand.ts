import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { SourceTimeRange } from '@/types/project'
import { PatchedCommand } from '@/features/core/commands'
import type { CommandContext } from '@/features/core/commands'

/**
 * TranscriptRestoreCommand
 * 
 * Restores previously hidden transcript regions by removing them from hiddenRegions.
 * Timeline-Centric: this modifies transcriptEdits.hiddenRegions for the recording,
 * which are then projected to timeline space by TimelineDataService.getGlobalTimelineSkips.
 */
export class TranscriptRestoreCommand extends PatchedCommand<void> {
    constructor(
        context: CommandContext,
        private recordingId: string,
        private rangesToRestore: { startTime: number; endTime: number }[]
    ) {
        super(context, {
            name: 'TranscriptRestore',
            description: `Restore ${rangesToRestore.length} regions`,
            category: 'transcript'
        })
    }

    canExecute(): boolean {
        const project = this.context.getStore().currentProject
        if (!project) return false
        const recording = project.recordings.find(r => r.id === this.recordingId)
        if (!recording) return false
        return this.rangesToRestore.length > 0
    }

    protected mutate(draft: WritableDraft<ProjectStore>): void {
        if (!draft.currentProject) return

        const timeline = draft.currentProject.timeline
        const editState = timeline.transcriptEdits?.[this.recordingId]
        if (!editState?.hiddenRegions?.length) return

        // Subtract each restore range from the hidden regions
        let resultRanges = editState.hiddenRegions

        for (const restoreRange of this.rangesToRestore) {
            resultRanges = this.subtractRange(resultRanges, restoreRange)
        }

        editState.hiddenRegions = resultRanges

        console.info('[TranscriptRestoreCommand] Updated hiddenRegions:', {
            count: resultRanges.length,
            recordingId: this.recordingId,
            restored: this.rangesToRestore.length
        })

        draft.currentProject.modifiedAt = new Date().toISOString()
    }

    /**
     * Subtract a range from a collection of hidden regions.
     * Returns new array with the range "punched out" of existing hidden regions.
     */
    private subtractRange(
        hiddenRegions: SourceTimeRange[],
        restoreRange: { startTime: number; endTime: number }
    ): SourceTimeRange[] {
        const result: SourceTimeRange[] = []

        for (const region of hiddenRegions) {
            // No overlap - keep region as-is
            if (restoreRange.endTime <= region.startTime || restoreRange.startTime >= region.endTime) {
                result.push(region)
                continue
            }

            // Restore range fully covers this hidden region - remove it
            if (restoreRange.startTime <= region.startTime && restoreRange.endTime >= region.endTime) {
                continue
            }

            // Restore range is in the middle - split into two
            if (restoreRange.startTime > region.startTime && restoreRange.endTime < region.endTime) {
                result.push({ startTime: region.startTime, endTime: restoreRange.startTime })
                result.push({ startTime: restoreRange.endTime, endTime: region.endTime })
                continue
            }

            // Partial overlap from the start
            if (restoreRange.startTime <= region.startTime && restoreRange.endTime < region.endTime) {
                result.push({ startTime: restoreRange.endTime, endTime: region.endTime })
                continue
            }

            // Partial overlap from the end
            if (restoreRange.startTime > region.startTime && restoreRange.endTime >= region.endTime) {
                result.push({ startTime: region.startTime, endTime: restoreRange.startTime })
                continue
            }
        }

        return result
    }
}
