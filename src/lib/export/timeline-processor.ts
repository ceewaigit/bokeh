/**
 * Timeline processor for handling multi-clip exports
 * Splits timeline into segments for parallel processing
 */

import type { Timeline, Clip, Recording, Effect } from '@/types'
import { TrackType } from '@/types'
import { logger } from '@/lib/utils/logger'

export interface TimelineSegment {
  id: string
  startTime: number  // Timeline time in ms
  endTime: number    // Timeline time in ms
  clips: Array<{
    clip: Clip
    recording: Recording
    segmentStartTime: number  // Start time within this segment
    segmentEndTime: number    // End time within this segment
  }>
  effects: Effect[]  // Effects active during this segment
  hasGap: boolean   // Whether this segment has gaps between clips
}

export interface ProcessedTimeline {
  segments: TimelineSegment[]
  totalDuration: number
  clipCount: number
  hasMultipleClips: boolean
  hasGaps: boolean
}

export class TimelineProcessor {
  /**
   * Process timeline into segments for efficient export
   */
  processTimeline(
    timeline: Timeline,
    recordings: Map<string, Recording>,
    segmentDuration: number = 5000  // Default 5 second segments
  ): ProcessedTimeline {
    // Get all video clips sorted by start time
    const videoClips = timeline.tracks
      .filter(track => track.type === TrackType.Video)
      .flatMap(track => track.clips)
      .sort((a, b) => a.startTime - b.startTime)

    if (videoClips.length === 0) {
      return {
        segments: [],
        totalDuration: 0,
        clipCount: 0,
        hasMultipleClips: false,
        hasGaps: false
      }
    }

    // Check for gaps
    const hasGaps = this.detectGaps(videoClips)

    // Merge all effects: timeline effects + recording-scoped non-zoom effects
    const allEffects: Effect[] = [...(timeline.effects || [])]
    for (const recording of recordings.values()) {
      if (recording.effects) {
        allEffects.push(...recording.effects)
      }
    }

    // Split timeline into segments
    const segments = this.createSegments(
      videoClips,
      recordings,
      allEffects,
      timeline.duration,
      segmentDuration
    )

    return {
      segments,
      totalDuration: timeline.duration,
      clipCount: videoClips.length,
      hasMultipleClips: videoClips.length > 1,
      hasGaps
    }
  }

  /**
   * Create segments from timeline
   */
  private createSegments(
    clips: Clip[],
    recordings: Map<string, Recording>,
    effects: Effect[],
    totalDuration: number,
    segmentDuration: number
  ): TimelineSegment[] {
    const segments: TimelineSegment[] = []

    // If no clips, return empty
    if (clips.length === 0) {
      return segments
    }

    // Use the actual clip range instead of total timeline duration
    const firstClipStart = clips[0].startTime
    const lastClip = clips[clips.length - 1]
    const actualEndTime = lastClip.startTime + lastClip.duration
    const actualDuration = actualEndTime - firstClipStart

    // Create segments only for the actual content range
    const segmentCount = Math.ceil(actualDuration / segmentDuration)

    for (let i = 0; i < segmentCount; i++) {
      const segmentStart = firstClipStart + (i * segmentDuration)
      const segmentEnd = Math.min(firstClipStart + ((i + 1) * segmentDuration), actualEndTime)

      // Find clips that overlap with this segment
      const segmentClips = clips
        .filter(clip => {
          const clipEnd = clip.startTime + clip.duration
          return clip.startTime < segmentEnd && clipEnd > segmentStart
        })
        .map(clip => {
          const recording = recordings.get(clip.recordingId)
          if (!recording) {
            throw new Error(`Recording ${clip.recordingId} not found for clip ${clip.id}`)
          }

          // Calculate the portion of the clip that falls within this segment
          const clipEnd = clip.startTime + clip.duration
          const segmentClipStart = Math.max(0, segmentStart - clip.startTime)
          const segmentClipEnd = Math.min(clip.duration, segmentEnd - clip.startTime)

          return {
            clip,
            recording,
            segmentStartTime: segmentClipStart,
            segmentEndTime: segmentClipEnd
          }
        })

      // Find effects active during this segment
      const segmentEffects = effects.filter(effect =>
        effect.enabled &&
        effect.startTime < segmentEnd &&
        effect.endTime > segmentStart
      )

      // Check if this segment has gaps
      const hasGap = this.segmentHasGaps(segmentClips, segmentStart, segmentEnd)

      segments.push({
        id: `segment-${i}`,
        startTime: segmentStart,
        endTime: segmentEnd,
        clips: segmentClips,
        effects: segmentEffects,
        hasGap
      })
    }

    return segments
  }

  /**
   * Detect if there are gaps between clips
   */
  private detectGaps(clips: Clip[], threshold: number = 10): boolean {
    for (let i = 1; i < clips.length; i++) {
      const prevClip = clips[i - 1]
      const currClip = clips[i]
      const gap = currClip.startTime - (prevClip.startTime + prevClip.duration)

      if (gap > threshold) {
        logger.debug(`Gap detected: ${gap}ms between clips at ${prevClip.startTime + prevClip.duration}ms`)
        return true
      }
    }

    return false
  }

  /**
   * Check if a segment has gaps
   */
  private segmentHasGaps(
    segmentClips: Array<{ segmentStartTime: number; segmentEndTime: number }>,
    segmentStart: number,
    segmentEnd: number
  ): boolean {
    // If no clips, it's a gap only if this isn't a partial segment at the end
    if (segmentClips.length === 0) {
      return false  // Don't treat empty segments as gaps - they'll be skipped anyway
    }

    // Don't check for gaps, just process what we have
    // The split clips from typing speed adjustments shouldn't be treated as gaps
    return false
  }

  /**
   * Merge overlapping clips in a segment
   * Useful for handling split clips or transitions
   */
  mergeOverlappingClips(segment: TimelineSegment): TimelineSegment {
    if (segment.clips.length <= 1) {
      return segment
    }

    // Sort clips by start time
    const sortedClips = [...segment.clips].sort((a, b) =>
      a.clip.startTime - b.clip.startTime
    )

    const mergedClips = [sortedClips[0]]

    for (let i = 1; i < sortedClips.length; i++) {
      const current = sortedClips[i]
      const previous = mergedClips[mergedClips.length - 1]

      // Check if clips overlap
      const prevEnd = previous.clip.startTime + previous.clip.duration
      if (current.clip.startTime < prevEnd) {
        // Clips overlap - this might be a transition or split clip
        logger.debug(`Overlapping clips detected at ${current.clip.startTime}ms`)

        // For now, keep both clips (transition handling)
        mergedClips.push(current)
      } else {
        mergedClips.push(current)
      }
    }

    return {
      ...segment,
      clips: mergedClips
    }
  }

  /**
   * Calculate the source time in a recording for a given timeline time
   */
  calculateSourceTime(clip: Clip, timelineTime: number): number {
    const clipRelativeTime = timelineTime - clip.startTime

    if (clipRelativeTime < 0 || clipRelativeTime > clip.duration) {
      return -1  // Time is outside this clip
    }

    // Handle time remapping if present
    if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
      let sourceTime = clip.sourceIn
      let remainingTime = clipRelativeTime

      for (const period of clip.timeRemapPeriods) {
        const periodDuration = period.sourceEndTime - period.sourceStartTime
        const periodPlaybackDuration = periodDuration / period.speedMultiplier

        if (remainingTime <= periodPlaybackDuration) {
          // We're within this period
          return sourceTime + (remainingTime * period.speedMultiplier)
        }

        remainingTime -= periodPlaybackDuration
        sourceTime = period.sourceEndTime
      }

      // After all remap periods, use normal playback rate
      const playbackRate = clip.playbackRate || 1
      return sourceTime + (remainingTime * playbackRate)
    }

    // Simple calculation with playback rate
    const playbackRate = clip.playbackRate || 1
    return clip.sourceIn + (clipRelativeTime * playbackRate)
  }
}

// Singleton instance
export const timelineProcessor = new TimelineProcessor()
