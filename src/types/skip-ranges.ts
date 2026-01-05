/**
 * Global Skip Range - A timeline-space range where content should be skipped
 * 
 * Part of the Timeline-Centric architecture for transcript-based editing.
 * These ranges are projected from source-space hidden regions to timeline-space
 * based on each clip's current position.
 */
export interface GlobalSkipRange {
    /** Timeline start time in milliseconds */
    start: number
    /** Timeline end time in milliseconds */
    end: number
    /** Clip that this skip originated from */
    clipId: string
    /** Recording that this skip originated from */
    recordingId: string
}
