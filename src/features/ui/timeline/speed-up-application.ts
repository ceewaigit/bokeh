import type { Project, Clip } from '@/types/project'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { reflowClips, calculateTimelineDuration } from './clips/clip-reflow'
import { markModified } from '@/features/core/stores/store-utils'
import { ClipUtils } from './time/clip-utils'
import type { SegmentMapping, SpeedUpResult } from '@/features/effects/sync/types'

interface Segment {
    start: number
    end: number
    speedMultiplier: number
}

/**
 * Service for applying speed-up suggestions to clips by splitting them.
 * This creates separate clips for sped-up sections with increased playback rates.
 *
 * NOTE: Effect and webcam synchronization is handled by TimelineSyncOrchestrator.
 * This service is CLIP-ONLY - it handles the clip splitting and reflow.
 */
export class SpeedUpApplicationService {
    /**
     * Apply speed-up suggestions to a clip by splitting and remapping.
     * Returns segment mapping for effect synchronization by TimelineSyncOrchestrator.
     *
     * @param periods - Array of speed-up periods with startTime, endTime, and suggestedSpeedMultiplier
     * @param speedUpTypes - Which types of speed-up are being applied (for setting flags)
     */
    static applySpeedUpToClip(
        project: Project,
        clipId: string,
        periods: Array<{ startTime: number; endTime: number; suggestedSpeedMultiplier: number }>,
        speedUpTypes: Array<'typing' | 'idle'> = ['typing']
    ): SpeedUpResult {
        const result = ClipLookup.byId(project, clipId)
        if (!result) {
            return { affectedClips: [], originalClips: [], segmentMapping: null }
        }

        const { clip: sourceClip, track } = result
        const clipIndex = track.clips.findIndex(c => c.id === clipId)
        const originalClip = { ...sourceClip }

        // Get clip's source range and base playback rate
        const { sourceIn, sourceOut } = ClipUtils.getSourceRange(sourceClip)
        const baseRate = ClipUtils.getPlaybackRate(sourceClip)

        // Filter and sort periods within the clip's source range
        const validPeriods = periods
            .filter(p => p.endTime > sourceIn && p.startTime < sourceOut)
            .map(p => ({
                start: Math.max(p.startTime, sourceIn),
                end: Math.min(p.endTime, sourceOut),
                speedMultiplier: p.suggestedSpeedMultiplier
            }))
            .sort((a, b) => a.start - b.start)

        if (validPeriods.length === 0) {
            return { affectedClips: [clipId], originalClips: [originalClip], segmentMapping: null }
        }

        // Get FPS from project settings
        const fps = project.settings.frameRate
        const minDuration = 1000 / fps // Minimum duration is 1 frame

        // 1. Generate initial segments covering the entire source range
        const segments: Segment[] = []
        let currentPos = sourceIn

        for (const period of validPeriods) {
            // Add gap before speed-up period (normal speed)
            if (currentPos < period.start) {
                segments.push({
                    start: currentPos,
                    end: period.start,
                    speedMultiplier: 1
                })
            }

            // Add speed-up period
            segments.push({
                start: period.start,
                end: period.end,
                speedMultiplier: period.speedMultiplier
            })

            currentPos = period.end
        }

        // Add remaining portion after last speed-up period (normal speed)
        if (currentPos < sourceOut) {
            segments.push({
                start: currentPos,
                end: sourceOut,
                speedMultiplier: 1
            })
        }

        // 2. Merge small segments to prevent sub-frame clips
        const mergedSegments = this.mergeSmallSegments(segments, minDuration)

        // Remove the original clip
        track.clips.splice(clipIndex, 1)

        // Determine which flags to set based on speed-up types
        const hasTyping = speedUpTypes.includes('typing')
        const hasIdle = speedUpTypes.includes('idle')

        // 3. Create new clips from merged segments and build segment mapping
        let timelinePosition = sourceClip.startTime
        const newClips: Clip[] = []
        const affectedClips: string[] = []
        const mappingSegments: SegmentMapping['segments'] = []

        for (let i = 0; i < mergedSegments.length; i++) {
            const segment = mergedSegments[i]
            const sourceDuration = segment.end - segment.start

            // Skip effectively zero length segments
            if (sourceDuration <= 0.001) continue

            // Apply speed directly to playbackRate
            const effectiveRate = baseRate * segment.speedMultiplier
            const clipDuration = sourceDuration / effectiveRate

            const newClip: Clip = {
                id: `${sourceClip.id}-part-${i}`,
                recordingId: sourceClip.recordingId,
                startTime: timelinePosition,
                duration: clipDuration,
                sourceIn: segment.start,
                sourceOut: segment.end,
                lockedSourceIn: segment.start,
                lockedSourceOut: segment.end,
                playbackRate: effectiveRate,
                typingSpeedApplied: hasTyping && segment.speedMultiplier !== 1,
                idleSpeedApplied: hasIdle && segment.speedMultiplier !== 1,
                timeRemapPeriods: [],
                introFadeMs: i === 0 ? sourceClip.introFadeMs : undefined,
                outroFadeMs: i === mergedSegments.length - 1 ? sourceClip.outroFadeMs : undefined,
                // Preserve layout for webcam clips (position, size, styling)
                layout: sourceClip.layout,
            }

            newClips.push(newClip)
            affectedClips.push(newClip.id)

            // Build segment mapping for effect sync
            mappingSegments.push({
                sourceStart: segment.start,
                sourceEnd: segment.end,
                timelineStart: timelinePosition,
                timelineEnd: timelinePosition + clipDuration,
                speedMultiplier: segment.speedMultiplier
            })

            timelinePosition += clipDuration
        }

        // Insert new clips at the original position
        track.clips.splice(clipIndex, 0, ...newClips)

        // Reflow to ensure all clips are contiguous
        reflowClips(track, 0)

        // Update timeline duration
        project.timeline.duration = calculateTimelineDuration(project)
        markModified(project)

        // Calculate timeline delta
        const newTotalDuration = newClips.reduce((sum, c) => sum + c.duration, 0)
        const delta = newTotalDuration - sourceClip.duration

        // Build segment mapping for TimelineSyncOrchestrator
        const { startTime: originalClipStart, endTime: originalClipEnd } = ClipUtils.getTimelineRange(originalClip)
        const segmentMapping: SegmentMapping = {
            originalClipStart,
            originalClipEnd,
            timelineDelta: delta,
            basePlaybackRate: baseRate,
            segments: mappingSegments
        }

        return {
            affectedClips,
            originalClips: [originalClip],
            segmentMapping
        }
    }

    /**
     * Merge small segments to prevent sub-frame clips.
     *
     * Algorithm:
     * 1. Forward pass: Iterate through segments and merge small ones into the previous segment.
     *    - If a segment's duration is below minDuration, extend the previous segment's end to absorb it.
     *    - If two adjacent segments have the same speed multiplier, merge them regardless of size.
     *
     * 2. Edge case handling: If the first segment ends up too small after the forward pass
     *    (e.g., first segment was already small), merge it into the second segment by
     *    extending the second segment's start backward.
     *
     * Why this matters:
     * - Sub-frame clips cause rendering issues and timeline UI glitches
     * - minDuration is typically 1 frame (1000ms / fps)
     * - Merging preserves the speed multiplier of the absorbing segment
     *
     * @param segments - Array of segments with start, end, and speedMultiplier
     * @param minDuration - Minimum allowed segment duration (typically 1 frame in ms)
     * @returns Merged segments where all durations >= minDuration
     */
    private static mergeSmallSegments(segments: Segment[], minDuration: number): Segment[] {
        const merged: Segment[] = []

        // Forward pass: merge small segments into previous
        for (const segment of segments) {
            const duration = segment.end - segment.start

            if (duration < minDuration) {
                // Segment is too small - extend previous segment to absorb it
                if (merged.length > 0) {
                    merged[merged.length - 1].end = segment.end
                } else {
                    // No previous segment yet - keep it (will be handled in final pass)
                    merged.push({ ...segment })
                }
            } else {
                // Check if we can merge with previous if they have same speed
                // (reduces unnecessary clip boundaries)
                if (merged.length > 0 && merged[merged.length - 1].speedMultiplier === segment.speedMultiplier) {
                    merged[merged.length - 1].end = segment.end
                } else {
                    merged.push({ ...segment })
                }
            }
        }

        // Final pass: if first segment is too small, merge into second
        // This handles the edge case where the first segment couldn't be merged forward
        if (merged.length > 1 && (merged[0].end - merged[0].start) < minDuration) {
            merged[1].start = merged[0].start
            merged.shift()
        }

        return merged
    }
}
