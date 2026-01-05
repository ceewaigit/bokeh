/**
 * Clip CRUD Operations
 * 
 * Functions for adding, removing, duplicating, and restoring clips.
 * Extracted from timeline-operations.ts for better organization.
 */

import type { Project, Track, Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import { validatePosition, getReorderTarget } from '@/features/ui/timeline/utils/drag-positioning'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { withMutation } from '@/features/ui/timeline/clips/clip-mutation'

/**
 * Add clip to track at specified position.
 */
export function addClipToTrack(
    project: Project,
    clipOrRecordingId: Clip | string,
    startTime?: number,
    options?: { trackType?: TrackType; insertIndex?: number }
): Clip | null {
    let clip: Clip

    if (typeof clipOrRecordingId === 'object') {
        clip = clipOrRecordingId
    } else {
        const recording = project.recordings.find(r => r.id === clipOrRecordingId)
        if (!recording) return null

        clip = {
            id: `clip-${Date.now()}`,
            recordingId: clipOrRecordingId,
            startTime: startTime ?? 0,
            duration: recording.duration,
            sourceIn: 0,
            sourceOut: recording.duration
        }
    }

    const targetTrackType = options?.trackType || TrackType.Video
    const targetTrack = project.timeline.tracks.find(t => t.type === targetTrackType)
    if (!targetTrack) return null

    const proposedTime = startTime ?? project.timeline.duration
    let insertIndex: number

    if (options?.insertIndex !== undefined) {
        insertIndex = options.insertIndex
    } else if (targetTrackType === TrackType.Webcam) {
        // Webcam track: Ensure no collision by validating position
        const blocks = targetTrack.clips.map(c => ({
            id: c.id,
            startTime: c.startTime,
            endTime: c.startTime + c.duration
        }))

        const validation = validatePosition(
            proposedTime,
            clip.duration,
            blocks,
            undefined, // no excludeClipId
            { findAlternativeIfInvalid: true }
        )

        // Use the valid position (original or suggested)
        clip.startTime = validation.isValid ? validation.finalPosition : (validation.suggestedPosition ?? validation.finalPosition)

        // Find correct sorted index for this new startTime
        // (Default append if it's after everything, otherwise find first clip that starts after it)
        const sortedIndex = targetTrack.clips.findIndex(c => c.startTime > clip.startTime)
        insertIndex = sortedIndex === -1 ? targetTrack.clips.length : sortedIndex
    } else {
        const blocks = targetTrack.clips.map(c => ({ id: c.id, startTime: c.startTime, endTime: c.startTime + c.duration }))
        const result = getReorderTarget(proposedTime, blocks)
        insertIndex = result.insertIndex
    }

    return withMutation(project, () => {
        targetTrack.clips.splice(insertIndex, 0, clip)
        return clip
    }, targetTrack)
}

/**
 * Remove clip from track by ID.
 */
export function removeClipFromTrack(
    project: Project,
    clipId: string,
    knownTrack?: Track
): boolean {
    if (knownTrack) {
        const index = knownTrack.clips.findIndex(c => c.id === clipId)
        if (index !== -1) {
            return withMutation(project, () => {
                knownTrack.clips.splice(index, 1)
                knownTrack.clips = [...knownTrack.clips]
                return true
            }, knownTrack)
        }
        return false
    }

    for (const track of project.timeline.tracks) {
        const index = track.clips.findIndex(c => c.id === clipId)
        if (index !== -1) {
            return withMutation(project, () => {
                track.clips.splice(index, 1)
                track.clips = [...track.clips]
                return true
            }, track)
        }
    }
    return false
}

/**
 * Duplicate a clip and insert after the original.
 */
export function duplicateClipInTrack(
    project: Project,
    clipId: string
): Clip | null {
    const result = ClipLookup.byId(project, clipId)
    if (!result) return null

    const { clip, track } = result
    const clipIndex = track.clips.findIndex(c => c.id === clipId)

    const newClip: Clip = {
        ...clip,
        id: `${clip.id}-copy-${Date.now()}`,
        startTime: clip.startTime + clip.duration,
    }

    return withMutation(project, () => {
        track.clips.splice(clipIndex + 1, 0, newClip)
        return newClip
    }, track)
}

/**
 * Restore a deleted clip at a specific index (for undo).
 */
export function restoreClipToTrack(
    project: Project,
    trackId: string,
    clip: Clip,
    atIndex: number
): boolean {
    const track = project.timeline.tracks.find(t => t.id === trackId)
    if (!track) return false

    // Check for duplicate (idempotency)
    if (track.clips.some(c => c.id === clip.id)) {
        return true
    }

    const safeIndex = Math.max(0, Math.min(atIndex, track.clips.length))
    return withMutation(project, () => {
        track.clips.splice(safeIndex, 0, clip)
        return true
    }, track)
}

/**
 * Atomically remove clips and restore others (for undo/redo).
 */
export function restoreClipsToTrack(
    project: Project,
    trackId: string,
    removeClipIds: string[],
    addClips: Clip[]
): boolean {
    const track = project.timeline.tracks.find(t => t.id === trackId)
    if (!track) return false

    // Remove specified clips
    track.clips = track.clips.filter(c => !removeClipIds.includes(c.id))

    // Add new clips
    for (const clip of addClips) {
        if (!track.clips.some(c => c.id === clip.id)) {
            track.clips.push(clip)
        }
    }

    return withMutation(project, () => {
        // Sort and reflow
        track.clips.sort((a, b) => a.startTime - b.startTime)
        return true
    }, track)
}

/**
 * Update clip properties with optional reflow.
 */
export function updateClipInTrack(
    project: Project,
    clipId: string,
    updates: Partial<Clip>,
    options?: { exact?: boolean; maintainContiguous?: boolean },
    knownTrack?: Track
): boolean {
    let clip: Clip
    let track: Track

    if (knownTrack) {
        const foundClip = knownTrack.clips.find(c => c.id === clipId)
        if (!foundClip) return false
        clip = foundClip
        track = knownTrack
    } else {
        const result = ClipLookup.byId(project, clipId)
        if (!result) return false
        clip = result.clip
        track = result.track
    }

    const shouldReflow = options?.maintainContiguous !== false

    return withMutation(project, () => {
        // ENFORCE: Webcam track collision detection during updates (drag/move/resize)
        if (track.type === TrackType.Webcam) {
            const hasStartChange = typeof updates.startTime === 'number' && updates.startTime !== clip.startTime
            const hasDurationChange = typeof updates.duration === 'number' && updates.duration !== clip.duration

            if (hasStartChange || hasDurationChange) {
                const proposedTime = updates.startTime ?? clip.startTime
                const proposedDuration = updates.duration ?? clip.duration

                const blocks = track.clips.map(c => ({
                    id: c.id,
                    startTime: c.startTime,
                    endTime: c.startTime + c.duration
                }))

                const validation = validatePosition(
                    proposedTime,
                    proposedDuration,
                    blocks,
                    clip.id, // exclude self
                    { findAlternativeIfInvalid: true }
                )

                if (!validation.isValid) {
                    if (hasStartChange) {
                        // If moving, snap to suggested position
                        updates.startTime = validation.suggestedPosition ?? validation.finalPosition
                    } else if (hasDurationChange) {
                        // If resizing (duration only) and it invalidates position, it means we grew into neighbor.
                        // Clamp duration to available space.
                        // Find the next clip after current start time
                        const sortedClips = track.clips
                            .filter(c => c.id !== clip.id)
                            .sort((a, b) => a.startTime - b.startTime)

                        const nextClip = sortedClips.find(c => c.startTime >= clip.startTime)
                        if (nextClip) {
                            // Max duration is up to next clip
                            const maxDuration = nextClip.startTime - clip.startTime
                            if (proposedDuration > maxDuration) {
                                updates.duration = Math.max(1000, maxDuration) // enforce min duration?
                            }
                        }
                    }
                }
            }
        }

        Object.assign(clip, updates)
        return true
    }, shouldReflow ? track : undefined)
}
