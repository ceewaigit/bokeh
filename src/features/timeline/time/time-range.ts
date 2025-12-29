/**
 * TimeRange Utility
 *
 * Standardized time range operations with consistent boundary semantics.
 *
 * BOUNDARY SEMANTICS: startTime <= time < endTime (inclusive start, exclusive end)
 * This is consistent with how clips/effects work throughout the codebase.
 *
 * This utility eliminates duplicated boundary logic across:
 * - effect-filters.ts
 * - playhead-service.ts
 * - time-space-converter.ts
 * - frame-layout.ts
 */

import type { Clip, Effect } from '@/types/project'

export interface TimeRange {
  readonly startTime: number
  readonly endTime: number
}

/**
 * TimeRange operations - stateless utilities for time range calculations.
 */
export const TimeRange = {
  /**
   * Check if a point in time falls within a range.
   * Uses inclusive start, exclusive end: startTime <= time < endTime
   */
  contains(range: TimeRange, timeMs: number): boolean {
    return timeMs >= range.startTime && timeMs < range.endTime
  },

  /**
   * Check if two ranges overlap.
   * Two ranges overlap if one starts before the other ends, and vice versa.
   */
  overlaps(a: TimeRange, b: TimeRange): boolean {
    return a.startTime < b.endTime && a.endTime > b.startTime
  },

  /**
   * Get the duration of a range in milliseconds.
   */
  duration(range: TimeRange): number {
    return range.endTime - range.startTime
  },

  /**
   * Clamp a time value to be within a range.
   * Result is always >= startTime and < endTime.
   */
  clamp(range: TimeRange, timeMs: number): number {
    if (timeMs < range.startTime) return range.startTime
    if (timeMs >= range.endTime) return range.endTime - 1
    return timeMs
  },

  /**
   * Create a TimeRange from a clip.
   */
  fromClip(clip: Clip): TimeRange {
    return {
      startTime: clip.startTime,
      endTime: clip.startTime + clip.duration
    }
  },

  /**
   * Create a TimeRange from an effect.
   */
  fromEffect(effect: Effect): TimeRange {
    return {
      startTime: effect.startTime,
      endTime: effect.endTime
    }
  },

  /**
   * Create a TimeRange from explicit start and end times.
   */
  create(startTime: number, endTime: number): TimeRange {
    if (startTime > endTime) {
      throw new Error(`[TimeRange] Invalid range: startTime (${startTime}) > endTime (${endTime})`)
    }
    return { startTime, endTime }
  },

  /**
   * Get the intersection of two ranges, or null if they don't overlap.
   */
  intersection(a: TimeRange, b: TimeRange): TimeRange | null {
    if (!TimeRange.overlaps(a, b)) return null
    return {
      startTime: Math.max(a.startTime, b.startTime),
      endTime: Math.min(a.endTime, b.endTime)
    }
  },

  /**
   * Check if range `a` completely contains range `b`.
   */
  containsRange(a: TimeRange, b: TimeRange): boolean {
    return a.startTime <= b.startTime && a.endTime >= b.endTime
  },

  /**
   * Expand a range by a specified amount on both sides.
   */
  expand(range: TimeRange, amount: number): TimeRange {
    return {
      startTime: Math.max(0, range.startTime - amount),
      endTime: range.endTime + amount
    }
  }
}
