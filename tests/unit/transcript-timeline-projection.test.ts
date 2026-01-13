/**
 * Black Box Tests: Timeline Data Service - Transcript Projection
 *
 * Tests the source-space to timeline-space projection logic.
 *
 * INPUT: Source time ranges (hidden regions), clips with positions
 * OUTPUT: Timeline-space skip ranges
 *
 * Key behaviors tested:
 * - Source range projects correctly to timeline
 * - Clip sourceIn/sourceOut windowing
 * - Playback rate affects projection
 * - Multiple clips from same recording
 * - Non-overlapping ranges produce no output
 * - Global skip range merging
 */

import { describe, it, expect } from '@jest/globals'
import type { Clip, SourceTimeRange } from '@/types/project'
import type { GlobalSkipRange } from '@/types/skip-ranges'

// Pure function extraction of projection logic
function sourceToTimeline(sourceTime: number, clip: Clip): number {
  const sourceIn = clip.sourceIn ?? 0
  const playbackRate = clip.playbackRate ?? 1
  return clip.startTime + (sourceTime - sourceIn) / playbackRate
}

function projectSourceRangeToTimeline(
  sourceRange: SourceTimeRange,
  clip: Clip
): { start: number; end: number } | null {
  const clipSourceIn = clip.sourceIn ?? 0
  const clipSourceOut = clip.sourceOut ?? (clipSourceIn + (clip.duration * (clip.playbackRate ?? 1)))

  // Check if range overlaps with clip's source window
  if (sourceRange.endTime <= clipSourceIn || sourceRange.startTime >= clipSourceOut) {
    return null
  }

  // Clamp range to clip's source window
  const clampedSourceStart = Math.max(sourceRange.startTime, clipSourceIn)
  const clampedSourceEnd = Math.min(sourceRange.endTime, clipSourceOut)

  if (clampedSourceEnd <= clampedSourceStart) {
    return null
  }

  // Project to timeline
  const timelineStart = sourceToTimeline(clampedSourceStart, clip)
  const timelineEnd = sourceToTimeline(clampedSourceEnd, clip)

  // Clamp to clip bounds
  const clipEnd = clip.startTime + clip.duration
  const finalStart = Math.max(clip.startTime, Math.min(timelineStart, timelineEnd))
  const finalEnd = Math.min(clipEnd, Math.max(timelineStart, timelineEnd))

  if (finalEnd <= finalStart) {
    return null
  }

  return { start: finalStart, end: finalEnd }
}

function mergeAndSortSkipRanges(ranges: GlobalSkipRange[]): GlobalSkipRange[] {
  if (ranges.length === 0) return []

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: GlobalSkipRange[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]

    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push({ ...current })
    }
  }

  return merged
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createClip(
  id: string,
  startTime: number,
  duration: number,
  sourceIn = 0,
  sourceOut?: number,
  playbackRate = 1
): Clip {
  return {
    id,
    recordingId: 'rec-1',
    startTime,
    duration,
    sourceIn,
    sourceOut: sourceOut ?? (sourceIn + duration * playbackRate),
    playbackRate
  }
}

// ============================================================================
// Black Box Tests
// ============================================================================

describe('Timeline Projection - Black Box', () => {

  describe('Basic Projection', () => {
    it('projects source range to timeline when clip starts at 0', () => {
      // INPUT: Clip at timeline 0, source 0-10000, hidden 2000-4000
      const clip = createClip('clip-1', 0, 10000, 0, 10000)
      const sourceRange: SourceTimeRange = { startTime: 2000, endTime: 4000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: Direct mapping (1:1)
      expect(result).toEqual({ start: 2000, end: 4000 })
    })

    it('projects source range with clip offset', () => {
      // INPUT: Clip starts at timeline 5000, hidden source 2000-4000
      const clip = createClip('clip-1', 5000, 10000, 0, 10000)
      const sourceRange: SourceTimeRange = { startTime: 2000, endTime: 4000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: Offset by clip start time
      expect(result).toEqual({ start: 7000, end: 9000 })
    })

    it('projects source range with non-zero sourceIn', () => {
      // INPUT: Clip uses source 2000-8000, hidden 3000-5000
      const clip = createClip('clip-1', 0, 6000, 2000, 8000)
      const sourceRange: SourceTimeRange = { startTime: 3000, endTime: 5000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: Adjusted for sourceIn offset
      // Timeline = clipStart + (sourceTime - sourceIn) = 0 + (3000 - 2000) = 1000
      expect(result).toEqual({ start: 1000, end: 3000 })
    })
  })

  describe('Playback Rate', () => {
    it('projects with 2x playback rate (fast motion)', () => {
      // INPUT: 2x speed, source 2000-4000
      const clip = createClip('clip-1', 0, 5000, 0, 10000, 2)
      const sourceRange: SourceTimeRange = { startTime: 2000, endTime: 4000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: Duration halved on timeline
      // Timeline = 0 + (2000 - 0) / 2 = 1000
      // Timeline end = 0 + (4000 - 0) / 2 = 2000
      expect(result).toEqual({ start: 1000, end: 2000 })
    })

    it('projects with 0.5x playback rate (slow motion)', () => {
      // INPUT: 0.5x speed, source 1000-2000
      const clip = createClip('clip-1', 0, 10000, 0, 5000, 0.5)
      const sourceRange: SourceTimeRange = { startTime: 1000, endTime: 2000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: Duration doubled on timeline
      // Timeline = 0 + (1000 - 0) / 0.5 = 2000
      // Timeline end = 0 + (2000 - 0) / 0.5 = 4000
      expect(result).toEqual({ start: 2000, end: 4000 })
    })
  })

  describe('Source Window Clipping', () => {
    it('returns null when source range is before clip window', () => {
      // INPUT: Clip uses source 5000-10000, hidden 0-3000
      const clip = createClip('clip-1', 0, 5000, 5000, 10000)
      const sourceRange: SourceTimeRange = { startTime: 0, endTime: 3000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: No overlap
      expect(result).toBeNull()
    })

    it('returns null when source range is after clip window', () => {
      // INPUT: Clip uses source 0-5000, hidden 7000-10000
      const clip = createClip('clip-1', 0, 5000, 0, 5000)
      const sourceRange: SourceTimeRange = { startTime: 7000, endTime: 10000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: No overlap
      expect(result).toBeNull()
    })

    it('clamps source range to clip window (partial overlap start)', () => {
      // INPUT: Clip uses source 2000-8000, hidden 0-4000
      const clip = createClip('clip-1', 0, 6000, 2000, 8000)
      const sourceRange: SourceTimeRange = { startTime: 0, endTime: 4000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: Clamped to 2000-4000 source, then projected
      // Timeline = 0 + (2000 - 2000) = 0
      // Timeline end = 0 + (4000 - 2000) = 2000
      expect(result).toEqual({ start: 0, end: 2000 })
    })

    it('clamps source range to clip window (partial overlap end)', () => {
      // INPUT: Clip uses source 2000-8000, hidden 6000-12000
      const clip = createClip('clip-1', 0, 6000, 2000, 8000)
      const sourceRange: SourceTimeRange = { startTime: 6000, endTime: 12000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: Clamped to 6000-8000 source, then projected
      // Timeline = 0 + (6000 - 2000) = 4000
      // Timeline end = 0 + (8000 - 2000) = 6000
      expect(result).toEqual({ start: 4000, end: 6000 })
    })

    it('returns null when source range touches but does not overlap', () => {
      // INPUT: Clip uses source 5000-10000, hidden ends exactly at 5000
      const clip = createClip('clip-1', 0, 5000, 5000, 10000)
      const sourceRange: SourceTimeRange = { startTime: 3000, endTime: 5000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: No overlap (boundary touch)
      expect(result).toBeNull()
    })
  })

  describe('Timeline Clamping', () => {
    it('clamps result to clip timeline bounds', () => {
      // INPUT: Clip timeline 1000-3000, source range would project beyond
      const clip: Clip = {
        id: 'clip-1',
        recordingId: 'rec-1',
        startTime: 1000,
        duration: 2000,
        sourceIn: 0,
        sourceOut: 5000, // Wider than clip duration allows
        playbackRate: 1
      }
      const sourceRange: SourceTimeRange = { startTime: 0, endTime: 5000 }

      // WHEN
      const result = projectSourceRangeToTimeline(sourceRange, clip)

      // THEN: Clamped to clip timeline bounds
      expect(result).not.toBeNull()
      expect(result!.start).toBeGreaterThanOrEqual(1000)
      expect(result!.end).toBeLessThanOrEqual(3000)
    })
  })

  describe('Skip Range Merging', () => {
    it('merges overlapping skip ranges', () => {
      const ranges: GlobalSkipRange[] = [
        { start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' },
        { start: 800, end: 2000, clipId: 'c2', recordingId: 'r1' }
      ]

      const result = mergeAndSortSkipRanges(ranges)

      expect(result).toHaveLength(1)
      expect(result[0].start).toBe(0)
      expect(result[0].end).toBe(2000)
    })

    it('merges adjacent skip ranges (within 1ms)', () => {
      const ranges: GlobalSkipRange[] = [
        { start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' },
        { start: 1001, end: 2000, clipId: 'c2', recordingId: 'r1' }
      ]

      const result = mergeAndSortSkipRanges(ranges)

      expect(result).toHaveLength(1)
      expect(result[0].start).toBe(0)
      expect(result[0].end).toBe(2000)
    })

    it('keeps separate non-adjacent ranges', () => {
      const ranges: GlobalSkipRange[] = [
        { start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' },
        { start: 2000, end: 3000, clipId: 'c2', recordingId: 'r1' }
      ]

      const result = mergeAndSortSkipRanges(ranges)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' })
      expect(result[1]).toEqual({ start: 2000, end: 3000, clipId: 'c2', recordingId: 'r1' })
    })

    it('sorts ranges by start time before merging', () => {
      const ranges: GlobalSkipRange[] = [
        { start: 5000, end: 6000, clipId: 'c3', recordingId: 'r1' },
        { start: 0, end: 1000, clipId: 'c1', recordingId: 'r1' },
        { start: 2000, end: 3000, clipId: 'c2', recordingId: 'r1' }
      ]

      const result = mergeAndSortSkipRanges(ranges)

      expect(result).toHaveLength(3)
      expect(result[0].start).toBe(0)
      expect(result[1].start).toBe(2000)
      expect(result[2].start).toBe(5000)
    })

    it('handles empty input', () => {
      const result = mergeAndSortSkipRanges([])
      expect(result).toHaveLength(0)
    })

    it('handles single range', () => {
      const ranges: GlobalSkipRange[] = [
        { start: 1000, end: 2000, clipId: 'c1', recordingId: 'r1' }
      ]

      const result = mergeAndSortSkipRanges(ranges)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ start: 1000, end: 2000, clipId: 'c1', recordingId: 'r1' })
    })
  })

  describe('Multiple Clips Same Recording', () => {
    it('projects hidden region to both clips independently', () => {
      // INPUT: Two clips from same recording at different timeline positions
      const clip1 = createClip('clip-1', 0, 5000, 0, 5000)
      const clip2 = createClip('clip-2', 10000, 5000, 0, 5000)
      const sourceRange: SourceTimeRange = { startTime: 1000, endTime: 2000 }

      // WHEN
      const result1 = projectSourceRangeToTimeline(sourceRange, clip1)
      const result2 = projectSourceRangeToTimeline(sourceRange, clip2)

      // THEN: Same source range, different timeline positions
      expect(result1).toEqual({ start: 1000, end: 2000 })
      expect(result2).toEqual({ start: 11000, end: 12000 })
    })

    it('projects hidden region only to clips that use that source portion', () => {
      // INPUT: Two clips from same recording, different source windows
      const clip1 = createClip('clip-1', 0, 5000, 0, 5000)
      const clip2 = createClip('clip-2', 10000, 5000, 5000, 10000)
      const sourceRange: SourceTimeRange = { startTime: 1000, endTime: 2000 }

      // WHEN
      const result1 = projectSourceRangeToTimeline(sourceRange, clip1)
      const result2 = projectSourceRangeToTimeline(sourceRange, clip2)

      // THEN: Only clip1 contains this source range
      expect(result1).toEqual({ start: 1000, end: 2000 })
      expect(result2).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('handles zero-duration source range', () => {
      const clip = createClip('clip-1', 0, 10000, 0, 10000)
      const sourceRange: SourceTimeRange = { startTime: 5000, endTime: 5000 }

      const result = projectSourceRangeToTimeline(sourceRange, clip)

      expect(result).toBeNull()
    })

    it('handles source range at exact clip boundaries', () => {
      const clip = createClip('clip-1', 0, 10000, 0, 10000)
      const sourceRange: SourceTimeRange = { startTime: 0, endTime: 10000 }

      const result = projectSourceRangeToTimeline(sourceRange, clip)

      expect(result).toEqual({ start: 0, end: 10000 })
    })

    it('handles clip with zero sourceIn', () => {
      const clip = createClip('clip-1', 5000, 3000, 0, 3000)
      const sourceRange: SourceTimeRange = { startTime: 1000, endTime: 2000 }

      const result = projectSourceRangeToTimeline(sourceRange, clip)

      expect(result).toEqual({ start: 6000, end: 7000 })
    })

    it('handles very small overlap', () => {
      const clip = createClip('clip-1', 0, 10000, 0, 10000)
      const sourceRange: SourceTimeRange = { startTime: 9999, endTime: 10000 }

      const result = projectSourceRangeToTimeline(sourceRange, clip)

      expect(result).toEqual({ start: 9999, end: 10000 })
    })
  })
})
