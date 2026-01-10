/**
 * Clip Reflow Operations
 * 
 * Core functions for maintaining contiguous clip layout on the timeline.
 * Extracted from timeline-operations.ts for better organization.
 */

import type { Project, Track } from '@/types/project'
import { TrackType } from '@/types/project'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'

/**
 * Calculate total timeline duration from clips and effects.
 */
export function calculateTimelineDuration(project: Project): number {
    // Timeline duration should reflect the exported media length.
    // Effects should not extend the project duration; if an effect has bad timing
    // (e.g. epoch timestamps), including it here can blow up the duration.
    let maxEndTime = 0
    for (const track of project.timeline.tracks) {
        for (const clip of track.clips) {
            const endTime = clip.startTime + clip.duration
            if (Number.isFinite(endTime)) {
                maxEndTime = Math.max(maxEndTime, endTime)
            }
        }
    }
    return maxEndTime
}

/**
 * Sort clips by their current startTime.
 */
export function sortClipsByTime(track: Track): void {
    track.clips.sort((a, b) => a.startTime - b.startTime)
}

/**
 * Reflow clips to maintain contiguous layout.
 * Array order is the single source of truth.
 */
export function reflowClips(
    track: Track,
    startFromIndex: number = 0
): void {
    if (track.clips.length === 0) return

    // Ensure durations are consistent with source bounds
    for (let i = 0; i < track.clips.length; i++) {
        const clip = track.clips[i]
        const expectedDuration = TimeConverter.computeEffectiveDuration(clip)

        if (Math.abs(clip.duration - expectedDuration) > 1) {
            track.clips[i] = { ...clip, duration: expectedDuration }
        }
    }

    // Webcam tracks should not enforce magnetic timeline behavior (start at 0, contiguous)
    // This allows the webcam clip to be synced to the visual effect position.
    if (track.type === TrackType.Webcam) {
        return
    }

    // First clip always starts at 0
    if (startFromIndex === 0 && track.clips.length > 0) {
        if (track.clips[0].startTime !== 0) {
            track.clips[0] = { ...track.clips[0], startTime: 0 }
        }
    }

    // Each subsequent clip starts where the previous one ends
    for (let i = Math.max(1, startFromIndex); i < track.clips.length; i++) {
        const prevClip = track.clips[i - 1]
        const newStart = prevClip.startTime + prevClip.duration

        if (track.clips[i].startTime !== newStart) {
            track.clips[i] = { ...track.clips[i], startTime: newStart }
        }
    }
}
