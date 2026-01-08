import type { MouseEvent } from '@/types/project'
import { binarySearchEvents } from '@/features/rendering/canvas/math'

/**
 * Hermite spline interpolation for smooth, cinematic mouse movement.
 * 
 * This is a simplified, more elegant approach that:
 * - Uses tension-controlled tangents to prevent overshoot
 * - Naturally handles direction changes without harsh fallbacks
 * - Produces Apple-esque buttery smooth motion
 * 
 * Uses O(log n) binary search for performance with large event arrays.
 */
export function interpolateMousePosition(
  mouseEvents: MouseEvent[],
  timeMs: number
): { x: number; y: number } | null {
  if (!mouseEvents || mouseEvents.length === 0) {
    return null
  }

  // Edge cases - return exact positions at boundaries
  if (timeMs <= mouseEvents[0].timestamp) {
    return { x: mouseEvents[0].x, y: mouseEvents[0].y }
  }
  if (timeMs >= mouseEvents[mouseEvents.length - 1].timestamp) {
    const last = mouseEvents[mouseEvents.length - 1]
    return { x: last.x, y: last.y }
  }

  // Find segment via binary search - O(log n)
  const i = binarySearchEvents(mouseEvents, timeMs)
  if (i < 0 || i >= mouseEvents.length - 1) {
    return { x: mouseEvents[0].x, y: mouseEvents[0].y }
  }

  const p1 = mouseEvents[i]
  const p2 = mouseEvents[i + 1]

  const segmentDuration = p2.timestamp - p1.timestamp
  if (segmentDuration < 1) {
    return { x: p1.x, y: p1.y }
  }

  // Normalized time within segment [0, 1]
  const t = (timeMs - p1.timestamp) / segmentDuration

  // For just 2 points or at boundaries, use smoothstep interpolation
  if (mouseEvents.length < 3) {
    const smooth = t * t * (3 - 2 * t) // smoothstep
    return {
      x: p1.x + (p2.x - p1.x) * smooth,
      y: p1.y + (p2.y - p1.y) * smooth
    }
  }

  // Get neighboring points for tangent calculation
  const p0 = mouseEvents[Math.max(0, i - 1)]
  const p3 = mouseEvents[Math.min(mouseEvents.length - 1, i + 2)]

  // Calculate tangent vectors with adaptive tension
  // Tension reduces tangent magnitude when direction changes, preventing overshoot
  const tension = 0.5 // 0 = sharp corners, 1 = maximum smoothness

  // Incoming tangent at p1: blend of (p1-p0) and (p2-p0)
  const m1x = tension * (p2.x - p0.x)
  const m1y = tension * (p2.y - p0.y)

  // Outgoing tangent at p2: blend of (p2-p1) and (p3-p1)  
  const m2x = tension * (p3.x - p1.x)
  const m2y = tension * (p3.y - p1.y)

  // Hermite basis functions
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1  // position at p1
  const h10 = t3 - 2 * t2 + t      // tangent at p1
  const h01 = -2 * t3 + 3 * t2     // position at p2
  const h11 = t3 - t2              // tangent at p2

  // Hermite interpolation
  const x = h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x
  const y = h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y

  return { x, y }
}

