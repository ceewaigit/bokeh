/**
 * Clip CRUD Operations
 * 
 * Functions for adding, removing, duplicating, and restoring clips.
 * Extracted from timeline-operations.ts for better organization.
 */

import type { Project, Track, Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import { ClipPositioning } from '@/lib/timeline/clip-positioning'
import { findClipById, reflowClips, calculateTimelineDuration, syncCropEffectTimes } from './clip-reflow'

/**
 * Add clip to track at specified position.
 */
export function addClipToTrack(
    project: Project,
    clipOrRecordingId: Clip | string,
    startTime?: number
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

    const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
    if (!videoTrack) return null

    const proposedTime = startTime ?? project.timeline.duration
    const { insertIndex } = ClipPositioning.getReorderTarget(proposedTime, videoTrack.clips)

    videoTrack.clips.splice(insertIndex, 0, clip)
    reflowClips(videoTrack, Math.max(0, insertIndex - 1))
    syncCropEffectTimes(project)

    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()
    return clip
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
            knownTrack.clips.splice(index, 1)
            reflowClips(knownTrack, 0)
            knownTrack.clips = [...knownTrack.clips]
            project.timeline.duration = calculateTimelineDuration(project)
            project.modifiedAt = new Date().toISOString()
            return true
        }
        return false
    }

    for (const track of project.timeline.tracks) {
        const index = track.clips.findIndex(c => c.id === clipId)
        if (index !== -1) {
            track.clips.splice(index, 1)
            reflowClips(track, 0)
            track.clips = [...track.clips]
            project.timeline.duration = calculateTimelineDuration(project)
            project.modifiedAt = new Date().toISOString()
            return true
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
    const result = findClipById(project, clipId)
    if (!result) return null

    const { clip, track } = result
    const clipIndex = track.clips.findIndex(c => c.id === clipId)

    const newClip: Clip = {
        ...clip,
        id: `${clip.id}-copy-${Date.now()}`,
        startTime: clip.startTime + clip.duration,
    }

    track.clips.splice(clipIndex + 1, 0, newClip)
    reflowClips(track, clipIndex)
    syncCropEffectTimes(project)

    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()
    return newClip
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
    track.clips.splice(safeIndex, 0, clip)
    reflowClips(track, Math.max(0, safeIndex - 1))
    syncCropEffectTimes(project)

    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()
    return true
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

    // Sort and reflow
    track.clips.sort((a, b) => a.startTime - b.startTime)
    reflowClips(track, 0)
    syncCropEffectTimes(project)

    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()
    return true
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
        const result = findClipById(project, clipId)
        if (!result) return false
        clip = result.clip
        track = result.track
    }

    Object.assign(clip, updates)

    if (options?.maintainContiguous !== false) {
        reflowClips(track, 0)
    }

    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()
    syncCropEffectTimes(project)

    return true
}
