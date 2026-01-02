/**
 * Smoothing Module
 * 
 * Cinematic smoothing and dynamic attractor analysis for camera movement.
 * Replaces rigid clustering with fluid, velocity-based dwell detection.
 */

import type { MouseEvent } from '@/types/project'
import { interpolateMousePosition } from '@/features/effects/utils/mouse-interpolation'
import { CAMERA_CONFIG } from '@/shared/config/physics-config'

const {
    dwellTriggerMs: DWELL_TRIGGER_MS,
} = CAMERA_CONFIG

/**
 * Calculate Smoothed Attractor Position
 * 
 * Instead of pre-calculating clusters, this function dynamically determines
 * if the camera should "lock" to a dwell point based on instantaneous velocity.
 * 
 * @param mouseEvents - Full history of mouse events
 * @param timeMs - Current playback time
 * @param _videoWidth - Video dimensions (for normalization if needed)
 * @param _videoHeight - Video dimensions
 * @param _smoothingAmount - 0-100 UI value
 */
export function calculateAttractor(
    mouseEvents: MouseEvent[],
    timeMs: number,
    _videoWidth: number,
    _videoHeight: number,
    _smoothingAmount: number
): { x: number; y: number; velocity: number; isDwelling: boolean } | null {
    if (mouseEvents.length === 0) return null

    // 1. Get current raw position and velocity
    // We look at a small window around the current time to get instant velocity
    const windowMs = 100 // Short window for more responsive velocity check
    const currentPos = interpolateMousePosition(mouseEvents, timeMs)
    const prevPos = interpolateMousePosition(mouseEvents, timeMs - windowMs)

    if (!currentPos || !prevPos) {
        return currentPos
            ? { x: currentPos.x, y: currentPos.y, velocity: 0, isDwelling: true }
            : null
    }

    // Calculate velocity (pixels per ms)
    const dx = currentPos.x - prevPos.x
    const dy = currentPos.y - prevPos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const velocity = dist / windowMs

    // 2. Determine State: Locked vs Free
    // Higher threshold = more sticky. Camera stays put for small/slow movements.
    // This creates the "polished" feel where only deliberate movements trigger panning.
    const STICKY_VELOCITY_THRESHOLD = 2.5

    if (velocity < STICKY_VELOCITY_THRESHOLD) {
        // DWELLING: Return the average position to lock on to the dwell point
        const avg = getAveragePosition(mouseEvents, timeMs, DWELL_TRIGGER_MS)
        return {
            x: avg.x,
            y: avg.y,
            velocity,
            isDwelling: true
        }
    }


    // MOVING: Return raw position - let spring physics handle all smoothing
    // Removing averaging here eliminates "double-smoothing" lag
    return {
        x: currentPos.x,
        y: currentPos.y,
        velocity,
        isDwelling: false
    }
}


/**
 * Calculates the average position over a time window.
 * This acts as a low-pass filter (smoothing).
 */
function getAveragePosition(
    mouseEvents: MouseEvent[],
    endTime: number,
    windowDuration: number
): { x: number; y: number } {
    const startTime = endTime - windowDuration
    let sumX = 0
    let sumY = 0
    let count = 0

    // Optimization: Binary search could be used here for very large datasets,
    // but typically we only scan a few dozen events for a 500ms window.
    // We scan backwards from the approximate end index for efficiency.

    // Find approximate end index (naive linear scan backwards is fast enough for localized lookups)
    for (let i = mouseEvents.length - 1; i >= 0; i--) {
        const e = mouseEvents[i]
        if (e.timestamp > endTime) continue
        if (e.timestamp < startTime) break // Done scanning window

        sumX += e.x
        sumY += e.y
        count++
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
