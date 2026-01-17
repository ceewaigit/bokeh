/**
 * ClipChangeBuilder - Shared utility for building ClipChange objects.
 *
 * Consolidates duplicated change builder logic from TimelineSyncOrchestrator
 * and TimelineCommand into a single source of truth.
 *
 * Used by:
 * - TimelineSyncOrchestrator: For building changes during sync operations
 * - TimelineCommand: For building changes in command execution
 */

import type { Clip } from '@/types/project'
import { TrackType } from '@/types/project'
import type { ClipChange, ClipState, SegmentMapping } from './types'
import { ClipUtils } from '@/features/ui/timeline/time/clip-utils'

export const ClipChangeBuilder = {
    /**
     * Build ClipChange for an add operation.
     */
    buildAddChange(clip: Clip, sourceTrackType?: TrackType): ClipChange {
        return {
            type: 'add',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: null,
            after: ClipUtils.buildState(clip),
            timelineDelta: clip.duration
        }
    },

    /**
     * Build ClipChange for a delete operation.
     */
    buildDeleteChange(clip: Clip, sourceTrackType?: TrackType): ClipChange {
        const { startTime, endTime } = ClipUtils.getTimelineRange(clip)
        const playbackRate = ClipUtils.getPlaybackRate(clip)
        const { sourceIn, sourceOut } = ClipUtils.getSourceRange(clip)

        return {
            type: 'delete',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: {
                startTime,
                endTime,
                playbackRate,
                sourceIn,
                sourceOut,
            },
            after: null,
            timelineDelta: -clip.duration,
        }
    },

    /**
     * Build ClipChange for a reorder operation.
     */
    buildReorderChange(
        clip: Clip,
        oldStartTime: number,
        newStartTime: number,
        sourceTrackType?: TrackType
    ): ClipChange {
        const duration = clip.duration
        const playbackRate = ClipUtils.getPlaybackRate(clip)
        const { sourceIn, sourceOut } = ClipUtils.getSourceRange(clip)

        return {
            type: 'reorder',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: {
                startTime: oldStartTime,
                endTime: oldStartTime + duration,
                playbackRate,
                sourceIn,
                sourceOut,
            },
            after: {
                startTime: newStartTime,
                endTime: newStartTime + duration,
                playbackRate,
                sourceIn,
                sourceOut,
            },
            timelineDelta: newStartTime - oldStartTime,
        }
    },

    /**
     * Build ClipChange for a trim operation.
     */
    buildTrimChange(
        clip: Clip,
        side: 'start' | 'end',
        oldState: { startTime: number; endTime: number; sourceIn: number; sourceOut: number },
        sourceTrackType?: TrackType
    ): ClipChange {
        const oldDuration = oldState.endTime - oldState.startTime
        const newDuration = clip.duration
        const playbackRate = ClipUtils.getPlaybackRate(clip)
        const { startTime: newStartTime, endTime: newEndTime } = ClipUtils.getTimelineRange(clip)
        const { sourceIn: newSourceIn, sourceOut: newSourceOut } = ClipUtils.getSourceRange(clip)

        return {
            type: side === 'start' ? 'trim-start' : 'trim-end',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: {
                startTime: oldState.startTime,
                endTime: oldState.endTime,
                playbackRate,
                sourceIn: oldState.sourceIn,
                sourceOut: oldState.sourceOut,
            },
            after: {
                startTime: newStartTime,
                endTime: newEndTime,
                playbackRate,
                sourceIn: newSourceIn,
                sourceOut: newSourceOut,
            },
            timelineDelta: newDuration - oldDuration,
        }
    },

    /**
     * Build ClipChange for a split operation.
     */
    buildSplitChange(
        originalClip: Clip,
        leftClipId: string,
        rightClipId: string,
        sourceTrackType?: TrackType
    ): ClipChange {
        const { startTime, endTime } = ClipUtils.getTimelineRange(originalClip)
        const playbackRate = ClipUtils.getPlaybackRate(originalClip)
        const { sourceIn, sourceOut } = ClipUtils.getSourceRange(originalClip)

        return {
            type: 'split',
            clipId: originalClip.id,
            recordingId: originalClip.recordingId,
            sourceTrackType,
            before: {
                startTime,
                endTime,
                playbackRate,
                sourceIn,
                sourceOut,
            },
            after: null, // Split creates new clips
            timelineDelta: 0, // Total duration unchanged
            newClipIds: [leftClipId, rightClipId],
        }
    },

    /**
     * Build ClipChange for a playback rate change operation.
     */
    buildRateChange(
        clip: Clip,
        oldDuration: number,
        sourceTrackType?: TrackType
    ): ClipChange {
        const newDuration = clip.duration
        const { sourceIn, sourceOut } = ClipUtils.getSourceRange(clip)

        // Calculate old playback rate from source range and old duration
        const oldPlaybackRate = (clip.sourceOut != null && clip.sourceIn != null)
            ? (clip.sourceOut - clip.sourceIn) / oldDuration
            : 1

        return {
            type: 'rate-change',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: {
                startTime: clip.startTime,
                endTime: clip.startTime + oldDuration,
                playbackRate: oldPlaybackRate,
                sourceIn,
                sourceOut,
            },
            after: {
                startTime: clip.startTime,
                endTime: clip.startTime + newDuration,
                playbackRate: ClipUtils.getPlaybackRate(clip),
                sourceIn,
                sourceOut,
            },
            timelineDelta: newDuration - oldDuration,
        }
    },

    /**
     * Build ClipChange for a clip update operation.
     * Only used when timing properties changed (startTime, duration, sourceIn/Out, playbackRate).
     */
    buildUpdateChange(
        clip: Clip,
        oldState: { startTime: number; endTime: number; sourceIn: number; sourceOut: number; playbackRate: number },
        sourceTrackType?: TrackType
    ): ClipChange {
        const { startTime: newStartTime, endTime: newEndTime } = ClipUtils.getTimelineRange(clip)
        const playbackRate = ClipUtils.getPlaybackRate(clip)
        const { sourceIn: newSourceIn, sourceOut: newSourceOut } = ClipUtils.getSourceRange(clip)

        return {
            type: 'update',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: {
                startTime: oldState.startTime,
                endTime: oldState.endTime,
                playbackRate: oldState.playbackRate,
                sourceIn: oldState.sourceIn,
                sourceOut: oldState.sourceOut,
            },
            after: {
                startTime: newStartTime,
                endTime: newEndTime,
                playbackRate,
                sourceIn: newSourceIn,
                sourceOut: newSourceOut,
            },
            timelineDelta: newEndTime - oldState.endTime,
        }
    },

    /**
     * Build ClipChange for a trim-start operation (simplified version for TimelineCommand).
     * Takes explicit before state and timeline delta.
     */
    buildTrimStartChange(
        clip: Clip,
        beforeState: ClipState,
        timelineDelta: number,
        sourceTrackType?: TrackType
    ): ClipChange {
        return {
            type: 'trim-start',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: beforeState,
            after: ClipUtils.buildState(clip),
            timelineDelta
        }
    },

    /**
     * Build ClipChange for a trim-end operation (simplified version for TimelineCommand).
     * Takes explicit before state and timeline delta.
     */
    buildTrimEndChange(
        clip: Clip,
        beforeState: ClipState,
        timelineDelta: number,
        sourceTrackType?: TrackType
    ): ClipChange {
        return {
            type: 'trim-end',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: beforeState,
            after: ClipUtils.buildState(clip),
            timelineDelta
        }
    },

    /**
     * Build ClipChange for a split operation (simplified version for TimelineCommand).
     * Takes explicit before state.
     */
    buildSplitChangeFromState(
        originalClip: Clip,
        beforeState: ClipState,
        firstClip: Clip,
        secondClip: Clip,
        sourceTrackType?: TrackType
    ): ClipChange {
        return {
            type: 'split',
            clipId: originalClip.id,
            recordingId: originalClip.recordingId,
            sourceTrackType,
            before: beforeState,
            after: ClipUtils.buildState(firstClip),
            timelineDelta: 0,
            newClipIds: [firstClip.id, secondClip.id]
        }
    },

    /**
     * Build ClipChange for an update operation (simplified version for TimelineCommand).
     * Takes explicit before state and timeline delta.
     */
    buildUpdateChangeFromState(
        clip: Clip,
        beforeState: ClipState,
        timelineDelta: number = 0,
        sourceTrackType?: TrackType
    ): ClipChange {
        return {
            type: 'update',
            clipId: clip.id,
            recordingId: clip.recordingId,
            sourceTrackType,
            before: beforeState,
            after: ClipUtils.buildState(clip),
            timelineDelta
        }
    },

    /**
     * Build ClipChange for a speed-up operation.
     * Takes the before state and segment mapping from SpeedUpApplicationService.
     *
     * Speed-up is a special operation that:
     * - Replaces the original clip with multiple new clips
     * - after is null (original clip no longer exists)
     * - segmentMapping describes how time positions map to new positions
     */
    buildSpeedUpChange(
        clipId: string,
        recordingId: string,
        beforeState: ClipState,
        segmentMapping: SegmentMapping | null,
        sourceTrackType?: TrackType
    ): ClipChange {
        return {
            type: 'speed-up',
            clipId,
            recordingId,
            sourceTrackType,
            before: beforeState,
            after: null, // Original clip is replaced by new clips
            timelineDelta: segmentMapping?.timelineDelta ?? 0,
            segmentMapping: segmentMapping ?? undefined,
        }
    },
}
