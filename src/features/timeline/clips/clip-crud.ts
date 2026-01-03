/**
 * Clip CRUD Operations
 * 
 * Functions for adding, removing, duplicating, and restoring clips.
 * Extracted from timeline-operations.ts for better organization.
 */

import type { Project, Track, Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import { ClipPositioning } from '@/features/timeline/clips/clip-positioning'
import { ClipLookup } from '@/features/timeline/clips/clip-lookup'
import { withMutation } from '@/features/timeline/clips/clip-mutation'

/**
 * Add clip to track at specified position.
 */
export function addClipToTrack(
    project: Project,
    clipOrRecordingId: Clip | string,
    startTime?: number,
    options?: { trackType?: TrackType }
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
    const { insertIndex } = ClipPositioning.getReorderTarget(proposedTime, targetTrack.clips)

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
        Object.assign(clip, updates)
        return true
    }, shouldReflow ? track : undefined)
}
