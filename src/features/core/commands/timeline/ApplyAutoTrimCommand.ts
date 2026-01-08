/**
 * Command to apply auto-trim to a clip based on detected edge idle periods
 * Trims idle time from the start and/or end of clips
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import { EffectType } from '@/types/project'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { ActivityDetectionService } from '@/features/ui/timeline/activity-detection/detection-service'
import { SpeedUpType } from '@/types/speed-up'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { EffectStore } from '@/features/effects/core/store'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { reflowClips, calculateTimelineDuration } from '@/features/ui/timeline/clips/clip-reflow'

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

export class ApplyAutoTrimCommand extends PatchedCommand<{
    trimmedMs: number
}> {
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

    canExecute(): boolean {
        const project = this.context.getProject()
        if (!project) return false

        const result = this.context.findClip(this.clipId)
        if (!result) return false

        const recording = project.recordings.find(r => r.id === result.clip.recordingId)
        if (!recording) return false

        // Check if there's edge idle to trim
        const suggestions = ActivityDetectionService.getSuggestionsForClip(recording, result.clip)
        const edgeIdle = suggestions.edgeIdle

        if (edgeIdle.length === 0) return false

        // Calculate trim info
        this.trimInfo = {
            startTrimMs: 0,
            endTrimMs: 0
        }

        for (const period of edgeIdle) {
            if (period.type === SpeedUpType.TrimStart && this.options.trimStart) {
                this.trimInfo.startTrimMs = period.metadata?.trimSavedMs || (period.endTime - period.startTime)
                this.trimInfo.newSourceIn = period.metadata?.newSourceIn || period.endTime
            }
            if (period.type === SpeedUpType.TrimEnd && this.options.trimEnd) {
                this.trimInfo.endTrimMs = period.metadata?.trimSavedMs || (period.endTime - period.startTime)
                this.trimInfo.newSourceOut = period.metadata?.newSourceOut || period.startTime
            }
        }

        return (this.trimInfo.startTrimMs > 0 || this.trimInfo.endTrimMs > 0)
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

        // Recalculate trim info if needed
        if (!this.trimInfo) {
            const recording = draft.currentProject.recordings.find(r => r.id === clip.recordingId)
            if (!recording) {
                throw new Error('Recording not found')
            }
            const suggestions = ActivityDetectionService.getSuggestionsForClip(recording, clip)
            const edgeIdle = suggestions.edgeIdle

            this.trimInfo = { startTrimMs: 0, endTrimMs: 0 }
            for (const period of edgeIdle) {
                if (period.type === SpeedUpType.TrimStart && this.options.trimStart) {
                    this.trimInfo.startTrimMs = period.metadata?.trimSavedMs || (period.endTime - period.startTime)
                    this.trimInfo.newSourceIn = period.metadata?.newSourceIn || period.endTime
                }
                if (period.type === SpeedUpType.TrimEnd && this.options.trimEnd) {
                    this.trimInfo.endTrimMs = period.metadata?.trimSavedMs || (period.endTime - period.startTime)
                    this.trimInfo.newSourceOut = period.metadata?.newSourceOut || period.startTime
                }
            }
        }

        const playbackRate = clip.playbackRate || 1
        const originalDuration = clip.duration
        const originalEnd = clip.startTime + originalDuration
        let totalTrimmed = 0

        // Get all effects for shifting
        const allEffects = EffectStore.getAll(draft.currentProject)

        // Apply start trim - this shifts the clip start forward and shortens duration
        if (this.options.trimStart && this.trimInfo.newSourceIn !== undefined) {
            const oldSourceIn = clip.sourceIn || 0
            const trimDelta = (this.trimInfo.newSourceIn - oldSourceIn) / playbackRate

            clip.sourceIn = this.trimInfo.newSourceIn
            clip.duration -= trimDelta
            totalTrimmed += this.trimInfo.startTrimMs

            // Shift effects that start within or after this clip's trimmed portion
            // Effects need to move backward by the trim amount (timeline got shorter)
            for (const effect of allEffects) {
                if (effect.type === EffectType.Background || effect.type === EffectType.Cursor) continue
                if (effect.clipId === this.clipId) continue // Clip-bound effects are already correct

                // Effects that started after clip start should shift back
                if (effect.startTime > clip.startTime) {
                    effect.startTime -= trimDelta
                    effect.endTime -= trimDelta
                }
            }
        }

        // Apply end trim - this shortens duration from the end
        if (this.options.trimEnd && this.trimInfo.newSourceOut !== undefined) {
            const oldSourceOut = clip.sourceOut || (clip.sourceIn || 0) + clip.duration * playbackRate
            const trimDelta = (oldSourceOut - this.trimInfo.newSourceOut) / playbackRate

            clip.sourceOut = this.trimInfo.newSourceOut
            clip.duration -= trimDelta
            totalTrimmed += this.trimInfo.endTrimMs

            // Shift effects that are after the original clip end backward
            for (const effect of allEffects) {
                if (effect.type === EffectType.Background || effect.type === EffectType.Cursor) continue
                if (effect.clipId === this.clipId) continue

                // Effects after the original end need to shift back
                if (effect.startTime >= originalEnd) {
                    effect.startTime -= trimDelta
                    effect.endTime -= trimDelta
                }
            }
        }

        // Reflow clips in track
        const clipIndex = track.clips.findIndex(c => c.id === this.clipId)
        if (clipIndex !== -1) {
            reflowClips(track, clipIndex)
        }

        // Update timeline duration
        draft.currentProject.timeline.duration = calculateTimelineDuration(draft.currentProject)
        draft.currentProject.modifiedAt = new Date().toISOString()

        // Sync keystroke effects
        EffectInitialization.syncKeystrokeEffects(draft.currentProject)

        // Clear render caches
        TimelineDataService.invalidateCache(draft.currentProject)

        this.setResult({ success: true, data: { trimmedMs: totalTrimmed } })
    }

    getTrimInfo(): TrimInfo | null {
        return this.trimInfo
    }
}
