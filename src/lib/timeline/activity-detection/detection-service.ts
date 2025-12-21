/**
 * Activity Detection Service
 * Unified entry point for all activity detection (typing, idle, etc.)
 * Eliminates duplicated detection/filtering logic across components
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
  all: SpeedUpPeriod[]
}

/**
 * Unified service for all activity detection
 * Single entry point for components - eliminates duplicated logic
 */
export class ActivityDetectionService {
  /**
   * Get all speed-up suggestions for a recording
   * Results are automatically cached
   */
  static analyzeRecording(recording: Recording, metadata?: RecordingMetadata): RecordingAnalysis {
    return {
      typing: typingDetector.analyze(recording, metadata),
      idle: idleDetector.analyze(recording, metadata)
    }
  }

  /**
   * Get suggestions filtered for a specific clip
   * Respects already-applied flags on the clip
   */
  static getSuggestionsForClip(
    recording: Recording,
    clip: Clip,
    metadata?: RecordingMetadata
  ): ClipSuggestions {
    const analysis = this.analyzeRecording(recording, metadata)

    // Filter to clip's source range, skip if already applied
    const typing = clip.typingSpeedApplied
      ? []
      : filterPeriodsForClip(analysis.typing.periods, clip)

    const idle = clip.idleSpeedApplied
      ? []
      : filterPeriodsForClip(analysis.idle.periods, clip)

    // Combine and sort by start time
    const all = [...typing, ...idle].sort((a, b) => a.startTime - b.startTime)

    return { typing, idle, all }
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
   * Count total suggestions across all clips in a project
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
      idle += suggestions.idle.length
    }

    return { typing, idle, total: typing + idle }
  }

  /**
   * Resolve overlapping periods by preferring the faster multiplier
   * Used when applying both typing and idle speed-ups
   */
  static resolveOverlaps(periods: SpeedUpPeriod[]): SpeedUpPeriod[] {
    if (periods.length <= 1) return periods

    // Sort by start time
    const sorted = [...periods].sort((a, b) => a.startTime - b.startTime)
    const resolved: SpeedUpPeriod[] = []

    for (const period of sorted) {
      // Check if this period overlaps with any existing resolved period
      let handled = false

      for (let i = 0; i < resolved.length; i++) {
        const existing = resolved[i]

        // Check for overlap
        if (period.startTime < existing.endTime && period.endTime > existing.startTime) {
          // Overlapping - keep the one with higher speed multiplier
          if (period.suggestedSpeedMultiplier > existing.suggestedSpeedMultiplier) {
            // Split/merge logic: prefer faster period
            // For simplicity, just replace if the new one is faster
            resolved[i] = {
              ...period,
              // Expand to cover both ranges
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

// Also export individual detectors for direct use if needed
export { typingDetector, idleDetector }
export { TypingActivityDetector } from './typing-detector'
export { IdleActivityDetector } from './idle-detector'
