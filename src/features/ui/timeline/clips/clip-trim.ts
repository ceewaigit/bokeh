/**
 * Clip Trim Operations
 * 
 * Functions for trimming clips from start/end.
 * Extracted from timeline-operations.ts for better organization.
 */

import type { Project, Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { withMutation } from '@/features/ui/timeline/clips/clip-mutation'
import { validatePosition } from '@/features/ui/timeline/utils/drag-positioning'

// Minimum clip duration (1 second) - matches UI constraint
export const MIN_CLIP_DURATION_MS = 1000

/**
 * Calculate new clip properties when trimming from start.
 * Returns null if the trim would be invalid.
 */
export function trimClipStart(
    clip: Clip,
    newStartTime: number
): Partial<Clip> | null {
    const newDuration = clip.duration - (newStartTime - clip.startTime)

    if (newStartTime < 0 || newDuration < MIN_CLIP_DURATION_MS) {
        return null
    }

    const trimAmount = newStartTime - clip.startTime
    const playbackRate = clip.playbackRate || 1

    // Sticky fade behavior: reduce fade if longer than new duration
    let newIntroFadeMs: number | undefined = clip.introFadeMs
    if (clip.introFadeMs) {
        newIntroFadeMs = Math.min(clip.introFadeMs, newDuration)
    }

    const newSourceIn = clip.sourceIn + (trimAmount * playbackRate)

    // Respect locked source bounds
    const effectiveMinSource = clip.lockedSourceIn ?? 0
    if (newSourceIn < effectiveMinSource) {
        return null
    }

    return {
        startTime: newStartTime,
        duration: newDuration,
        sourceIn: Math.max(0, newSourceIn),
        introFadeMs: newIntroFadeMs,
    }
}

/**
 * Calculate new clip properties when trimming from end.
 * Returns null if the trim would be invalid.
 */
export function trimClipEnd(
    clip: Clip,
    newEndTime: number
): Partial<Clip> | null {
    const newDuration = newEndTime - clip.startTime

    if (newEndTime < 0 || newDuration < MIN_CLIP_DURATION_MS) {
        return null
    }

    const playbackRate = clip.playbackRate || 1
    const durationChange = newDuration - clip.duration
    const sourceChange = durationChange * playbackRate

    // Sticky fade behavior
    let newOutroFadeMs: number | undefined = clip.outroFadeMs
    if (clip.outroFadeMs) {
        newOutroFadeMs = Math.min(clip.outroFadeMs, newDuration)
    }

    const newSourceOut = clip.sourceOut + sourceChange

    // Respect locked source bounds
    const effectiveMaxSource = clip.lockedSourceOut ?? Infinity
    if (newSourceOut > effectiveMaxSource) {
        return null
    }

    return {
        duration: newDuration,
        sourceOut: Math.max(clip.sourceIn, newSourceOut),
        outroFadeMs: newOutroFadeMs,
    }
}

/**
 * Execute trim from start on a clip in the project.
 */
export function executeTrimClipStart(
    project: Project,
    clipId: string,
    newStartTime: number
): boolean {
    const result = ClipLookup.byId(project, clipId)
    if (!result) return false

    const { clip, track } = result
    let validatedStartTime = newStartTime

    // ENFORCE: Webcam track collision detection during trim start
    if (track.type === TrackType.Webcam) {
        const proposedDuration = clip.startTime + clip.duration - newStartTime

        // Convert clips to generic blocks
        const blocks = track.clips.map(c => ({
            id: c.id,
            startTime: c.startTime,
            endTime: c.startTime + c.duration
        }))

        // Validate the NEW position and duration
        const validation = validatePosition(
            newStartTime,
            proposedDuration,
            blocks,
            clip.id,
            { findAlternativeIfInvalid: true }
        )

        if (!validation.isValid) {
            // Clamp to the suggested position (nearest available gap start)
            validatedStartTime = validation.suggestedPosition ?? validation.finalPosition
        }
    }

    // Recalculate duration if start time was clamped
    // We must pass the original clip to trim function but using our validated time
    const oldStartTime = clip.startTime
    const trimResult = trimClipStart(clip, validatedStartTime)
    if (!trimResult) return false

    const shouldReflow = newStartTime > oldStartTime

    return withMutation(project, () => {
        Object.assign(clip, trimResult)
        return true
    }, shouldReflow ? track : undefined)
}

/**
 * Execute trim from end on a clip in the project.
 */
export function executeTrimClipEnd(
    project: Project,
    clipId: string,
    newEndTime: number
): boolean {
    const result = ClipLookup.byId(project, clipId)
    if (!result) return false

    const { clip, track } = result
    let validatedEndTime = newEndTime

    // ENFORCE: Webcam track collision detection during trim end
    if (track.type === TrackType.Webcam) {
        const proposedDuration = newEndTime - clip.startTime

        // Convert clips to generic blocks
        const blocks = track.clips.map(c => ({
            id: c.id,
            startTime: c.startTime,
            endTime: c.startTime + c.duration
        }))

        // Validate the position with NEW duration
        const validation = validatePosition(
            clip.startTime,
            proposedDuration,
            blocks,
            clip.id,
            { findAlternativeIfInvalid: true }
        )

        if (!validation.isValid) {
            // Check if we are expanding into someone (newEndTime > oldEndTime)
            // If invalid, the suggested position usually shifts the clip, which we don't want for End Trim.
            // We want to find the MAX valid duration.
            // Simplified approach: Find the next clip's start time and clamp to it.
            const sortedClips = track.clips
                .filter(c => c.id !== clipId)
                .sort((a, b) => a.startTime - b.startTime)

            const nextClip = sortedClips.find(c => c.startTime >= clip.startTime)
            if (nextClip && newEndTime > nextClip.startTime) {
                validatedEndTime = nextClip.startTime
            }
        }
    }

    const oldEndTime = clip.startTime + clip.duration
    const trimResult = trimClipEnd(clip, validatedEndTime)
    if (!trimResult) return false

    const shouldReflow = newEndTime <= oldEndTime

    return withMutation(project, () => {
        Object.assign(clip, trimResult)

        if (newEndTime > oldEndTime) {
            // Expanding - push subsequent clips
            const expansion = newEndTime - oldEndTime
            const clipIndex = track.clips.findIndex(c => c.id === clipId)
            for (let i = clipIndex + 1; i < track.clips.length; i++) {
                track.clips[i] = { ...track.clips[i], startTime: track.clips[i].startTime + expansion }
            }
        }

        return true
    }, shouldReflow ? track : undefined)
}
