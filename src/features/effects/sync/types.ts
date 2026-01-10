/**
 * Effect Sync Types
 * 
 * Defines the ClipChange interface used by EffectSyncService
 * to understand what changed and how to update effects accordingly.
 */

/**
 * Describes a clip change operation for effect synchronization.
 * 
 * The EffectSyncService uses this to determine how to update effects:
 * - clip-bound effects (Crop) follow their clipId
 * - time-based effects shift/compress based on timelineDelta and segmentMapping
 * - keystroke effects get regenerated from metadata
 */
export interface ClipChange {
    type: 'trim-start' | 'trim-end' | 'speed-up' | 'delete' | 'reorder' | 'split' | 'add'

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
