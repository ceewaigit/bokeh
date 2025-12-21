/**
 * Activity Detection System
 * Unified interface for detecting speed-up opportunities (typing, idle, etc.)
 */

import type { Recording, Clip, RecordingMetadata } from '@/types/project'
import type { SpeedUpPeriod, SpeedUpSuggestions, SpeedUpType } from '@/types/speed-up'

/**
 * Interface for activity detectors
 * Each detector analyzes recordings for specific activity patterns
 */
export interface ActivityDetector {
  readonly type: SpeedUpType

  /**
   * Analyze recording and return detected periods
   * Should use caching when available
   */
  analyze(recording: Recording, metadata?: RecordingMetadata): SpeedUpSuggestions

  /**
   * Get periods that overlap with a source time range
   */
  getPeriodsInRange(
    suggestions: SpeedUpSuggestions,
    sourceStart: number,
    sourceEnd: number
  ): SpeedUpPeriod[]
}

/**
 * Calculate clip's effective source range
 * Eliminates duplicated calculation that appeared in 3+ places
 */
export function getClipSourceRange(clip: Clip): { sourceIn: number; sourceOut: number } {
  const sourceIn = clip.sourceIn || 0
  const playbackRate = clip.playbackRate || 1
  const sourceOut = clip.sourceOut || (sourceIn + clip.duration * playbackRate)
  return { sourceIn, sourceOut }
}

/**
 * Filter periods to only those overlapping with a clip's source range
 * Eliminates duplicated filtering logic that appeared in 3+ places
 */
export function filterPeriodsForClip<T extends { startTime: number; endTime: number }>(
  periods: T[],
  clip: Clip
): T[] {
  const { sourceIn, sourceOut } = getClipSourceRange(clip)
  return periods.filter(p => p.endTime > sourceIn && p.startTime < sourceOut)
}

/**
 * Calculate overall suggestion from a list of periods
 */
export function calculateOverallSuggestion(
  periods: SpeedUpPeriod[]
): { speedMultiplier: number; timeSavedMs: number } | undefined {
  if (periods.length === 0) return undefined

  let totalDuration = 0
  let weightedSpeedSum = 0

  for (const period of periods) {
    const duration = period.endTime - period.startTime
    const weight = duration * period.confidence
    totalDuration += duration
    weightedSpeedSum += period.suggestedSpeedMultiplier * weight
  }

  if (totalDuration === 0) return undefined

  const avgSpeed = weightedSpeedSum / totalDuration
  const timeSavedMs = totalDuration * (1 - 1 / avgSpeed)

  return {
    speedMultiplier: Math.round(avgSpeed * 10) / 10,
    timeSavedMs: Math.round(timeSavedMs)
  }
}

// Re-export types for convenience
export type { SpeedUpPeriod, SpeedUpSuggestions, SpeedUpType }
export { SpeedUpType as SpeedUpTypeEnum } from '@/types/speed-up'
