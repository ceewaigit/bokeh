import type { SourceTimeRange, TranscriptWord } from '@/types/project'

export function getVisibleSubtitleWords(words: TranscriptWord[], hiddenRegions: SourceTimeRange[]): TranscriptWord[] {
  if (words.length === 0 || hiddenRegions.length === 0) return words

  const isSourceTimeInHiddenRegion = (time: number): boolean => {
    for (const region of hiddenRegions) {
      if (time >= region.startTime && time < region.endTime) return true
    }
    return false
  }

  return words.filter(word =>
    !isSourceTimeInHiddenRegion(word.startTime) ||
    !isSourceTimeInHiddenRegion(word.endTime - 1)
  )
}

/**
 * Returns the current word index at `timeMs`, or a nearby fallback index that keeps
 * subtitles stable between words. Returns `-1` when subtitles should not render.
 *
 * This matches the behavior used by `SubtitleLayer`.
 */
export function findSubtitleWordIndex(words: TranscriptWord[], timeMs: number): number {
  if (words.length === 0) return -1

  let low = 0
  let high = words.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const word = words[mid]
    if (timeMs < word.startTime) {
      high = mid - 1
    } else if (timeMs >= word.endTime) {
      low = mid + 1
    } else {
      return mid
    }
  }

  if (low >= words.length) {
    return words.length - 1
  }
  if (low === 0) {
    if (words[0].startTime - timeMs < 500) return 0
    return -1
  }

  return low - 1
}

