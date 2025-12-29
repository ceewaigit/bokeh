import { TimelineConfig } from '@/features/timeline/config'
import { TimeConverter } from '@/features/timeline/time/time-space-converter'
import { findNearestAvailableStart } from './nearest-gap'

export interface TimelineBlockRange {
  id: string
  startTime: number
  endTime: number
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
