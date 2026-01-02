/**
 * Cursor Velocity Module
 * 
 * Cursor motion analysis for camera stop detection and smoothing.
 */

import type { MouseEvent } from '@/types/project'
import { interpolateMousePosition } from '@/features/effects/utils/mouse-interpolation'

export interface CursorVelocityResult {
    velocity: number
    stoppedSinceMs: number | null
}

/**
 * Calculate cursor velocity from mouse events to detect when cursor has stopped.
 * Uses a short lookback window to compute instantaneous velocity.
 */
export function calculateCursorVelocity(
    mouseEvents: MouseEvent[],
    timeMs: number,
    sourceWidth: number,
    sourceHeight: number,
    jitterThresholdPx: number,
    lookbackMs: number = 50
): CursorVelocityResult {
    if (mouseEvents.length < 2) {
        return { velocity: 0, stoppedSinceMs: timeMs }
    }

    const windowStart = timeMs - lookbackMs

    // Find the last event at or before timeMs using binary search.
    let low = 0
    let high = mouseEvents.length - 1
    let endIdx = -1
    while (low <= high) {
        const mid = (low + high) >> 1
        if (mouseEvents[mid].timestamp <= timeMs) {
            endIdx = mid
            low = mid + 1
        } else {
            high = mid - 1
        }
    }

    if (endIdx < 0) {
        return { velocity: 0, stoppedSinceMs: timeMs }
    }

    // Walk backwards from endIdx until outside the lookback window.
    let startIdx = endIdx
    while (startIdx > 0 && mouseEvents[startIdx - 1].timestamp >= windowStart) {
        startIdx--
    }

    const recentCount = endIdx - startIdx + 1
    if (recentCount < 2) {
        const lastTimestamp = mouseEvents[endIdx].timestamp
        if (timeMs - lastTimestamp > lookbackMs) {
            return { velocity: 0, stoppedSinceMs: lastTimestamp }
        }
        return { velocity: 0, stoppedSinceMs: null }
    }

    const first = mouseEvents[startIdx]
    const last = mouseEvents[endIdx]

    // Treat tiny movements as noise (e.g., trackpad jitter while typing).
    // This prevents the camera from "hunting" at high zoom levels.
    const jitterThresholdPxSafe = Math.max(0, jitterThresholdPx)
    if (
        Math.abs(last.x - first.x) <= jitterThresholdPxSafe &&
        Math.abs(last.y - first.y) <= jitterThresholdPxSafe
    ) {
        return { velocity: 0, stoppedSinceMs: first.timestamp }
    }

    const dt = (last.timestamp - first.timestamp) / 1000

    if (dt < 0.001) {
        return { velocity: 0, stoppedSinceMs: null }
    }

    const dx = (last.x - first.x) / sourceWidth
    const dy = (last.y - first.y) / sourceHeight
    const velocity = Math.sqrt(dx * dx + dy * dy) / dt

    return { velocity, stoppedSinceMs: null }
}

/**
 * Exponentially-weighted smoothing of cursor position for deterministic export.
 * This provides temporal smoothing without relying on frame-to-frame physics state.
 *
 * Uses a decay window where recent positions have higher weight than older ones.
 * This produces smooth camera movement that's frame-order independent.
 */
export function getExponentiallySmoothedCursorNorm(
    mouseEvents: MouseEvent[],
    timeMs: number,
    sourceWidth: number,
    sourceHeight: number
): { x: number; y: number } {
    if (mouseEvents.length === 0) {
        return { x: 0.5, y: 0.5 }
    }

    // Smoothing parameters
    const windowMs = 600  // Look back 600ms
    const tauMs = 180     // Exponential decay time constant
    const steps = 12      // Number of samples within the window

    let sumX = 0
    let sumY = 0
    let sumW = 0
    const stepMs = windowMs / steps

    for (let i = 0; i <= steps; i++) {
        const t = timeMs - i * stepMs
        const pos = interpolateMousePosition(mouseEvents, t)
        if (pos) {
            // Exponential decay weight: more recent = higher weight
            const w = Math.exp(-(i * stepMs) / tauMs)
            sumW += w
            sumX += (pos.x / sourceWidth) * w
            sumY += (pos.y / sourceHeight) * w
        }
    }

    if (sumW === 0) {
        return { x: 0.5, y: 0.5 }
    }

    return {
        x: sumX / sumW,
        y: sumY / sumW,
    }
}
