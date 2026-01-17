/**
 * Clip Split Operations
 * 
 * Functions for splitting clips at specific time points.
 * Extracted from timeline-operations.ts for better organization.
 */

import type { Project, Clip } from '@/types/project'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { withMutation } from '@/features/ui/timeline/clips/clip-mutation'
import { ClipUtils } from '@/features/ui/timeline/time/clip-utils'
import { clipRelativeToSource } from '@/features/ui/timeline/time/time-space-converter'

/**
 * Split a single clip into two at the specified relative time.
 * Returns null if the split point is invalid.
 */
export function splitClipAtTime(
    clip: Clip,
    relativeSplitTime: number
): { firstClip: Clip; secondClip: Clip } | null {
    if (relativeSplitTime <= 0 || relativeSplitTime >= clip.duration) {
        return null
    }

    const { sourceIn: clipSourceIn, sourceOut: clipSourceOut } = ClipUtils.getSourceRange(clip)

    const sourceSplitAbsolute = clipRelativeToSource(relativeSplitTime, clip)
    const sourceSplitPoint = sourceSplitAbsolute - clipSourceIn

    const firstClip: Clip = {
        id: crypto.randomUUID(),
        recordingId: clip.recordingId,
        startTime: clip.startTime,
        duration: relativeSplitTime,
        sourceIn: clipSourceIn,
        sourceOut: clipSourceIn + sourceSplitPoint,
        playbackRate: clip.playbackRate,
        introFadeMs: clip.introFadeMs,
    }

    // Copy speed-up flags
    if (clip.typingSpeedApplied) firstClip.typingSpeedApplied = true
    if (clip.idleSpeedApplied) firstClip.idleSpeedApplied = true

    // Handle timeRemapPeriods
    if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
        const splitSourceTime = clipSourceIn + sourceSplitPoint
        const firstPeriods = clip.timeRemapPeriods
            .filter(p => p.sourceStartTime < splitSourceTime)
            .map(p => ({
                ...p,
                sourceEndTime: Math.min(p.sourceEndTime, splitSourceTime)
            }))
        if (firstPeriods.length > 0) {
            firstClip.timeRemapPeriods = firstPeriods
        }
    }

    const secondClip: Clip = {
        id: crypto.randomUUID(),
        recordingId: clip.recordingId,
        startTime: clip.startTime + relativeSplitTime,
        duration: clip.duration - relativeSplitTime,
        sourceIn: clipSourceIn + sourceSplitPoint,
        sourceOut: clipSourceOut,
        playbackRate: clip.playbackRate,
        outroFadeMs: clip.outroFadeMs,
    }

    // Copy speed-up flags
    if (clip.typingSpeedApplied) secondClip.typingSpeedApplied = true
    if (clip.idleSpeedApplied) secondClip.idleSpeedApplied = true

    // Handle timeRemapPeriods
    if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
        const splitSourceTime = clipSourceIn + sourceSplitPoint
        const secondPeriods = clip.timeRemapPeriods
            .filter(p => p.sourceEndTime > splitSourceTime)
            .map(p => ({
                ...p,
                sourceStartTime: Math.max(p.sourceStartTime, splitSourceTime)
            }))
        if (secondPeriods.length > 0) {
            secondClip.timeRemapPeriods = secondPeriods
        }
    }

    return { firstClip, secondClip }
}

/**
 * Execute split clip operation on a clip in the project.
 */
export function executeSplitClip(
    project: Project,
    clipId: string,
    splitTime: number  // Timeline space
): { firstClip: Clip; secondClip: Clip } | null {
    const result = ClipLookup.byId(project, clipId)
    if (!result) return null

    const { clip, track } = result

    // Convert timeline position to clip-relative time
    const clipRelativeTime = splitTime - clip.startTime

    const splitResult = splitClipAtTime(clip, clipRelativeTime)
    if (!splitResult) return null

    const clipIndex = track.clips.findIndex(c => c.id === clipId)
    const mutationResult = withMutation(project, () => {
        track.clips.splice(clipIndex, 1, splitResult.firstClip, splitResult.secondClip)

        // Note: Crop and other clip-bound effects are handled by TimelineSyncOrchestrator

        return {
            firstClip: splitResult.firstClip,
            secondClip: splitResult.secondClip
        }
    })

    // Note: Effect sync is handled by TimelineCommand.mutate() when this is called via SplitClipCommand

    return mutationResult
}
