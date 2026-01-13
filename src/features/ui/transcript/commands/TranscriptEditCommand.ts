import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { Transcript, SourceTimeRange } from '@/types/project'
import { PatchedCommand } from '@/features/core/commands'
import type { CommandContext } from '@/features/core/commands'
import { markProjectModified } from '@/features/core/stores/store-utils'

/**
 * Merge adjacent or overlapping ranges with optional gap tolerance.
 */
function mergeAdjacentRanges(
  ranges: SourceTimeRange[],
  gapMs = 0
): SourceTimeRange[] {
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

/**
 * Add new hidden ranges to existing ranges and merge overlapping.
 */
function addRanges(
  existing: SourceTimeRange[],
  toAdd: SourceTimeRange[]
): SourceTimeRange[] {
  const combined = [...existing, ...toAdd]
  return mergeAdjacentRanges(combined, 0)
}

/**
 * Migrate legacy keptRegions format to hiddenRegions.
 */
function migrateKeptToHidden(
  keptRegions: SourceTimeRange[],
  duration: number
): SourceTimeRange[] {
  if (duration <= 0) return []
  if (keptRegions.length === 0) return [{ startTime: 0, endTime: duration }]

  const sorted = mergeAdjacentRanges(keptRegions, 0)
  const hidden: SourceTimeRange[] = []
  let cursor = 0

  for (const region of sorted) {
    if (cursor < region.startTime) {
      hidden.push({ startTime: cursor, endTime: region.startTime })
    }
    cursor = Math.max(cursor, region.endTime)
  }

  if (cursor < duration) {
    hidden.push({ startTime: cursor, endTime: duration })
  }

  return hidden
}

export class TranscriptEditCommand extends PatchedCommand<void> {
  constructor(
    context: CommandContext,
    private recordingId: string,
    private wordIdsToDelete: string[],
    private transcript: Transcript
  ) {
    super(context, {
      name: 'TranscriptEdit',
      description: `Delete ${wordIdsToDelete.length} words`,
      category: 'transcript'
    })
  }

  canExecute(): boolean {
    const project = this.context.getStore().currentProject
    if (!project) return false
    const recording = project.recordings.find(r => r.id === this.recordingId)
    if (!recording) return false
    return this.wordIdsToDelete.length > 0
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) return

    const timeline = draft.currentProject.timeline
    if (!timeline.transcriptEdits) {
      timeline.transcriptEdits = {}
    }

    let editState = timeline.transcriptEdits[this.recordingId]
    if (!editState) {
      editState = {
        hiddenRegions: [],
        originalWordCount: this.transcript.words.length
      }
      timeline.transcriptEdits[this.recordingId] = editState
    }

    if (!editState.hiddenRegions?.length && editState.keptRegions?.length) {
      const recording = draft.currentProject.recordings.find(
        r => r.id === this.recordingId
      )
      editState.hiddenRegions = migrateKeptToHidden(
        editState.keptRegions,
        recording?.duration ?? 0
      )
      editState.keptRegions = undefined
    }

    const rangesToRemove = this.calculateRangesToRemove()
    const newHiddenRegions = addRanges(editState.hiddenRegions ?? [], rangesToRemove)
    editState.hiddenRegions = newHiddenRegions
    markProjectModified(draft)
  }

  private calculateRangesToRemove() {
    // NO BUFFER: Use exact word boundaries to prevent hiding adjacent words
    const words = this.transcript.words.filter(
      w => this.wordIdsToDelete.includes(w.id)
    )
    if (words.length === 0) return []

    // Sort words by start time
    const sorted = [...words].sort((a, b) => a.startTime - b.startTime)

    // Get full transcript sorted by time for edge detection
    const allWordsSorted = [...this.transcript.words].sort((a, b) => a.startTime - b.startTime)
    const isFirstWord = allWordsSorted.length > 0 && sorted[0].id === allWordsSorted[0].id

    // If words form a contiguous block, use single range
    if (sorted.length > 1 && this.isContiguousBlock(sorted)) {
      return [{
        // EDGE HANDLING: If first word in transcript, extend to 0
        startTime: isFirstWord ? 0 : sorted[0].startTime,
        endTime: sorted[sorted.length - 1].endTime
      }]
    }

    // Single word or non-contiguous - merge with small tolerance
    const ranges = mergeAdjacentRanges(
      sorted.map((w, idx) => ({
        // EDGE HANDLING: First word in selection that is also first in transcript - extend to 0
        startTime: (idx === 0 && isFirstWord) ? 0 : w.startTime,
        endTime: w.endTime
      })),
      5 // 5ms tolerance for merging adjacent words only
    )

    return ranges
  }

  /**
   * Check if the selected words form a contiguous block in the transcript.
   * Words are contiguous if there are no unselected words between them.
   */
  private isContiguousBlock(sortedWords: typeof this.transcript.words): boolean {
    if (sortedWords.length <= 1) return true

    const selectedIds = new Set(sortedWords.map(w => w.id))
    const allWords = [...this.transcript.words].sort((a, b) => a.startTime - b.startTime)

    // Find index range in full transcript
    const firstIdx = allWords.findIndex(w => w.id === sortedWords[0].id)
    const lastIdx = allWords.findIndex(w => w.id === sortedWords[sortedWords.length - 1].id)

    if (firstIdx === -1 || lastIdx === -1) return false

    // Check if all words between first and last are in our selection
    for (let i = firstIdx; i <= lastIdx; i++) {
      if (!selectedIds.has(allWords[i].id)) {
        return false
      }
    }
    return true
  }
}
