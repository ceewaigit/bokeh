/**
 * Activity Detection Service
 * Unified entry point for all activity detection (typing, idle)
 * 
 * Edge idle periods (at clip start/end) are derived from idle detection
 * and marked as TrimStart/TrimEnd - users can choose to speed up OR trim.
 */

import type { Recording, Clip, RecordingMetadata } from '@/types/project'
import type { SpeedUpPeriod, SpeedUpSuggestions } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import { filterPeriodsForClip, calculateOverallSuggestion } from './index'
import { TypingActivityDetector } from './typing-detector'
import { IdleActivityDetector } from './idle-detector'

// Singleton instances
const typingDetector = new TypingActivityDetector()
const idleDetector = new IdleActivityDetector()

/**
 * Result of analyzing a recording for speed-up opportunities
 */
export interface RecordingAnalysis {
  typing: SpeedUpSuggestions
  idle: SpeedUpSuggestions
}

/**
 * Result of getting suggestions filtered for a specific clip
 */
export interface ClipSuggestions {
  typing: SpeedUpPeriod[]
  idle: SpeedUpPeriod[]
  edgeIdle: SpeedUpPeriod[] // Idle at clip edges - can be trimmed or sped up
  all: SpeedUpPeriod[]
}

/**
 * Unified service for all activity detection
 */
export class ActivityDetectionService {
  /**
   * Get all speed-up suggestions for a recording
   */
  static analyzeRecording(recording: Recording, metadata?: RecordingMetadata): RecordingAnalysis {
    return {
      typing: typingDetector.analyze(recording, metadata),
      idle: idleDetector.analyze(recording, metadata)
    }
  }

  /**
   * Get suggestions filtered for a specific clip
   * Edge idle periods are automatically identified and marked
   */
  static getSuggestionsForClip(
    recording: Recording,
    clip: Clip,
    metadata?: RecordingMetadata
  ): ClipSuggestions {
    const analysis = this.analyzeRecording(recording, metadata)

    // Filter to clip's source range, skip if already applied
    const allTyping = clip.typingSpeedApplied
      ? []
      : filterPeriodsForClip(analysis.typing.periods, clip)

    const allIdle = clip.idleSpeedApplied
      ? []
      : filterPeriodsForClip(analysis.idle.periods, clip)

    // Separate edge idle from mid-clip idle
    const sourceIn = clip.sourceIn || 0
    const sourceOut = clip.sourceOut || recording.duration
    const edgeThresholdMs = 500 // Consider idle as "edge" if within 500ms of clip boundary

    const edgeIdle: SpeedUpPeriod[] = []
    const midIdle: SpeedUpPeriod[] = []

    for (const period of allIdle) {
      // Skip periods that have been "trimmed out" - no longer in clip source range
      // This prevents stale overlay suggestions after a clip has been trimmed
      if (period.endTime <= sourceIn || period.startTime >= sourceOut) continue

      const isNearStart = period.startTime <= sourceIn + edgeThresholdMs
      const isNearEnd = period.endTime >= sourceOut - edgeThresholdMs

      if (isNearStart && period.startTime <= sourceIn + edgeThresholdMs) {
        // Idle at clip start - mark as TrimStart
        edgeIdle.push({
          ...period,
          type: SpeedUpType.TrimStart,
          metadata: {
            ...period.metadata,
            trimSavedMs: period.endTime - period.startTime,
            newSourceIn: period.endTime
          }
        })
      } else if (isNearEnd && period.endTime >= sourceOut - edgeThresholdMs) {
        // Idle at clip end - mark as TrimEnd
        edgeIdle.push({
          ...period,
          type: SpeedUpType.TrimEnd,
          metadata: {
            ...period.metadata,
            trimSavedMs: period.endTime - period.startTime,
            newSourceOut: period.startTime
          }
        })
      } else {
        // Mid-clip idle - keep as regular idle
        midIdle.push(period)
      }
    }

    // Combine all periods
    const all = [...allTyping, ...midIdle, ...edgeIdle].sort((a, b) => a.startTime - b.startTime)

    return {
      typing: allTyping,
      idle: midIdle,
      edgeIdle,
      // Keep 'trim' for backward compatibility with overlay
      get trim() { return edgeIdle },
      all
    } as ClipSuggestions & { trim: SpeedUpPeriod[] }
  }

  /**
   * Check if a clip has any unapplied suggestions
   */
  static hasUnappliedSuggestions(recording: Recording, clip: Clip): boolean {
    const suggestions = this.getSuggestionsForClip(recording, clip)
    return suggestions.all.length > 0
  }

  /**
   * Get overall suggestion combining all period types
   */
  static getOverallSuggestion(
    recording: Recording,
    clip: Clip
  ): { speedMultiplier: number; timeSavedMs: number } | undefined {
    const suggestions = this.getSuggestionsForClip(recording, clip)
    return calculateOverallSuggestion(suggestions.all)
  }

  /**
   * Count total suggestions across all clips
   */
  static countAllSuggestions(
    recordings: Recording[],
    clips: Clip[]
  ): { typing: number; idle: number; total: number } {
    let typing = 0
    let idle = 0

    for (const clip of clips) {
      const recording = recordings.find(r => r.id === clip.recordingId)
      if (!recording) continue

      const suggestions = this.getSuggestionsForClip(recording, clip)
      typing += suggestions.typing.length
      idle += suggestions.idle.length + suggestions.edgeIdle.length
    }

    return { typing, idle, total: typing + idle }
  }

  /**
   * Resolve overlapping periods by preferring the faster multiplier
   */
  static resolveOverlaps(periods: SpeedUpPeriod[]): SpeedUpPeriod[] {
    if (periods.length <= 1) return periods

    const sorted = [...periods].sort((a, b) => a.startTime - b.startTime)
    const resolved: SpeedUpPeriod[] = []

    for (const period of sorted) {
      let handled = false

      for (let i = 0; i < resolved.length; i++) {
        const existing = resolved[i]

        if (period.startTime < existing.endTime && period.endTime > existing.startTime) {
          if (period.suggestedSpeedMultiplier > existing.suggestedSpeedMultiplier) {
            resolved[i] = {
              ...period,
              startTime: Math.min(period.startTime, existing.startTime),
              endTime: Math.max(period.endTime, existing.endTime)
            }
          }
          handled = true
          break
        }
      }

      if (!handled) {
        resolved.push(period)
      }
    }

    return resolved.sort((a, b) => a.startTime - b.startTime)
  }
}

// Export individual detectors
export { typingDetector, idleDetector }
export { TypingActivityDetector } from './typing-detector'
export { IdleActivityDetector } from './idle-detector'
