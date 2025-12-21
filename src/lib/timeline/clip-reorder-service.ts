import type { Clip, Track, Project } from '@/types/project'
import { ClipPositioning } from './clip-positioning'

export interface ReorderTarget {
  /** The index where the clip should be inserted */
  insertIndex: number
  /** The clip ID that will be after the reordered clip, or null if at end */
  insertBeforeClipId: string | null
}

export interface SnapResult {
  /** The snapped timeline position in ms */
  position: number
  /** The index this position corresponds to */
  index: number
}

/**
 * Service for clip reordering operations.
 *
 * Design principle: Array order IS the source of truth.
 * startTime values are DERIVED from array order via reflowClips.
 *
 * This service consolidates reorder logic that was previously scattered across:
 * - timeline-clip.tsx (drag handler)
 * - project-store.ts (reorderClip action)
 * - clip-positioning.ts (getReorderTarget)
 */
export class ClipReorderService {

  /**
   * Compute valid snap positions for a contiguous timeline.
   * These are the positions where a clip can be inserted.
   *
   * For a timeline with clips [A(1000ms), B(2000ms), C(500ms)]:
   * Returns [0, 1000, 3000, 3500] - the boundaries between clips
   */
  static computeSnapPositions(clips: Clip[], excludeClipId: string): number[] {
    const positions: number[] = [0]
    let runningTime = 0

    const sortedOthers = clips
      .filter(c => c.id !== excludeClipId)
      .sort((a, b) => a.startTime - b.startTime)

    for (const clip of sortedOthers) {
      runningTime += clip.duration
      positions.push(runningTime)
    }

    return positions
  }

  /**
   * Find the nearest snap position to a given timeline position.
   * Used during drag to snap the clip to valid positions.
   */
  static findNearestSnapPosition(
    proposedTimeMs: number,
    snapPositions: number[]
  ): SnapResult {
    if (snapPositions.length === 0) {
      return { position: 0, index: 0 }
    }

    let nearestIndex = 0
    let minDistance = Math.abs(proposedTimeMs - snapPositions[0])

    for (let i = 1; i < snapPositions.length; i++) {
      const dist = Math.abs(proposedTimeMs - snapPositions[i])
      if (dist < minDistance) {
        minDistance = dist
        nearestIndex = i
      }
    }

    return {
      position: snapPositions[nearestIndex],
      index: nearestIndex
    }
  }

  /**
   * Compute the target insertion index based on a proposed timeline position.
   * Delegates to ClipPositioning.getReorderTarget for the actual calculation.
   */
  static computeTargetIndex(
    proposedTimelineMs: number,
    clips: Clip[],
    excludeClipId: string
  ): ReorderTarget {
    const result = ClipPositioning.getReorderTarget(
      proposedTimelineMs,
      clips,
      excludeClipId
    )
    return {
      insertIndex: result.insertIndex,
      insertBeforeClipId: result.insertBeforeClipId
    }
  }

  /**
   * Get the current index of a clip in the timeline.
   * Clips are ordered by startTime.
   */
  static getCurrentIndex(clips: Clip[], clipId: string): number {
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime)
    return sorted.findIndex(c => c.id === clipId)
  }

  /**
   * Check if a reorder operation would actually change anything.
   */
  static wouldChangeOrder(
    clips: Clip[],
    clipId: string,
    newIndex: number
  ): boolean {
    const currentIndex = this.getCurrentIndex(clips, clipId)
    return currentIndex !== -1 && currentIndex !== newIndex
  }
}
