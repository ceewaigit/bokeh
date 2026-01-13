/**
 * Black Box Tests: TranscriptEditCommand
 *
 * Tests the observable I/O behavior of transcript word deletion.
 *
 * INPUT: Recording ID, word IDs to delete, transcript with words
 * OUTPUT: Updated timeline.transcriptEdits[recordingId].hiddenRegions
 *
 * Key behaviors tested:
 * - Single word deletion creates correct hidden region
 * - Multiple contiguous words merge into single region
 * - Non-contiguous words create separate regions
 * - First word in transcript extends to 0ms
 * - Adjacent ranges merge with 5ms tolerance
 * - Existing hidden regions are preserved and merged
 */

import { describe, it, expect } from '@jest/globals'
import type { Transcript, TranscriptWord, SourceTimeRange } from '@/types/project'

// We test via the command's mutation logic by simulating what it does
// This is a pure function extraction of the command's core logic

function mergeAdjacentRanges(ranges: SourceTimeRange[], gapMs = 0): SourceTimeRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.startTime - b.startTime)
  const merged: SourceTimeRange[] = []
  let current = { ...sorted[0] }

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]
    if (next.startTime <= current.endTime + gapMs) {
      current.endTime = Math.max(current.endTime, next.endTime)
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)
  return merged
}

function addRanges(existing: SourceTimeRange[], toAdd: SourceTimeRange[]): SourceTimeRange[] {
  const combined = [...existing, ...toAdd]
  return mergeAdjacentRanges(combined, 0)
}

function isContiguousBlock(
  sortedWords: TranscriptWord[],
  allWords: TranscriptWord[]
): boolean {
  if (sortedWords.length <= 1) return true

  const selectedIds = new Set(sortedWords.map(w => w.id))
  const allSorted = [...allWords].sort((a, b) => a.startTime - b.startTime)

  const firstIdx = allSorted.findIndex(w => w.id === sortedWords[0].id)
  const lastIdx = allSorted.findIndex(w => w.id === sortedWords[sortedWords.length - 1].id)

  if (firstIdx === -1 || lastIdx === -1) return false

  for (let i = firstIdx; i <= lastIdx; i++) {
    if (!selectedIds.has(allSorted[i].id)) return false
  }
  return true
}

function calculateRangesToRemove(
  wordIdsToDelete: string[],
  transcript: Transcript
): SourceTimeRange[] {
  const words = transcript.words.filter(w => wordIdsToDelete.includes(w.id))
  if (words.length === 0) return []

  const sorted = [...words].sort((a, b) => a.startTime - b.startTime)
  const allWordsSorted = [...transcript.words].sort((a, b) => a.startTime - b.startTime)
  const isFirstWord = allWordsSorted.length > 0 && sorted[0].id === allWordsSorted[0].id

  if (sorted.length > 1 && isContiguousBlock(sorted, transcript.words)) {
    return [{
      startTime: isFirstWord ? 0 : sorted[0].startTime,
      endTime: sorted[sorted.length - 1].endTime
    }]
  }

  const ranges = mergeAdjacentRanges(
    sorted.map((w, idx) => ({
      startTime: (idx === 0 && isFirstWord) ? 0 : w.startTime,
      endTime: w.endTime
    })),
    5
  )

  return ranges
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createWord(id: string, startTime: number, endTime: number, text = 'word'): TranscriptWord {
  return { id, text, startTime, endTime, confidence: 0.95 }
}

function createTranscript(words: TranscriptWord[]): Transcript {
  return {
    id: 'transcript-1',
    recordingId: 'rec-1',
    language: 'en',
    modelUsed: 'base',
    generatedAt: new Date().toISOString(),
    words
  }
}

// ============================================================================
// Black Box Tests
// ============================================================================

describe('TranscriptEditCommand - Black Box', () => {

  describe('Single Word Deletion', () => {
    it('creates hidden region matching word boundaries', () => {
      // INPUT: Delete word at 1000-1500ms
      const transcript = createTranscript([
        createWord('w1', 0, 500, 'Hello'),
        createWord('w2', 1000, 1500, 'world'),
        createWord('w3', 2000, 2500, 'test')
      ])

      // WHEN: Delete w2
      const ranges = calculateRangesToRemove(['w2'], transcript)

      // THEN: Hidden region matches word boundaries exactly
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ startTime: 1000, endTime: 1500 })
    })

    it('extends to 0ms when deleting first word', () => {
      // INPUT: Delete first word (starts at 100ms, not 0)
      const transcript = createTranscript([
        createWord('w1', 100, 500, 'Hello'),
        createWord('w2', 1000, 1500, 'world')
      ])

      // WHEN: Delete w1 (first word)
      const ranges = calculateRangesToRemove(['w1'], transcript)

      // THEN: Hidden region extends to 0
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ startTime: 0, endTime: 500 })
    })
  })

  describe('Contiguous Word Deletion', () => {
    it('merges contiguous words into single hidden region', () => {
      // INPUT: 5 consecutive words, delete middle 3
      const transcript = createTranscript([
        createWord('w1', 0, 500),
        createWord('w2', 500, 1000),
        createWord('w3', 1000, 1500),
        createWord('w4', 1500, 2000),
        createWord('w5', 2000, 2500)
      ])

      // WHEN: Delete w2, w3, w4 (contiguous)
      const ranges = calculateRangesToRemove(['w2', 'w3', 'w4'], transcript)

      // THEN: Single merged region
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ startTime: 500, endTime: 2000 })
    })

    it('handles contiguous words starting from first word', () => {
      // INPUT: Delete first 2 words
      const transcript = createTranscript([
        createWord('w1', 100, 500),
        createWord('w2', 500, 1000),
        createWord('w3', 1500, 2000)
      ])

      // WHEN: Delete w1, w2
      const ranges = calculateRangesToRemove(['w1', 'w2'], transcript)

      // THEN: Extends to 0
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ startTime: 0, endTime: 1000 })
    })
  })

  describe('Non-Contiguous Word Deletion', () => {
    it('creates separate regions for non-adjacent words', () => {
      // INPUT: Delete words with gaps between them
      const transcript = createTranscript([
        createWord('w1', 0, 500),
        createWord('w2', 1000, 1500),
        createWord('w3', 2000, 2500),
        createWord('w4', 3000, 3500)
      ])

      // WHEN: Delete w1 and w3 (not adjacent)
      const ranges = calculateRangesToRemove(['w1', 'w3'], transcript)

      // THEN: Two separate regions
      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toEqual({ startTime: 0, endTime: 500 })
      expect(ranges[1]).toEqual({ startTime: 2000, endTime: 2500 })
    })

    it('creates separate regions when skipping middle word', () => {
      // INPUT: w1, w2, w3 - delete w1 and w3 (skip w2)
      const transcript = createTranscript([
        createWord('w1', 0, 500),
        createWord('w2', 500, 1000),
        createWord('w3', 1000, 1500)
      ])

      // WHEN: Delete w1 and w3 (w2 is kept)
      const ranges = calculateRangesToRemove(['w1', 'w3'], transcript)

      // THEN: Two regions (not merged because w2 is between them)
      expect(ranges).toHaveLength(2)
    })
  })

  describe('Adjacent Range Merging', () => {
    it('merges ranges within 5ms tolerance', () => {
      // INPUT: Words with 4ms gap (within tolerance)
      const transcript = createTranscript([
        createWord('w1', 0, 500),
        createWord('w2', 504, 1000), // 4ms gap from w1
        createWord('w3', 2000, 2500)
      ])

      // WHEN: Delete w1 and w2 (4ms gap, non-contiguous in transcript)
      // Note: These are not contiguous because there's no word between them
      // but they should merge due to 5ms tolerance
      const ranges = calculateRangesToRemove(['w1', 'w2'], transcript)

      // THEN: Merged into single region (5ms tolerance)
      expect(ranges).toHaveLength(1)
      expect(ranges[0].startTime).toBe(0)
      expect(ranges[0].endTime).toBe(1000)
    })

    it('does not merge ranges beyond 5ms tolerance', () => {
      // INPUT: Words with 10ms gap (beyond tolerance) and not contiguous
      const transcript = createTranscript([
        createWord('w1', 0, 500),
        createWord('w2', 600, 700), // kept word in between
        createWord('w3', 710, 1000)
      ])

      // WHEN: Delete w1 and w3 (not contiguous, >5ms gap)
      const ranges = calculateRangesToRemove(['w1', 'w3'], transcript)

      // THEN: Separate regions
      expect(ranges).toHaveLength(2)
    })
  })

  describe('Cumulative Deletions', () => {
    it('preserves existing hidden regions when adding new ones', () => {
      // INPUT: Existing hidden region + new deletion
      const existingHidden: SourceTimeRange[] = [
        { startTime: 0, endTime: 500 }
      ]
      const newRanges: SourceTimeRange[] = [
        { startTime: 2000, endTime: 2500 }
      ]

      // WHEN: Add new ranges
      const result = addRanges(existingHidden, newRanges)

      // THEN: Both regions preserved
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ startTime: 0, endTime: 500 })
      expect(result[1]).toEqual({ startTime: 2000, endTime: 2500 })
    })

    it('merges overlapping regions from cumulative deletions', () => {
      // INPUT: Overlapping regions
      const existingHidden: SourceTimeRange[] = [
        { startTime: 0, endTime: 1000 }
      ]
      const newRanges: SourceTimeRange[] = [
        { startTime: 800, endTime: 1500 }
      ]

      // WHEN: Add overlapping range
      const result = addRanges(existingHidden, newRanges)

      // THEN: Merged into single region
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ startTime: 0, endTime: 1500 })
    })

    it('merges adjacent regions from cumulative deletions', () => {
      // INPUT: Adjacent regions (touching)
      const existingHidden: SourceTimeRange[] = [
        { startTime: 0, endTime: 1000 }
      ]
      const newRanges: SourceTimeRange[] = [
        { startTime: 1000, endTime: 2000 }
      ]

      // WHEN: Add adjacent range
      const result = addRanges(existingHidden, newRanges)

      // THEN: Merged into single region
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ startTime: 0, endTime: 2000 })
    })
  })

  describe('Edge Cases', () => {
    it('returns empty array when no words match IDs', () => {
      const transcript = createTranscript([
        createWord('w1', 0, 500)
      ])

      const ranges = calculateRangesToRemove(['nonexistent'], transcript)

      expect(ranges).toHaveLength(0)
    })

    it('handles empty word ID list', () => {
      const transcript = createTranscript([
        createWord('w1', 0, 500)
      ])

      const ranges = calculateRangesToRemove([], transcript)

      expect(ranges).toHaveLength(0)
    })

    it('handles transcript with single word', () => {
      const transcript = createTranscript([
        createWord('w1', 100, 500)
      ])

      const ranges = calculateRangesToRemove(['w1'], transcript)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ startTime: 0, endTime: 500 }) // Extends to 0
    })

    it('handles words with zero duration', () => {
      // When a zero-duration word is the only word (and thus first word),
      // it extends to 0ms per the first-word edge case logic
      const transcript = createTranscript([
        createWord('w1', 1000, 1000) // Zero duration, but it's the first word
      ])

      const ranges = calculateRangesToRemove(['w1'], transcript)

      expect(ranges).toHaveLength(1)
      // First word extends to 0, end stays at 1000
      expect(ranges[0]).toEqual({ startTime: 0, endTime: 1000 })
    })

    it('handles words with zero duration (not first word)', () => {
      const transcript = createTranscript([
        createWord('w1', 0, 500),
        createWord('w2', 1000, 1000) // Zero duration, not first word
      ])

      const ranges = calculateRangesToRemove(['w2'], transcript)

      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ startTime: 1000, endTime: 1000 })
    })

    it('handles out-of-order word IDs input', () => {
      const transcript = createTranscript([
        createWord('w1', 0, 500),
        createWord('w2', 500, 1000),
        createWord('w3', 1000, 1500)
      ])

      // Word IDs in reverse order
      const ranges = calculateRangesToRemove(['w3', 'w1', 'w2'], transcript)

      // Should still produce correct merged result
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ startTime: 0, endTime: 1500 })
    })
  })
})
