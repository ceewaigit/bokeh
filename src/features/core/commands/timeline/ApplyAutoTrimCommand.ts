/**
 * ApplyAutoTrimCommand - Apply auto-trim to a clip based on detected edge idle periods.
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { ActivityDetectionService } from '@/features/media/analysis/detection-service'
import { SpeedUpType } from '@/types/speed-up'
import { reflowClips, calculateTimelineDuration } from '@/features/ui/timeline/clips/clip-reflow'
import { markProjectModified } from '@/features/core/stores/store-utils'
import { ClipChangeBuilder } from '@/features/effects/sync'
import type { Clip, Recording } from '@/types/project'

export interface AutoTrimOptions {
    trimStart: boolean
    trimEnd: boolean
}

interface TrimInfo {
    startTrimMs: number
    endTrimMs: number
    newSourceIn?: number
    newSourceOut?: number
}

export class ApplyAutoTrimCommand extends TimelineCommand<{ trimmedMs: number }> {
    private clipId: string
    private options: AutoTrimOptions
    private trimInfo: TrimInfo | null = null

    constructor(
        context: CommandContext,
        clipId: string,
        options: AutoTrimOptions = { trimStart: true, trimEnd: true }
    ) {
        super(context, {
            name: 'ApplyAutoTrim',
            description: 'Auto-trim idle start/end',
            category: 'timeline'
        })
        this.clipId = clipId
        this.options = options
    }

    private calculateTrimInfo(recording: Recording, clip: Clip): TrimInfo | null {
        const suggestions = ActivityDetectionService.getSuggestionsForClip(recording, clip)
        const edgeIdle = suggestions.edgeIdle
        if (edgeIdle.length === 0) return null

        const info: TrimInfo = { startTrimMs: 0, endTrimMs: 0 }
        for (const period of edgeIdle) {
            if (period.type === SpeedUpType.TrimStart && this.options.trimStart) {
                info.startTrimMs = period.metadata?.trimSavedMs || (period.endTime - period.startTime)
                info.newSourceIn = period.metadata?.newSourceIn || period.endTime
            }
            if (period.type === SpeedUpType.TrimEnd && this.options.trimEnd) {
                info.endTrimMs = period.metadata?.trimSavedMs || (period.endTime - period.startTime)
                info.newSourceOut = period.metadata?.newSourceOut || period.startTime
            }
        }

        return (info.startTrimMs > 0 || info.endTrimMs > 0) ? info : null
    }

    canExecute(): boolean {
        const project = this.context.getProject()
        if (!project) return false

        const result = this.context.findClip(this.clipId)
        if (!result) return false

        const recording = project.recordings.find(r => r.id === result.clip.recordingId)
        if (!recording) return false

        this.trimInfo = this.calculateTrimInfo(recording, result.clip)
        return this.trimInfo !== null
    }

    protected doMutate(draft: WritableDraft<ProjectStore>): void {
        const project = draft.currentProject
        if (!project) throw new Error('No active project')

        const lookup = this.findClip(project, this.clipId)
        if (!lookup) throw new Error(`Clip ${this.clipId} not found`)

        const { clip, track } = lookup

        // Recalculate trim info if not cached from canExecute
        if (!this.trimInfo) {
            const recording = project.recordings.find(r => r.id === clip.recordingId)
            if (!recording) throw new Error('Recording not found')
            this.trimInfo = this.calculateTrimInfo(recording, clip)
            if (!this.trimInfo) throw new Error('No trim info available')
        }

        const playbackRate = clip.playbackRate || 1
        let totalTrimmed = 0

        const oldSourceIn = clip.sourceIn || 0
        const oldSourceOut = clip.sourceOut || (oldSourceIn + clip.duration * playbackRate)
        const originalStart = clip.startTime
        const originalEnd = clip.startTime + clip.duration

        if (this.options.trimStart && this.trimInfo.newSourceIn !== undefined) {
            const trimDelta = (this.trimInfo.newSourceIn - oldSourceIn) / playbackRate
            clip.sourceIn = this.trimInfo.newSourceIn
            clip.duration -= trimDelta
            totalTrimmed += this.trimInfo.startTrimMs
        }

        if (this.options.trimEnd && this.trimInfo.newSourceOut !== undefined) {
            clip.sourceOut = this.trimInfo.newSourceOut
            const newDuration = (this.trimInfo.newSourceOut - (clip.sourceIn || 0)) / playbackRate
            clip.duration = newDuration
            totalTrimmed += this.trimInfo.endTrimMs
        }

        const clipIndex = track.clips.findIndex(c => c.id === this.clipId)
        if (clipIndex !== -1) {
            reflowClips(track, clipIndex)
        }

        project.timeline.duration = calculateTimelineDuration(project)
        markProjectModified(draft)

        const trimSide = this.options.trimStart ? 'start' : 'end'
        const trimChange = ClipChangeBuilder.buildTrimChange(
            clip, trimSide,
            { startTime: originalStart, endTime: originalEnd, sourceIn: oldSourceIn, sourceOut: oldSourceOut },
            track.type
        )
        this.deferClipChange(trimChange)

        this.setResult({ success: true, data: { trimmedMs: totalTrimmed } })
    }

    getTrimInfo(): TrimInfo | null {
        return this.trimInfo
    }
}
