/**
 * Black Box Tests: Whisper Output Parsing
 *
 * Tests the word merging logic for Whisper transcription output.
 *
 * INPUT: Raw tokens/words from Whisper JSON output
 * OUTPUT: Merged word-level entries with timing and confidence
 *
 * Key behaviors tested:
 * - Space-prefixed tokens start new words
 * - Non-space tokens append to current word
 * - Confidence scores averaged across merged tokens
 * - Timing spans from first token start to last token end
 * - Special tokens [BLANK] filtered out
 * - Both old format (tokens) and new format (segments.words) supported
 */

import { describe, it, expect } from '@jest/globals'

// Pure function extraction of word merging logic
function mergeWords<T>(
  tokens: T[],
  accessor: (token: T) => { text: string; startTime: number; endTime: number; confidence: number } | null
): Array<{ text: string; startTime: number; endTime: number; confidence: number }> {
  const merged: Array<{ text: string; startTime: number; endTime: number; confidence: number }> = []
  let current: { text: string; startTime: number; endTime: number; confidenceSum: number; count: number } | null = null

  for (const token of tokens) {
    const extracted = accessor(token)
    if (!extracted) continue

    const { text: rawText, startTime, endTime, confidence } = extracted
    if (!rawText) continue
    if (rawText.startsWith('[') && rawText.endsWith(']')) continue

    const startsNewWord = rawText.startsWith(' ')
    const tokenText = startsNewWord ? rawText.trim() : rawText.trimStart()
    if (!tokenText) continue

    if (!current || startsNewWord) {
      if (current) {
        merged.push({
          text: current.text,
          startTime: current.startTime,
          endTime: current.endTime,
          confidence: current.count > 0 ? current.confidenceSum / current.count : 1
        })
      }
      current = {
        text: tokenText,
        startTime,
        endTime,
        confidenceSum: confidence,
        count: 1
      }
    } else {
      current.text += tokenText
      current.endTime = Math.max(current.endTime, endTime)
      current.confidenceSum += confidence
      current.count += 1
    }
  }

  if (current) {
    merged.push({
      text: current.text,
      startTime: current.startTime,
      endTime: current.endTime,
      confidence: current.count > 0 ? current.confidenceSum / current.count : 1
    })
  }

  return merged
}

// Old format accessor (v1.7.x): tokens with text/offsets/p
const tokenAccessor = (token: { text?: string; offsets?: { from?: number; to?: number }; p?: number }) => ({
  text: String(token.text ?? ''),
  startTime: Math.max(0, token.offsets?.from ?? 0),
  endTime: Math.max(0, token.offsets?.to ?? 0),
  confidence: Number(token.p ?? 1)
})

// New format accessor (v1.8+): words with word/start/end/probability (times in seconds)
const segmentWordAccessor = (token: { word?: string; start?: number; end?: number; probability?: number }) => ({
  text: String(token.word ?? ''),
  startTime: Math.max(0, Math.round((token.start ?? 0) * 1000)),
  endTime: Math.max(0, Math.round((token.end ?? 0) * 1000)),
  confidence: Number(token.probability ?? 1)
})

// ============================================================================
// Black Box Tests
// ============================================================================

describe('Whisper Output Parsing - Black Box', () => {

  describe('Old Format (v1.7.x tokens)', () => {

    it('parses single word from single token', () => {
      const tokens = [
        { text: ' Hello', offsets: { from: 0, to: 500 }, p: 0.95 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        text: 'Hello',
        startTime: 0,
        endTime: 500,
        confidence: 0.95
      })
    })

    it('merges multiple tokens into single word', () => {
      // "Hello" split into "Hel" + "lo"
      const tokens = [
        { text: ' Hel', offsets: { from: 0, to: 300 }, p: 0.9 },
        { text: 'lo', offsets: { from: 300, to: 500 }, p: 0.95 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('Hello')
      expect(result[0].startTime).toBe(0)
      expect(result[0].endTime).toBe(500)
      expect(result[0].confidence).toBeCloseTo(0.925) // Average of 0.9 and 0.95
    })

    it('splits on space-prefixed tokens', () => {
      const tokens = [
        { text: ' Hello', offsets: { from: 0, to: 500 }, p: 0.9 },
        { text: ' world', offsets: { from: 600, to: 1000 }, p: 0.95 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('Hello')
      expect(result[1].text).toBe('world')
    })

    it('handles complex sentence with multiple merges', () => {
      // "Hello world" with "world" split into "wor" + "ld"
      const tokens = [
        { text: ' Hello', offsets: { from: 0, to: 500 }, p: 0.9 },
        { text: ' wor', offsets: { from: 600, to: 800 }, p: 0.85 },
        { text: 'ld', offsets: { from: 800, to: 1000 }, p: 0.95 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('Hello')
      expect(result[1].text).toBe('world')
      expect(result[1].confidence).toBeCloseTo(0.9) // Average of 0.85 and 0.95
    })

    it('filters out special tokens [BLANK]', () => {
      const tokens = [
        { text: ' Hello', offsets: { from: 0, to: 500 }, p: 0.9 },
        { text: '[BLANK]', offsets: { from: 500, to: 600 }, p: 0.1 },
        { text: ' world', offsets: { from: 600, to: 1000 }, p: 0.95 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('Hello')
      expect(result[1].text).toBe('world')
    })

    it('handles empty text tokens', () => {
      const tokens = [
        { text: ' Hello', offsets: { from: 0, to: 500 }, p: 0.9 },
        { text: '', offsets: { from: 500, to: 600 }, p: 0.5 },
        { text: ' world', offsets: { from: 600, to: 1000 }, p: 0.95 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(2)
    })

    it('handles tokens with missing confidence', () => {
      const tokens = [
        { text: ' Hello', offsets: { from: 0, to: 500 } } // No p field
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(1)
      expect(result[0].confidence).toBe(1) // Default
    })

    it('handles tokens with missing offsets', () => {
      const tokens = [
        { text: ' Hello', p: 0.9 } // No offsets
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(1)
      expect(result[0].startTime).toBe(0)
      expect(result[0].endTime).toBe(0)
    })
  })

  describe('New Format (v1.8+ segments.words)', () => {

    it('parses words with times in seconds', () => {
      const words = [
        { word: ' Hello', start: 0, end: 0.5, probability: 0.95 }
      ]

      const result = mergeWords(words, segmentWordAccessor)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        text: 'Hello',
        startTime: 0,
        endTime: 500, // Converted to ms
        confidence: 0.95
      })
    })

    it('merges subword tokens in new format', () => {
      const words = [
        { word: ' Hel', start: 0, end: 0.3, probability: 0.9 },
        { word: 'lo', start: 0.3, end: 0.5, probability: 0.95 }
      ]

      const result = mergeWords(words, segmentWordAccessor)

      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('Hello')
      expect(result[0].startTime).toBe(0)
      expect(result[0].endTime).toBe(500)
    })

    it('parses multiple words', () => {
      const words = [
        { word: ' Hello', start: 0, end: 0.5, probability: 0.9 },
        { word: ' world', start: 0.6, end: 1.0, probability: 0.95 }
      ]

      const result = mergeWords(words, segmentWordAccessor)

      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('Hello')
      expect(result[0].endTime).toBe(500)
      expect(result[1].text).toBe('world')
      expect(result[1].startTime).toBe(600)
    })

    it('handles fractional seconds correctly', () => {
      const words = [
        { word: ' test', start: 1.234, end: 1.567, probability: 0.9 }
      ]

      const result = mergeWords(words, segmentWordAccessor)

      expect(result).toHaveLength(1)
      expect(result[0].startTime).toBe(1234)
      expect(result[0].endTime).toBe(1567)
    })
  })

  describe('Confidence Averaging', () => {

    it('averages confidence across merged tokens', () => {
      const tokens = [
        { text: ' te', offsets: { from: 0, to: 100 }, p: 0.8 },
        { text: 'st', offsets: { from: 100, to: 200 }, p: 0.9 },
        { text: 'ing', offsets: { from: 200, to: 300 }, p: 1.0 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('testing')
      expect(result[0].confidence).toBeCloseTo(0.9) // (0.8 + 0.9 + 1.0) / 3
    })

    it('handles single token confidence correctly', () => {
      const tokens = [
        { text: ' word', offsets: { from: 0, to: 500 }, p: 0.75 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result[0].confidence).toBe(0.75)
    })
  })

  describe('Timing Spans', () => {

    it('uses first token start and last token end', () => {
      const tokens = [
        { text: ' Hel', offsets: { from: 100, to: 200 }, p: 0.9 },
        { text: 'lo', offsets: { from: 200, to: 400 }, p: 0.9 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result[0].startTime).toBe(100)
      expect(result[0].endTime).toBe(400)
    })

    it('handles non-sequential token timing (takes max end)', () => {
      // Overlapping or out-of-order timings (edge case)
      const tokens = [
        { text: ' Hel', offsets: { from: 100, to: 300 }, p: 0.9 },
        { text: 'lo', offsets: { from: 200, to: 250 }, p: 0.9 } // Ends before previous
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result[0].startTime).toBe(100)
      expect(result[0].endTime).toBe(300) // Max of 300, 250
    })
  })

  describe('Edge Cases', () => {

    it('handles empty token array', () => {
      const result = mergeWords([], tokenAccessor)
      expect(result).toHaveLength(0)
    })

    it('handles all filtered tokens', () => {
      const tokens = [
        { text: '[BLANK]', offsets: { from: 0, to: 100 }, p: 0.1 },
        { text: '[NOISE]', offsets: { from: 100, to: 200 }, p: 0.1 }
      ]

      const result = mergeWords(tokens, tokenAccessor)
      expect(result).toHaveLength(0)
    })

    it('handles whitespace-only tokens', () => {
      const tokens = [
        { text: '   ', offsets: { from: 0, to: 100 }, p: 0.9 },
        { text: ' Hello', offsets: { from: 100, to: 500 }, p: 0.9 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('Hello')
    })

    it('handles token without leading space at start', () => {
      const tokens = [
        { text: 'Hello', offsets: { from: 0, to: 500 }, p: 0.9 } // No leading space
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('Hello')
    })

    it('handles negative timing values (clamps to 0)', () => {
      const tokens = [
        { text: ' Hello', offsets: { from: -100, to: 500 }, p: 0.9 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result[0].startTime).toBe(0) // Clamped
      expect(result[0].endTime).toBe(500)
    })

    it('handles punctuation attached to words', () => {
      const tokens = [
        { text: ' Hello', offsets: { from: 0, to: 500 }, p: 0.9 },
        { text: ',', offsets: { from: 500, to: 550 }, p: 0.95 },
        { text: ' world', offsets: { from: 600, to: 1000 }, p: 0.9 },
        { text: '!', offsets: { from: 1000, to: 1050 }, p: 0.95 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('Hello,')
      expect(result[1].text).toBe('world!')
    })

    it('handles contractions', () => {
      const tokens = [
        { text: " don", offsets: { from: 0, to: 300 }, p: 0.9 },
        { text: "'t", offsets: { from: 300, to: 500 }, p: 0.95 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(1)
      expect(result[0].text).toBe("don't")
    })
  })

  describe('Real-World Examples', () => {

    it('parses typical English sentence', () => {
      const tokens = [
        { text: ' The', offsets: { from: 0, to: 200 }, p: 0.98 },
        { text: ' quick', offsets: { from: 250, to: 500 }, p: 0.95 },
        { text: ' brown', offsets: { from: 550, to: 800 }, p: 0.92 },
        { text: ' fox', offsets: { from: 850, to: 1000 }, p: 0.97 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(4)
      expect(result.map(w => w.text)).toEqual(['The', 'quick', 'brown', 'fox'])
    })

    it('parses sentence with subword tokenization', () => {
      // "unfortunately" might be split into sub-tokens
      const tokens = [
        { text: ' un', offsets: { from: 0, to: 150 }, p: 0.85 },
        { text: 'for', offsets: { from: 150, to: 300 }, p: 0.88 },
        { text: 'tun', offsets: { from: 300, to: 450 }, p: 0.90 },
        { text: 'ately', offsets: { from: 450, to: 700 }, p: 0.92 },
        { text: ' this', offsets: { from: 800, to: 1000 }, p: 0.95 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('unfortunately')
      expect(result[1].text).toBe('this')
    })

    it('parses technical content with numbers', () => {
      const tokens = [
        { text: ' version', offsets: { from: 0, to: 400 }, p: 0.95 },
        { text: ' 2', offsets: { from: 450, to: 550 }, p: 0.98 },
        { text: '.', offsets: { from: 550, to: 600 }, p: 0.99 },
        { text: '0', offsets: { from: 600, to: 650 }, p: 0.98 }
      ]

      const result = mergeWords(tokens, tokenAccessor)

      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('version')
      expect(result[1].text).toBe('2.0')
    })
  })
})
