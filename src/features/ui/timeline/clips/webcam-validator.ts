/**
 * Webcam Track Validator
 *
 * Consolidated validation for webcam track clips to prevent overlaps.
 * Webcam clips can be freely positioned but cannot overlap each other.
 */

import type { Track, Clip } from '@/types/project'
import { clipsToBlocks, validatePosition } from '@/features/ui/timeline/utils/drag-positioning'

export interface MoveValidationResult {
  isValid: boolean
  startTime: number
}

export interface TrimEndValidationResult {
  isValid: boolean
  endTime: number
}

export interface TrimStartValidationResult {
  isValid: boolean
  startTime: number
}

export const WebcamTrackValidator = {
  /**
   * Validate a clip move/add operation on a webcam track.
   * Returns the validated start time (original or adjusted to avoid overlap).
   */
  validateMove(
    track: Track,
    proposedStartTime: number,
    duration: number,
    excludeClipId?: string
  ): MoveValidationResult {
    const blocks = clipsToBlocks(track.clips)

    const validation = validatePosition(
      proposedStartTime,
      duration,
      blocks,
      excludeClipId,
      { findAlternativeIfInvalid: true }
    )

    if (validation.isValid) {
      return { isValid: true, startTime: validation.finalPosition }
    }

    return {
      isValid: false,
      startTime: validation.suggestedPosition ?? validation.finalPosition
    }
  },

  /**
   * Validate a trim-start operation on a webcam track.
   * Returns the validated start time (original or clamped to previous clip's end).
   */
  validateTrimStart(
    track: Track,
    clip: Clip,
    newStartTime: number
  ): TrimStartValidationResult {
    // Calculate the new duration after trimming from start
    const proposedDuration = clip.startTime + clip.duration - newStartTime
    const blocks = clipsToBlocks(track.clips)

    const validation = validatePosition(
      newStartTime,
      proposedDuration,
      blocks,
      clip.id,
      { findAlternativeIfInvalid: true }
    )

    if (validation.isValid) {
      return { isValid: true, startTime: newStartTime }
    }

    // For start trim, find the previous clip and clamp to its end
    const sortedClips = track.clips
      .filter(c => c.id !== clip.id)
      .sort((a, b) => a.startTime - b.startTime)

    const prevClip = sortedClips.reverse().find(c => c.startTime + c.duration <= clip.startTime + clip.duration)
    if (prevClip && newStartTime < prevClip.startTime + prevClip.duration) {
      return { isValid: false, startTime: prevClip.startTime + prevClip.duration }
    }

    // Fall back to suggested position
    return {
      isValid: false,
      startTime: validation.suggestedPosition ?? validation.finalPosition
    }
  },

  /**
   * Validate a trim-end operation on a webcam track.
   * Returns the validated end time (original or clamped to next clip's start).
   */
  validateTrimEnd(
    track: Track,
    clip: Clip,
    newEndTime: number
  ): TrimEndValidationResult {
    const proposedDuration = newEndTime - clip.startTime
    const blocks = clipsToBlocks(track.clips)

    const validation = validatePosition(
      clip.startTime,
      proposedDuration,
      blocks,
      clip.id,
      { findAlternativeIfInvalid: true }
    )

    if (validation.isValid) {
      return { isValid: true, endTime: newEndTime }
    }

    // For end trim, find the next clip and clamp to its start
    const sortedClips = track.clips
      .filter(c => c.id !== clip.id)
      .sort((a, b) => a.startTime - b.startTime)

    const nextClip = sortedClips.find(c => c.startTime >= clip.startTime)
    if (nextClip && newEndTime > nextClip.startTime) {
      return { isValid: false, endTime: nextClip.startTime }
    }

    return { isValid: false, endTime: newEndTime }
  },

  /**
   * Calculate max duration when expanding a clip (used during duration-only changes).
   * Returns the maximum duration before hitting the next clip.
   */
  getMaxDurationToNextClip(
    track: Track,
    clip: Clip
  ): number {
    const sortedClips = track.clips
      .filter(c => c.id !== clip.id)
      .sort((a, b) => a.startTime - b.startTime)

    const nextClip = sortedClips.find(c => c.startTime >= clip.startTime)
    if (nextClip) {
      return nextClip.startTime - clip.startTime
    }

    return Infinity
  }
}
