/**
 * TypeScript types for different time coordinate systems
 * These branded types help prevent accidental mixing of time spaces at compile time
 */

/**
 * SOURCE TIME - Original recording timestamps
 * Milliseconds from the start of the recording
 * This is the immutable source of truth from recording metadata
 * 
 * Example: A keypress at 5000ms in the original recording
 */
export type SourceTimeMs = number & { readonly __brand: 'SourceTimeMs' }

/**
 * TIMELINE TIME - Position on the timeline UI
 * Milliseconds representing where something appears in the final video
 * This is what the user sees and interacts with
 * 
 * Example: A clip starting at timeline position 10000ms
 */
export type TimelineMs = number & { readonly __brand: 'TimelineMs' }

/**
 * CLIP-RELATIVE TIME - Time within a clip
 * Milliseconds from the start of a specific clip
 * Accounts for playback rate and time remapping
 * 
 * Example: 1000ms into a clip (regardless of timeline position)
 */
export type ClipRelativeMs = number & { readonly __brand: 'ClipRelativeMs' }

/**
 * Helper functions to create branded time values
 * These ensure explicit conversion and prevent accidental mixing
 */
export const TimeSpace = {
  source: (ms: number): SourceTimeMs => ms as SourceTimeMs,
  timeline: (ms: number): TimelineMs => ms as TimelineMs,
  clipRelative: (ms: number): ClipRelativeMs => ms as ClipRelativeMs,
  
  /**
   * Extract raw number from branded type (use with caution)
   */
  raw: (time: SourceTimeMs | TimelineMs | ClipRelativeMs): number => time as number
}

/**
 * Time range in a specific coordinate system
 */
export interface SourceTimeRange {
  start: SourceTimeMs
  end: SourceTimeMs
}

export interface TimelineRange {
  start: TimelineMs
  end: TimelineMs
}

export interface ClipRelativeRange {
  start: ClipRelativeMs
  end: ClipRelativeMs
}