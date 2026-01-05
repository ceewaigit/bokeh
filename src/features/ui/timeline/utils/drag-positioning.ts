import { TimelineConfig } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { findNearestAvailableStart } from './nearest-gap'
import { TimelineBlockRange } from '@/types/project'
import type { Clip } from '@/types/project'

export type { TimelineBlockRange }

/**
 * Convert clips to generic TimelineBlockRange format
 */
export function clipsToBlocks(clips: Clip[]): TimelineBlockRange[] {
  return clips.map(c => ({
    id: c.id,
    startTime: c.startTime,
    endTime: c.startTime + c.duration
  }))
}

export function getSnappedDragX(options: {
  proposedX: number
  blockWidth: number
  blocks: TimelineBlockRange[]
  pixelsPerMs: number
  trackLabelWidth?: number
  snapThresholdPx?: number
  excludeId?: string
}): number {
  const trackLabelWidth = options.trackLabelWidth ?? TimelineConfig.TRACK_LABEL_WIDTH
  const snapThresholdPx = options.snapThresholdPx ?? TimelineConfig.SNAP_THRESHOLD_PX
  const proposedX = options.proposedX
  const blockWidth = options.blockWidth

  const blocks = options.blocks
    .filter(block => block.id !== options.excludeId)
    .map(block => ({
      x: TimeConverter.msToPixels(block.startTime, options.pixelsPerMs) + trackLabelWidth,
      endX: TimeConverter.msToPixels(block.endTime, options.pixelsPerMs) + trackLabelWidth
    }))
    .sort((a, b) => a.x - b.x)

  let bestSnapX = proposedX
  let minSnapDistance = snapThresholdPx

  for (const block of blocks) {
    const leftToLeftDistance = Math.abs(proposedX - block.x)
    if (leftToLeftDistance < minSnapDistance) {
      minSnapDistance = leftToLeftDistance
      bestSnapX = block.x
    }

    const leftToRightDistance = Math.abs(proposedX - block.endX)
    if (leftToRightDistance < minSnapDistance) {
      minSnapDistance = leftToRightDistance
      bestSnapX = block.endX
    }

    const rightToLeftDistance = Math.abs((proposedX + blockWidth) - block.x)
    if (rightToLeftDistance < minSnapDistance) {
      minSnapDistance = rightToLeftDistance
      bestSnapX = block.x - blockWidth
    }

    const rightToRightDistance = Math.abs((proposedX + blockWidth) - block.endX)
    if (rightToRightDistance < minSnapDistance) {
      minSnapDistance = rightToRightDistance
      bestSnapX = block.endX - blockWidth
    }
  }

  return Math.max(trackLabelWidth, bestSnapX)
}

export function getNearestAvailableDragX(options: {
  proposedX: number
  blockWidthPx: number
  durationMs: number
  blocks: TimelineBlockRange[]
  pixelsPerMs: number
  trackLabelWidth?: number
  snapThresholdPx?: number
  excludeId?: string
}): number {
  const trackLabelWidth = options.trackLabelWidth ?? TimelineConfig.TRACK_LABEL_WIDTH
  const snappedX = getSnappedDragX({
    proposedX: options.proposedX,
    blockWidth: options.blockWidthPx,
    blocks: options.blocks,
    pixelsPerMs: options.pixelsPerMs,
    trackLabelWidth,
    snapThresholdPx: options.snapThresholdPx,
    excludeId: options.excludeId
  })

  const proposedStart = TimeConverter.pixelsToMs(snappedX - trackLabelWidth, options.pixelsPerMs)
  const occupied = options.blocks
    .filter(block => block.id !== options.excludeId)
    .map(block => ({ startTime: block.startTime, endTime: block.endTime }))

  const nearestStart = findNearestAvailableStart(proposedStart, options.durationMs, occupied)
  return TimeConverter.msToPixels(nearestStart, options.pixelsPerMs) + trackLabelWidth
}

export function hasOverlap(options: {
  proposedStartTime: number
  proposedEndTime: number
  blocks: TimelineBlockRange[]
  excludeId?: string
}): boolean {
  return options.blocks
    .filter(block => block.id !== options.excludeId)
    .some(block => options.proposedStartTime < block.endTime && options.proposedEndTime > block.startTime)
}

/**
 * Validates a proposed position for a timeline block, checking for overlaps and validity.
 * Returns the final valid position (or suggested one).
 */
export interface PositionValidation {
  isValid: boolean
  finalPosition: number
  suggestedPosition?: number
  reason?: string
}

export function validatePosition(
  proposedTime: number,
  duration: number,
  blocks: TimelineBlockRange[],
  excludeId?: string,
  options: {
    allowOverlap?: boolean
    enforceLeftmostConstraint?: boolean
    findAlternativeIfInvalid?: boolean
  } = {}
): PositionValidation {
  let finalTime = proposedTime

  // Enforce leftmost constraint if requested
  if (options.enforceLeftmostConstraint) {
    const minAllowedTime = getLeftmostBlockEnd(blocks, excludeId)
    if (finalTime < minAllowedTime) {
      if (options.findAlternativeIfInvalid) {
        finalTime = minAllowedTime
      } else {
        return {
          isValid: false,
          finalPosition: finalTime,
          suggestedPosition: minAllowedTime,
          reason: `Must be positioned after leftmost item`
        }
      }
    }
  }

  // Check for overlaps unless explicitly allowed
  if (!options.allowOverlap) {
    const hasCollision = hasOverlap({
      proposedStartTime: finalTime,
      proposedEndTime: finalTime + duration,
      blocks,
      excludeId
    })

    if (hasCollision) {
      const validPosition = findNextValidPosition(
        finalTime,
        duration,
        blocks,
        excludeId
      )

      return {
        isValid: false,
        finalPosition: finalTime,
        suggestedPosition: validPosition,
        reason: 'Would overlap with existing items'
      }
    }
  }

  return {
    isValid: true,
    finalPosition: finalTime
  }
}

/**
 * Find the nearest valid position for a block (no overlaps)
 */
export function findNextValidPosition(
  desiredStart: number,
  duration: number,
  blocks: TimelineBlockRange[],
  excludeId?: string
): number {
  const occupied = blocks
    .filter(block => !excludeId || block.id !== excludeId)
    .map(block => ({ startTime: block.startTime, endTime: block.endTime }))

  return findNearestAvailableStart(desiredStart, duration, occupied)
}

/**
 * Get the end position of the leftmost block
 */
export function getLeftmostBlockEnd(blocks: TimelineBlockRange[], excludeId?: string): number {
  const filtered = blocks.filter(b => !excludeId || b.id !== excludeId)
  if (filtered.length === 0) return 0

  const leftmost = filtered.reduce((left, current) => {
    if (!left || current.startTime < left.startTime) {
      return current
    }
    return left
  }, null as TimelineBlockRange | null)

  return leftmost ? leftmost.endTime : 0
}

// ============================================================================
// CONTIGUOUS TIMELINE FUNCTIONS
// For timelines where items must be adjacent with no gaps (e.g., video track)
// ============================================================================

export interface ContiguousPreviewResult {
  startTimes: Record<string, number>
  insertIndex: number
  insertTime: number
}

/**
 * Compute valid snap positions for a contiguous timeline.
 * These are the positions where an item can be inserted.
 * For a timeline with items [A(1000ms), B(2000ms), C(500ms)]:
 * Returns [0, 1000, 3000, 3500] - the boundaries between items
 */
export function computeContiguousSnapPositions(
  blocks: TimelineBlockRange[],
  excludeId?: string
): number[] {
  const positions: number[] = [0]
  let runningTime = 0

  const orderedOthers = blocks.filter(b => !excludeId || b.id !== excludeId)

  for (const block of orderedOthers) {
    const duration = block.endTime - block.startTime
    runningTime += duration
    positions.push(runningTime)
  }

  return positions
}

/**
 * Find the nearest snap position to a given timeline position.
 * Used during drag to snap to valid positions.
 */
export function findNearestContiguousSnap(
  proposedTimeMs: number,
  snapPositions: number[]
): { position: number; index: number } {
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
 * Get reorder target - determines where an item should be inserted based on drag position
 * Used for contiguous timeline where items cannot have gaps
 */
export function getReorderTarget(
  proposedTime: number,
  blocks: TimelineBlockRange[],
  excludeId?: string
): { insertBeforeId: string | null; insertIndex: number } {
  const ordered = blocks.filter(b => !excludeId || b.id !== excludeId)
  let runningTime = 0

  // Find insertion point based on contiguous layout midpoints.
  for (let i = 0; i < ordered.length; i++) {
    const block = ordered[i]
    const duration = block.endTime - block.startTime
    const midpoint = runningTime + duration / 2
    if (proposedTime < midpoint) {
      return { insertBeforeId: block.id, insertIndex: i }
    }
    runningTime += duration
  }

  return { insertBeforeId: null, insertIndex: ordered.length }
}

/**
 * Compute a contiguous preview layout for a proposed insert/move.
 * Returns startTimes for all existing items (excluding the dragged one),
 * plus the insertion index and timeline time for the preview item.
 */
export function computeContiguousPreview(
  blocks: TimelineBlockRange[],
  proposedTime: number,
  previewDuration: number,
  excludeId?: string
): ContiguousPreviewResult {
  const target = getReorderTarget(proposedTime, blocks, excludeId)
  const ordered = blocks.filter(b => !excludeId || b.id !== excludeId)

  const startTimes: Record<string, number> = {}
  let runningTime = 0
  let insertTime = 0

  // Compute positions with preview item inserted
  for (let i = 0; i < ordered.length; i++) {
    if (i === target.insertIndex) {
      insertTime = runningTime
      runningTime += previewDuration
    }
    startTimes[ordered[i].id] = runningTime
    runningTime += ordered[i].endTime - ordered[i].startTime
  }

  // If inserting at end
  if (target.insertIndex >= ordered.length) {
    insertTime = runningTime
  }

  return {
    startTimes,
    insertIndex: target.insertIndex,
    insertTime
  }
}
