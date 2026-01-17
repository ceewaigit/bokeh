/**
 * Webcam Operations
 *
 * Individual handlers for webcam clip sync operations.
 * Each operation handles a specific clip change type.
 *
 * IMPORTANT: Command Pattern Bypass Documentation
 * ==============================================
 * These operations intentionally bypass the Command pattern (no undo/redo tracking).
 * This is by design for the following reasons:
 *
 * 1. CASCADE EFFECT: Webcam sync is triggered as part of TimelineSyncOrchestrator.commit(),
 *    which runs INSIDE TimelineCommand.mutate(). The parent command (e.g., SplitClipCommand,
 *    TrimCommand) already handles undo/redo for the entire operation including webcam changes.
 *
 * 2. ATOMICITY: These operations modify the same Immer draft as the main command. Creating
 *    separate commands would require a new transaction, breaking atomicity and state consistency.
 *
 * 3. IMPLICIT REVERT: When a user undoes a SplitClipCommand, the webcam split is automatically
 *    reverted because the entire draft snapshot is rolled back. No explicit webcam undo needed.
 *
 * 4. PERFORMANCE: Avoiding command overhead for cascading sync operations improves performance
 *    when many webcam clips need adjustment after a video track operation.
 *
 * If webcam sync operations need independent undo/redo in the future, they should be refactored
 * into PatchedCommands that are executed as part of a CompositeCommand alongside the main operation.
 */

import type { Project, Clip, Track } from '@/types/project'
import { TrackType } from '@/types/project'
import type { ClipChange, SegmentMapping } from '../types'
import { TIME_TOLERANCE_MS } from '../types'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { TimeRange } from '@/features/ui/timeline/time/time-range'
import { executeSplitClip } from '@/features/ui/timeline/clips/clip-split'
import { executeTrimClipStart, executeTrimClipEnd, MIN_CLIP_DURATION_MS } from '@/features/ui/timeline/clips/clip-trim'
import { removeClipFromTrack } from '@/features/ui/timeline/clips/clip-crud'
import { timelineToSource, TimeConverter } from '@/features/ui/timeline/time/time-space-converter'

/**
 * Find webcam clips that overlap with a time range.
 */
export function findOverlappingWebcamClips(
    project: Project,
    range: TimeRange,
    recordingId?: string
): Array<{ clip: Clip; track: Track }> {
    const results: Array<{ clip: Clip; track: Track }> = []

    for (const track of project.timeline.tracks) {
        if (track.type !== TrackType.Webcam) continue

        for (const clip of track.clips) {
            const clipRange = TimeRange.fromClip(clip)
            if (TimeRange.overlaps(range, clipRange)) {
                if (!recordingId || clip.recordingId === recordingId) {
                    results.push({ clip, track })
                }
            }
        }
    }

    return results
}

/**
 * Shift all webcam clips after a time point by delta.
 */
export function shiftWebcamClipsAfter(
    project: Project,
    afterTime: number,
    deltaMs: number,
    excludeClipIds?: Set<string>
): void {
    if (Math.abs(deltaMs) < TIME_TOLERANCE_MS) return

    for (const track of project.timeline.tracks) {
        if (track.type !== TrackType.Webcam) continue

        for (const clip of track.clips) {
            if (excludeClipIds?.has(clip.id)) continue
            if (clip.startTime >= afterTime - 0.01) {
                clip.startTime += deltaMs
            }
        }
    }
}

/**
 * Handle webcam split: split webcam at same point as video.
 */
export function handleWebcamSplit(project: Project, change: ClipChange): void {
    if (!change.before || !change.newClipIds || change.newClipIds.length < 2) return

    const firstNewClipResult = ClipLookup.byId(project, change.newClipIds[0])
    if (!firstNewClipResult) return

    const splitTime = firstNewClipResult.clip.startTime + firstNewClipResult.clip.duration

    const overlapping = findOverlappingWebcamClips(project, {
        startTime: change.before.startTime,
        endTime: change.before.endTime
    })

    for (const { clip } of overlapping) {
        const clipEnd = clip.startTime + clip.duration
        if (splitTime > clip.startTime && splitTime < clipEnd) {
            executeSplitClip(project, clip.id, splitTime)
        }
    }
}

/**
 * Handle webcam trim start: trim webcam start to match video.
 */
export function handleWebcamTrimStart(project: Project, change: ClipChange): void {
    if (!change.before || !change.after) return

    const overlapping = findOverlappingWebcamClips(project, {
        startTime: change.before.startTime,
        endTime: change.before.endTime
    })

    const processedIds = new Set<string>()

    for (const { clip } of overlapping) {
        const trimDelta = change.after.startTime - change.before.startTime
        if (trimDelta > 0) {
            const newStart = clip.startTime + trimDelta
            if (newStart < clip.startTime + clip.duration - MIN_CLIP_DURATION_MS) {
                executeTrimClipStart(project, clip.id, newStart)
            }
        }
        processedIds.add(clip.id)
    }

    if (change.timelineDelta < 0) {
        shiftWebcamClipsAfter(project, change.after.endTime, change.timelineDelta, processedIds)
    }
}

/**
 * Handle webcam trim end: trim webcam end to match video.
 */
export function handleWebcamTrimEnd(project: Project, change: ClipChange): void {
    if (!change.before || !change.after) return

    const overlapping = findOverlappingWebcamClips(project, {
        startTime: change.before.startTime,
        endTime: change.before.endTime
    })

    const processedIds = new Set<string>()

    for (const { clip } of overlapping) {
        const clipEnd = clip.startTime + clip.duration
        if (clipEnd > change.after.endTime) {
            const newDuration = change.after.endTime - clip.startTime
            if (newDuration >= MIN_CLIP_DURATION_MS) {
                executeTrimClipEnd(project, clip.id, change.after.endTime)
            }
        }
        processedIds.add(clip.id)
    }

    if (Math.abs(change.timelineDelta) > TIME_TOLERANCE_MS) {
        shiftWebcamClipsAfter(project, change.before.endTime, change.timelineDelta, processedIds)
    }
}

/**
 * Handle webcam delete: delete overlapping webcam + ripple.
 */
export function handleWebcamDelete(project: Project, change: ClipChange): void {
    if (!change.before) return

    const overlapping = findOverlappingWebcamClips(project, {
        startTime: change.before.startTime,
        endTime: change.before.endTime
    })

    const deletedIds = new Set<string>()

    for (const { clip, track } of overlapping) {
        const clipStart = clip.startTime
        const clipEnd = clip.startTime + clip.duration
        const delStart = change.before.startTime
        const delEnd = change.before.endTime

        // Case 1: Webcam entirely within deleted region - delete it
        if (clipStart >= delStart && clipEnd <= delEnd) {
            removeClipFromTrack(project, clip.id, track)
            deletedIds.add(clip.id)
        }
        // Case 2: Webcam spans deleted region - trim end to deleted start
        else if (clipStart < delStart && clipEnd > delEnd) {
            executeTrimClipEnd(project, clip.id, delStart)
        }
        // Case 3: Webcam starts inside deleted region - trim start
        else if (clipStart >= delStart && clipStart < delEnd && clipEnd > delEnd) {
            executeTrimClipStart(project, clip.id, delStart)
        }
        // Case 4: Webcam ends inside deleted region - trim end
        else if (clipStart < delStart && clipEnd > delStart && clipEnd <= delEnd) {
            executeTrimClipEnd(project, clip.id, delStart)
        }
    }

    shiftWebcamClipsAfter(project, change.before.endTime, change.timelineDelta, deletedIds)
}

/**
 * Handle webcam rate-change: reposition webcam clips when video playback rate changes.
 * This handles "unspeeding" (changing playback rate back to 1x) which changes timeline duration.
 *
 * Webcam clips are repositioned based on their relationship to the video clip:
 * - Clips starting WITHIN the video: repositioned proportionally (same relative position)
 * - Clips starting AFTER the video's original end: shifted by full delta
 */
export function handleWebcamRateChange(project: Project, change: ClipChange): void {
    if (!change.before || !change.after) return
    if (Math.abs(change.timelineDelta) < TIME_TOLERANCE_MS) return

    const originalStart = change.before.startTime
    const originalEnd = change.before.endTime
    const originalDuration = originalEnd - originalStart
    const newDuration = change.after.endTime - change.after.startTime

    // Avoid division by zero
    if (originalDuration < TIME_TOLERANCE_MS) return

    for (const track of project.timeline.tracks) {
        if (track.type !== TrackType.Webcam) continue

        for (const clip of track.clips) {
            const clipEnd = clip.startTime + clip.duration

            // Case 1: Webcam ends before video clip starts - no change
            if (clipEnd <= originalStart) continue

            // Case 2: Webcam starts at or after video clip's original end - shift by full delta
            if (clip.startTime >= originalEnd - 0.01) {
                clip.startTime += change.timelineDelta
                continue
            }

            // Case 3: Webcam starts within video clip's original range
            // Reposition proportionally to maintain the same relative position
            if (clip.startTime >= originalStart - 0.01) {
                const relativePosition = (clip.startTime - originalStart) / originalDuration
                clip.startTime = originalStart + (relativePosition * newDuration)
            }
            // Case 4: Webcam starts before video but overlaps - no change to start position
            // (the webcam predates the video clip)
        }
    }
}

/**
 * Handle webcam speed-up: split and adjust webcam clips to match video speed-up.
 */
export function handleWebcamSpeedUp(project: Project, change: ClipChange): void {
    if (!change.segmentMapping || !change.before) return

    const { originalClipStart, originalClipEnd, segments } = change.segmentMapping
    const baseVideoRate = Math.max(0.0001, change.before.playbackRate || 1)

    const overlapping = findOverlappingWebcamClips(project, {
        startTime: originalClipStart,
        endTime: originalClipEnd
    })

    if (overlapping.length === 0) return

    for (const { clip: webcamClip, track: webcamTrack } of overlapping) {
        syncWebcamClipToSegments(project, webcamClip, webcamTrack, segments, originalClipStart, baseVideoRate)
    }

    const processedIds = new Set(overlapping.map(o => o.clip.id))
    shiftWebcamClipsAfter(project, originalClipEnd, change.timelineDelta, processedIds)
}

/**
 * Sync a single webcam clip to match video speed-up segments.
 *
 * Uses TimeConverter for source time calculations to maintain consistency
 * with the rest of the codebase's time coordinate system.
 */
function syncWebcamClipToSegments(
    project: Project,
    webcamClip: Clip,
    webcamTrack: Track,
    segments: SegmentMapping['segments'],
    originalClipStart: number,
    baseVideoRate: number
): void {
    // Cache timeline range before removal
    const webcamStart = webcamClip.startTime
    const webcamEnd = webcamClip.startTime + webcamClip.duration
    const webcamBaseRate = Math.max(0.0001, webcamClip.playbackRate ?? 1)
    const safeBaseVideoRate = Math.max(0.0001, baseVideoRate || 1)

    // Remove the original webcam clip (webcamClip object still valid for reference)
    removeClipFromTrack(project, webcamClip.id, webcamTrack)

    const firstSourceStart = segments[0]?.sourceStart ?? 0

    // Create new webcam clips for each segment that overlaps
    for (const segment of segments) {
        // Calculate where this segment was in the ORIGINAL timeline (pre-speed-up).
        // Use a direct formula (no cumulative summation) to avoid float drift on long clips
        // with many segments (which can cause boundary jitter and non-contiguous grouping).
        const segmentOriginalTimelineStart =
            originalClipStart + (segment.sourceStart - firstSourceStart) / safeBaseVideoRate
        const segmentOriginalTimelineEnd =
            originalClipStart + (segment.sourceEnd - firstSourceStart) / safeBaseVideoRate

        // Check if webcam overlaps this segment's ORIGINAL timeline position
        if (webcamEnd <= segmentOriginalTimelineStart || webcamStart >= segmentOriginalTimelineEnd) {
            continue // No overlap
        }

        // Calculate the overlap region in original timeline space
        const overlapStart = Math.max(webcamStart, segmentOriginalTimelineStart)
        const overlapEnd = Math.min(webcamEnd, segmentOriginalTimelineEnd)

        // Convert timeline positions to webcam source time using TimeConverter
        // This ensures consistency with how other parts of the codebase handle time conversion
        const webcamSourceStart = timelineToSource(overlapStart, webcamClip)
        const webcamSourceEnd = timelineToSource(overlapEnd, webcamClip)

        // Calculate new timeline position accounting for segment speed
        const offsetIntoSegment = (overlapStart - segmentOriginalTimelineStart)
        const newTimelineStart = segment.timelineStart + TimeConverter.sourceDeltaToTimelineDelta(offsetIntoSegment, segment.speedMultiplier)
        const newDuration = TimeConverter.sourceDeltaToTimelineDelta(overlapEnd - overlapStart, segment.speedMultiplier)

        // Use exact millisecond positions without frame snapping
        // Video clips use exact positions, so webcam must match to avoid gaps
        const newWebcamClip: Clip = {
            id: crypto.randomUUID(),
            recordingId: webcamClip.recordingId,
            startTime: newTimelineStart,
            duration: newDuration,
            sourceIn: webcamSourceStart,
            sourceOut: webcamSourceEnd,
            // Stack the speed-up with any existing webcam playback rate.
            // This keeps webcam in lockstep with video when speed-ups are applied multiple times.
            playbackRate: webcamBaseRate * segment.speedMultiplier,
            layout: webcamClip.layout ? JSON.parse(JSON.stringify(webcamClip.layout)) : undefined,
        }

        webcamTrack.clips.push(newWebcamClip)
    }

    // Sort clips by startTime
    webcamTrack.clips.sort((a, b) => a.startTime - b.startTime)
}
