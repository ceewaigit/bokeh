/**
 * Webcam Sync Service
 *
 * Coordinates webcam clip synchronization when video clips change.
 * Dispatches to specific operation handlers based on change type.
 */

import type { Project } from '@/types/project'
import { TrackType } from '@/types/project'
import type { ClipChange } from '../types'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import {
    handleWebcamSplit,
    handleWebcamTrimStart,
    handleWebcamTrimEnd,
    handleWebcamDelete,
    handleWebcamSpeedUp,
    handleWebcamRateChange,
    shiftWebcamClipsAfter,
} from './webcam-operations'
import { TIME_TOLERANCE_MS } from '../types'
import { calculateTimelineDuration } from '@/features/ui/timeline/clips/clip-reflow'

export const WebcamSyncService = {
    /**
     * Sync linked webcam clips when video clips change.
     * Also handles webcam-to-webcam rate changes to prevent overlap.
     */
    sync(project: Project, change: ClipChange): void {
        // Special case: webcam rate-change should shift OTHER webcam clips
        // This prevents overlap when a webcam clip's duration changes
        if (change.sourceTrackType === TrackType.Webcam && change.type === 'rate-change') {
            this.handleWebcamTrackRateChange(project, change)
            return
        }

        // Skip other operations for non-video tracks to prevent recursion
        if (change.sourceTrackType && change.sourceTrackType !== TrackType.Video) return

        // Fallback: check if clip is in a video track (won't work for delete after clip is gone)
        if (!change.sourceTrackType && change.type !== 'delete') {
            const clipResult = ClipLookup.byId(project, change.clipId)
            if (clipResult && clipResult.track.type !== TrackType.Video) return
        }

        // Check if webcam tracks exist
        const webcamTracks = project.timeline.tracks.filter(t => t.type === TrackType.Webcam)
        if (webcamTracks.length === 0) return

        // Dispatch to specific handler
        switch (change.type) {
            case 'split':
                handleWebcamSplit(project, change)
                break
            case 'trim-start':
                handleWebcamTrimStart(project, change)
                break
            case 'trim-end':
                handleWebcamTrimEnd(project, change)
                break
            case 'delete':
                handleWebcamDelete(project, change)
                break
            case 'speed-up':
                handleWebcamSpeedUp(project, change)
                break
            case 'rate-change':
                handleWebcamRateChange(project, change)
                break
        }
    },

    /**
     * Handle rate change on a webcam clip - shift OTHER webcam clips to prevent overlap.
     * Does NOT modify the changed clip itself (only shifts subsequent clips).
     */
    handleWebcamTrackRateChange(project: Project, change: ClipChange): void {
        if (!change.before || !change.after) return
        if (Math.abs(change.timelineDelta) < TIME_TOLERANCE_MS) return

        // Shift webcam clips that start after the changed clip's ORIGINAL end position
        // Exclude the changed clip itself from being shifted
        const excludeIds = new Set([change.clipId])
        shiftWebcamClipsAfter(project, change.before.endTime, change.timelineDelta, excludeIds)

        // Webcam sync mutates clip positions outside the command's withMutation() wrapper,
        // so update duration here to keep playhead clamping and UI ruler correct.
        project.timeline.duration = calculateTimelineDuration(project)
    },
}
