/**
 * Clip Utilities
 *
 * Centralized helpers for computing clip state and properties.
 * Reduces code duplication across commands and sync services.
 */

import type { Clip } from '@/types/project'
import type { ClipState } from '@/features/effects/sync/types'

export const ClipUtils = {
  /**
   * Get the source-in time for a clip, defaulting to 0.
   */
  getSourceIn: (clip: Clip): number => clip.sourceIn ?? 0,

  /**
   * Get the playback rate for a clip, defaulting to 1.
   */
  getPlaybackRate: (clip: Clip): number => clip.playbackRate ?? 1,

  /**
   * Get the end time (startTime + duration) for a clip.
   */
  getEndTime: (clip: Clip): number => clip.startTime + clip.duration,

  /**
   * Get the source-out time for a clip, computing default from duration if not set.
   */
  getSourceOut: (clip: Clip): number => {
    if (clip.sourceOut != null) return clip.sourceOut
    const sourceIn = clip.sourceIn ?? 0
    const playbackRate = clip.playbackRate ?? 1
    return sourceIn + clip.duration * playbackRate
  },

  /**
   * Get the timeline range (startTime and endTime) for a clip.
   */
  getTimelineRange: (clip: Clip): { startTime: number; endTime: number } => ({
    startTime: clip.startTime,
    endTime: clip.startTime + clip.duration
  }),

  /**
   * Get the source range (sourceIn and sourceOut) for a clip.
   */
  getSourceRange: (clip: Clip): { sourceIn: number; sourceOut: number } => ({
    sourceIn: clip.sourceIn ?? 0,
    sourceOut: clip.sourceOut ?? (clip.sourceIn ?? 0) + clip.duration * (clip.playbackRate ?? 1)
  }),

  /**
   * Build a ClipState snapshot from a clip.
   * Used for sync change tracking before/after operations.
   */
  buildState: (clip: Clip): ClipState => ({
    startTime: clip.startTime,
    endTime: clip.startTime + clip.duration,
    playbackRate: clip.playbackRate ?? 1,
    sourceIn: clip.sourceIn ?? 0,
    sourceOut: clip.sourceOut ?? (clip.sourceIn ?? 0) + clip.duration * (clip.playbackRate ?? 1)
  })
}
