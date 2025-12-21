import type { MouseEvent } from '@/types/project'

/**
 * Binary search to find the index of the last event with timestamp <= timeMs
 * Returns -1 if all events are after timeMs
 */
function binarySearchEvents(mouseEvents: MouseEvent[], timeMs: number): number {
  let low = 0
  let high = mouseEvents.length - 1
  let result = -1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (mouseEvents[mid].timestamp <= timeMs) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

/**
 * Catmull-Rom spline interpolation for smooth mouse movement
 * Uses O(log n) binary search for performance with large event arrays
 */
export function interpolateMousePosition(
  mouseEvents: MouseEvent[],
  timeMs: number
): { x: number; y: number } | null {
  if (!mouseEvents || mouseEvents.length === 0) {
    return null
  }

  // Edge cases
  if (timeMs <= mouseEvents[0].timestamp) {
    return { x: mouseEvents[0].x, y: mouseEvents[0].y }
  }
  if (timeMs >= mouseEvents[mouseEvents.length - 1].timestamp) {
    const last = mouseEvents[mouseEvents.length - 1]
    return { x: last.x, y: last.y }
  }

  // If we have very few points, use simple interpolation
  if (mouseEvents.length < 4) {
    return simpleInterpolate(mouseEvents, timeMs)
  }

  // PERFORMANCE FIX: Use binary search instead of linear scan
  // O(log n) instead of O(n) - critical for 13,000+ events
  const i = binarySearchEvents(mouseEvents, timeMs)

  // Ensure we have a valid segment (i should point to event before timeMs)
  if (i < 0 || i >= mouseEvents.length - 1) {
    return simpleInterpolate(mouseEvents, timeMs)
  }

  const p0 = mouseEvents[Math.max(0, i - 1)]
  const p1 = mouseEvents[i]
  const p2 = mouseEvents[Math.min(mouseEvents.length - 1, i + 1)]
  const p3 = mouseEvents[Math.min(mouseEvents.length - 1, i + 2)]

  const segmentDuration = p2.timestamp - p1.timestamp
  // Extremely small/zero segment durations can cause splines to behave poorly.
  if (segmentDuration < 1) {
    return simpleInterpolate(mouseEvents, timeMs)
  }

  // For very small movements (common when the cursor "stops" on high-DPI displays),
  // Catmull-Rom can introduce visible wiggle due to noise/quantization. Prefer simple interpolation.
  const segDx = p2.x - p1.x
  const segDy = p2.y - p1.y
  const segDist = Math.sqrt(segDx * segDx + segDy * segDy)
  if (segDist < 3) {
    return simpleInterpolate(mouseEvents, timeMs)
  }

  // If local direction reverses (noisy samples), splines can overshoot/oscillate.
  // Fall back to simple interpolation for stability.
  const v01x = p1.x - p0.x
  const v01y = p1.y - p0.y
  const v12x = p2.x - p1.x
  const v12y = p2.y - p1.y
  const dot = v01x * v12x + v01y * v12y
  if (dot < 0) {
    return simpleInterpolate(mouseEvents, timeMs)
  }

  const t = (timeMs - p1.timestamp) / segmentDuration

  // Catmull-Rom spline coefficients
  const t2 = t * t
  const t3 = t2 * t

  const v0x = (p2.x - p0.x) * 0.5
  const v1x = (p3.x - p1.x) * 0.5
  const xRaw = p1.x + v0x * t + (3 * (p2.x - p1.x) - 2 * v0x - v1x) * t2 + (2 * (p1.x - p2.x) + v0x + v1x) * t3

  const v0y = (p2.y - p0.y) * 0.5
  const v1y = (p3.y - p1.y) * 0.5
  const yRaw = p1.y + v0y * t + (3 * (p2.y - p1.y) - 2 * v0y - v1y) * t2 + (2 * (p1.y - p2.y) + v0y + v1y) * t3

  // Prevent overshoot that can manifest as visible "jitter" on quantized/noisy inputs.
  // Clamp to the segment bounding box between p1 and p2.
  const minX = Math.min(p1.x, p2.x)
  const maxX = Math.max(p1.x, p2.x)
  const minY = Math.min(p1.y, p2.y)
  const maxY = Math.max(p1.y, p2.y)

  const x = Math.max(minX, Math.min(maxX, xRaw))
  const y = Math.max(minY, Math.min(maxY, yRaw))

  return { x, y }
}

export function interpolateMousePositionNormalized(
  mouseEvents: MouseEvent[],
  timeMs: number
): { x: number; y: number } | null {
  const pos = interpolateMousePosition(mouseEvents, timeMs)
  if (!pos) return null

  // Prefer capture size if available; fallback to screen size; then to a sensible default
  const baseWidth = mouseEvents[0]?.captureWidth || mouseEvents[0]?.screenWidth || 1920
  const baseHeight = mouseEvents[0]?.captureHeight || mouseEvents[0]?.screenHeight || 1080

  if (!baseWidth || !baseHeight) return null

  return {
    x: Math.max(0, Math.min(1, pos.x / baseWidth)),
    y: Math.max(0, Math.min(1, pos.y / baseHeight))
  }
}

function simpleInterpolate(
  mouseEvents: MouseEvent[],
  timeMs: number
): { x: number; y: number } {
  let before: MouseEvent | null = null
  let after: MouseEvent | null = null

  for (let i = 0; i < mouseEvents.length; i++) {
    if (mouseEvents[i].timestamp <= timeMs) {
      before = mouseEvents[i]
    } else {
      after = mouseEvents[i]
      break
    }
  }

  if (!before) {
    const first = mouseEvents[0]
    return { x: first.x, y: first.y }
  }
  if (!after) {
    return { x: before.x, y: before.y }
  }

  const timeDiff = after.timestamp - before.timestamp
  if (timeDiff === 0) {
    return { x: before.x, y: before.y }
  }

  const t = (timeMs - before.timestamp) / timeDiff
  // Smoothstep easing for nicer motion
  const smoothT = t * t * (3 - 2 * t)

  return {
    x: before.x + (after.x - before.x) * smoothT,
    y: before.y + (after.y - before.y) * smoothT
  }
} 
