/**
 * Synthetic mouse event generator for cursor return animations.
 * Creates smooth cursor animation over static image clips.
 */

import type { MouseEvent } from '@/types/project'
import { easeOutCubic } from '@/lib/effects/utils/cursor-calculator'

export interface CursorReturnConfig {
  startPosition: { x: number; y: number }
  endPosition: { x: number; y: number }
  durationMs: number
  screenWidth: number
  screenHeight: number
  captureWidth: number
  captureHeight: number
  cursorType?: string
  sampleRate?: number
}

/**
 * Generate synthetic mouse events for a cursor return animation.
 * Animates from startPosition to endPosition over durationMs.
 */
export function generateCursorReturnEvents(config: CursorReturnConfig): MouseEvent[] {
  const {
    startPosition,
    endPosition,
    durationMs,
    screenWidth,
    screenHeight,
    captureWidth,
    captureHeight,
    cursorType = 'default',
    sampleRate = 60
  } = config

  const sampleCount = Math.max(2, Math.ceil((durationMs / 1000) * sampleRate))
  const events: MouseEvent[] = []

  for (let i = 0; i <= sampleCount; i++) {
    const progress = i / sampleCount
    const easedProgress = easeOutCubic(progress)

    events.push({
      timestamp: progress * durationMs,
      x: startPosition.x + (endPosition.x - startPosition.x) * easedProgress,
      y: startPosition.y + (endPosition.y - startPosition.y) * easedProgress,
      screenWidth,
      screenHeight,
      captureWidth,
      captureHeight,
      cursorType
    })
  }

  return events
}

import { interpolateMousePosition } from '@/lib/effects/utils/mouse-interpolation'

/**
 * Generate cursor return events from source clip's mouse metadata.
 * Extracts first/last positions using interpolation for frame-perfect alignment.
 */
export function generateCursorReturnFromSource(
  sourceEvents: MouseEvent[],
  startTime: number,
  endTime: number,
  durationMs: number
): MouseEvent[] | null {
  if (!sourceEvents?.length) return null

  // Interpolate precise start and end positions
  // Start position = cursor position at the END of the source clip (where we just were)
  const startPos = interpolateMousePosition(sourceEvents, endTime)
  // End position = cursor position at the START of the source clip (where we want to return to)
  const endPos = interpolateMousePosition(sourceEvents, startTime)

  if (!startPos || !endPos) return null

  // Get reference dimensions from a nearby event
  const refEvent = sourceEvents.find(e => e.timestamp >= startTime) || sourceEvents[0]

  return generateCursorReturnEvents({
    startPosition: startPos,
    endPosition: endPos,
    durationMs,
    screenWidth: refEvent.screenWidth,
    screenHeight: refEvent.screenHeight,
    captureWidth: refEvent.captureWidth || refEvent.screenWidth,
    captureHeight: refEvent.captureHeight || refEvent.screenHeight,
    cursorType: refEvent.cursorType || 'default'
  })
}
