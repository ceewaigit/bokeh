/**
 * Unit Tests: sourceRangeToTimelineRange
 *
 * Tests the canonical source-to-timeline range conversion utility.
 *
 * Key behaviors tested:
 * - Clamping source range BEFORE conversion (prevents overlaps)
 * - Returning null for non-overlapping ranges
 * - Correct projection with playback rates
 * - Clip source window boundaries
 */

import { describe, it, expect } from '@jest/globals'
import { sourceRangeToTimelineRange } from '@/features/ui/timeline/time/time-space-converter'
import type { Clip } from '@/types/project'

// ============================================================================
// Test Fixtures
// ============================================================================

function createClip(
  startTime: number,
  duration: number,
  sourceIn = 0,
  sourceOut?: number,
  playbackRate = 1
): Clip {
  return {
    id: 'test-clip',
    recordingId: 'test-recording',
    startTime,
    duration,
    sourceIn,
    sourceOut: sourceOut ?? (sourceIn + duration * playbackRate),
    playbackRate
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('sourceRangeToTimelineRange', () => {
  describe('Basic Projection', () => {
    it('projects source range to timeline when fully within clip', () => {
      const clip = createClip(0, 10000, 0, 10000)
      const result = sourceRangeToTimelineRange({ startTime: 2000, endTime: 4000 }, clip)
      expect(result).toEqual({ start: 2000, end: 4000 })
    })

    it('projects source range with clip offset', () => {
      const clip = createClip(5000, 10000, 0, 10000)
      const result = sourceRangeToTimelineRange({ startTime: 2000, endTime: 4000 }, clip)
      expect(result).toEqual({ start: 7000, end: 9000 })
    })

    it('projects source range with non-zero sourceIn', () => {
      const clip = createClip(0, 6000, 2000, 8000)
      const result = sourceRangeToTimelineRange({ startTime: 3000, endTime: 5000 }, clip)
      expect(result).toEqual({ start: 1000, end: 3000 })
    })
  })

  describe('Non-Overlapping Ranges Return Null', () => {
    it('returns null when range is completely before clip source window', () => {
      const clip = createClip(0, 5000, 5000, 10000) // sourceIn=5000
      const result = sourceRangeToTimelineRange({ startTime: 0, endTime: 3000 }, clip)
      expect(result).toBeNull()
    })

    it('returns null when range is completely after clip source window', () => {
      const clip = createClip(0, 5000, 0, 5000)
      const result = sourceRangeToTimelineRange({ startTime: 7000, endTime: 10000 }, clip)
      expect(result).toBeNull()
    })

    it('returns null when range touches but does not overlap (at start)', () => {
      const clip = createClip(0, 5000, 5000, 10000)
      const result = sourceRangeToTimelineRange({ startTime: 3000, endTime: 5000 }, clip)
      expect(result).toBeNull()
    })

    it('returns null when range touches but does not overlap (at end)', () => {
      const clip = createClip(0, 5000, 0, 5000)
      const result = sourceRangeToTimelineRange({ startTime: 5000, endTime: 8000 }, clip)
      expect(result).toBeNull()
    })
  })

  describe('Clamping Prevents Overlaps - The Core Bug Fix', () => {
    it('clamps range that extends before clip source window', () => {
      // This is the bug case: range starts before sourceIn
      const clip = createClip(1000, 6000, 2000, 8000) // sourceIn=2000
      const result = sourceRangeToTimelineRange({ startTime: 0, endTime: 4000 }, clip)

      // Should clamp to 2000-4000 in source, then project
      // Timeline start = 1000 + (2000-2000)/1 = 1000
      // Timeline end = 1000 + (4000-2000)/1 = 3000
      expect(result).toEqual({ start: 1000, end: 3000 })
    })

    it('clamps range that extends after clip source window', () => {
      const clip = createClip(1000, 6000, 2000, 8000) // sourceOut=8000
      const result = sourceRangeToTimelineRange({ startTime: 6000, endTime: 12000 }, clip)

      // Should clamp to 6000-8000 in source, then project
      // Timeline start = 1000 + (6000-2000)/1 = 5000
      // Timeline end = 1000 + (8000-2000)/1 = 7000
      expect(result).toEqual({ start: 5000, end: 7000 })
    })

    it('prevents multiple out-of-range periods from collapsing to same point', () => {
      // This is THE critical test for the bug fix
      // Two periods both extend before sourceIn should NOT overlap
      const clip = createClip(1000, 3000, 5000, 8000) // sourceIn=5000

      // Period 1: completely before clip source range
      const period1 = sourceRangeToTimelineRange({ startTime: 0, endTime: 2000 }, clip)
      expect(period1).toBeNull() // Should NOT map to clip start!

      // Period 2: also completely before
      const period2 = sourceRangeToTimelineRange({ startTime: 2500, endTime: 4500 }, clip)
      expect(period2).toBeNull() // Should NOT map to clip start!

      // Period 3: partially overlaps - should be clamped correctly
      const period3 = sourceRangeToTimelineRange({ startTime: 4000, endTime: 6000 }, clip)
      // Clamped to 5000-6000, projected to 1000-2000
      expect(period3).toEqual({ start: 1000, end: 2000 })
    })

    it('handles keystroke padding scenario correctly', () => {
      // Simulates keystroke-sync.ts scenario:
      // Cluster at source 0-2000ms with 500ms padding = -500 to 2500ms
      const clip = createClip(0, 5000, 1000, 6000) // sourceIn=1000

      const paddedStart = 0 - 500 // -500 (cluster.startTime - PADDING_MS)
      const paddedEnd = 2000 + 500 // 2500 (cluster.endTime + PADDING_MS)

      const result = sourceRangeToTimelineRange(
        { startTime: paddedStart, endTime: paddedEnd },
        clip
      )

      // Should clamp to 1000-2500, then project
      // Timeline start = 0 + (1000-1000)/1 = 0
      // Timeline end = 0 + (2500-1000)/1 = 1500
      expect(result).toEqual({ start: 0, end: 1500 })
    })
  })

  describe('Playback Rate', () => {
    it('projects with 2x playback rate', () => {
      const clip = createClip(0, 5000, 0, 10000, 2)
      const result = sourceRangeToTimelineRange({ startTime: 2000, endTime: 4000 }, clip)
      // Duration halved on timeline
      expect(result).toEqual({ start: 1000, end: 2000 })
    })

    it('projects with 0.5x playback rate', () => {
      const clip = createClip(0, 10000, 0, 5000, 0.5)
      const result = sourceRangeToTimelineRange({ startTime: 1000, endTime: 2000 }, clip)
      // Duration doubled on timeline
      expect(result).toEqual({ start: 2000, end: 4000 })
    })
  })

  describe('Edge Cases', () => {
    it('handles zero-duration source range', () => {
      const clip = createClip(0, 10000, 0, 10000)
      const result = sourceRangeToTimelineRange({ startTime: 5000, endTime: 5000 }, clip)
      expect(result).toBeNull()
    })

    it('handles source range at exact clip boundaries', () => {
      const clip = createClip(0, 10000, 0, 10000)
      const result = sourceRangeToTimelineRange({ startTime: 0, endTime: 10000 }, clip)
      expect(result).toEqual({ start: 0, end: 10000 })
    })

    it('handles very small overlap at start', () => {
      const clip = createClip(0, 10000, 5000, 15000)
      // Range 4999-5001 overlaps clip by just 1ms
      const result = sourceRangeToTimelineRange({ startTime: 4999, endTime: 5001 }, clip)
      // Clamped to 5000-5001, projected to 0-1
      expect(result).toEqual({ start: 0, end: 1 })
    })

    it('handles very small overlap at end', () => {
      const clip = createClip(0, 10000, 0, 10000)
      const result = sourceRangeToTimelineRange({ startTime: 9999, endTime: 10001 }, clip)
      // Clamped to 9999-10000
      expect(result).toEqual({ start: 9999, end: 10000 })
    })

    it('handles negative source timestamps (from padding)', () => {
      const clip = createClip(0, 5000, 0, 5000)
      const result = sourceRangeToTimelineRange({ startTime: -500, endTime: 1000 }, clip)
      // Clamped to 0-1000
      expect(result).toEqual({ start: 0, end: 1000 })
    })
  })
})
