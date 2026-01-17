/**
 * Effect Sync Types
 *
 * Defines the ClipChange interface used by TimelineSyncOrchestrator
 * to understand what changed and how to update effects accordingly.
 */

import { TrackType } from '@/types/project'

/**
 * Tolerance for comparing timeline durations/deltas (in milliseconds).
 * Used to filter out negligible changes that don't warrant effect sync.
 */
export const TIME_TOLERANCE_MS = 0.001

/**
 * Describes a clip change operation for effect synchronization.
 *
 * The TimelineSyncOrchestrator uses this to determine how to update effects:
 * - clip-bound effects (Crop) follow their clipId
 * - time-based effects shift/compress based on timelineDelta and segmentMapping
 * - keystroke effects get regenerated from metadata
 * - linked webcam clips sync with video track changes
 */
export interface ClipChange {
    type: 'trim-start' | 'trim-end' | 'speed-up' | 'delete' | 'reorder' | 'split' | 'add' | 'rate-change' | 'update'

    /** ID of the clip that was modified */
    clipId: string

    /** Recording ID for the clip */
    recordingId: string

    /** State before the change (null for add operations) */
    before: ClipState | null

    /** State after the change (null for delete operations) */
    after: ClipState | null

    /** How much subsequent clips shifted (negative = timeline contracted) */
    timelineDelta: number

    /** For split: IDs of the new clips created */
    newClipIds?: string[]

    /** For speed-up: segment mapping for proportional effect adjustment */
    segmentMapping?: SegmentMapping

    /** Track type of the source clip (prevents recursion in webcam sync) */
    sourceTrackType?: TrackType
}

export interface ClipState {
    startTime: number
    endTime: number
    playbackRate: number
    sourceIn: number
    sourceOut: number
}

/**
 * Maps original timeline positions to new positions after speed-up.
 * Used for proportionally adjusting time-based effects.
 */
export interface SegmentMapping {
    originalClipStart: number
    originalClipEnd: number
    /** Timeline delta (negative = timeline contracted) */
    timelineDelta: number
    /** Base playback rate of the clip before speed-up was applied */
    basePlaybackRate: number
    segments: Array<{
        sourceStart: number
        sourceEnd: number
        /** New timeline start position for this segment */
        timelineStart: number
        /** New timeline end position for this segment */
        timelineEnd: number
        speedMultiplier: number
    }>
}

/**
 * Result from applying speed-up to a clip.
 */
export interface SpeedUpResult {
    affectedClips: string[]
    originalClips: import('@/types/project').Clip[]
    segmentMapping: SegmentMapping | null
}

/**
 * Batch of effect mutations collected during sync phase.
 * Applied atomically to ensure SSOT and avoid stale reference bugs.
 *
 * Two-phase mutation pattern:
 * 1. Collect: Sync handlers add to this batch (no array reassignment)
 * 2. Apply: EffectStore.applyBatch() applies all changes atomically
 */
export interface EffectMutationBatch {
    /** Effect IDs to remove */
    toRemove: Set<string>
    /** Effect updates by ID (merged if same ID appears multiple times) */
    toUpdate: Map<string, Partial<import('@/types/project').Effect>>
    /** New effects to add */
    toAdd: import('@/types/project').Effect[]
}
