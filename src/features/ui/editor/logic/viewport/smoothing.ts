/**
 * Smoothing Module
 * 
 * Cinematic smoothing and dynamic attractor analysis for camera movement.
 * Replaces rigid clustering with fluid, velocity-based dwell detection.
 */

import type { MouseEvent } from '@/types/project'
import { interpolateMousePosition } from '@/features/effects/utils/mouse-interpolation'
import { CAMERA_CONFIG } from '@/shared/config/physics-config'
import { binarySearchEvents } from '@/features/rendering/canvas/math'

const {
    dwellTriggerMs: _DWELL_TRIGGER_MS,
} = CAMERA_CONFIG

/**
 * Calculate Smoothed Attractor Position
 * Simple: return cursor position. Let exponential smoothing handle the rest.
 */
export function calculateAttractor(
    mouseEvents: MouseEvent[],
    timeMs: number,
    _videoWidth: number,
    _videoHeight: number,
    _smoothingAmount: number
): { x: number; y: number; velocity: number; isDwelling: boolean } | null {
    if (mouseEvents.length === 0) return null

    const currentPos = interpolateMousePosition(mouseEvents, timeMs)
    if (!currentPos) return null

    return {
        x: currentPos.x,
        y: currentPos.y,
        velocity: 0,
        isDwelling: false
    }
}


/**
 * Calculates the average position over a time window.
 * This acts as a low-pass filter (smoothing).
 */
function _getAveragePosition(
    mouseEvents: MouseEvent[],
    endTime: number,
    windowDuration: number
): { x: number; y: number } {
    const startTime = endTime - windowDuration
    let sumX = 0
    let sumY = 0
    let count = 0

    // PERF: Don't scan from the end of the array.
    // During early playback of a long recording, `mouseEvents.length - 1` can be far in the future,
    // making this O(n) per frame. Use binary search to jump to the last event <= endTime, then
    // scan only the small window.
    const endIdx = binarySearchEvents(mouseEvents, endTime)
    if (endIdx >= 0) {
        for (let i = endIdx; i >= 0; i--) {
            const e = mouseEvents[i]
            if (e.timestamp < startTime) break
            sumX += e.x
            sumY += e.y
            count++
        }
    }

    if (count === 0) {
        // Fallback to single point interpolation if no events in window
        const pos = interpolateMousePosition(mouseEvents, endTime)
        return pos || { x: 0, y: 0 }
    }

    return {
        x: sumX / count,
        y: sumY / count
    }
}

/**
 * Normalize smoothing amount helper
 */
export function normalizeSmoothingAmount(value?: number): number {
    if (!Number.isFinite(value)) return 0
    const raw = value ?? 0
    const normalized = raw > 0 && raw <= 1 ? raw * 100 : raw
    return Math.max(0, Math.min(100, normalized))
}
