/**
 * Dead Zone Module
 * 
 * Camera follow logic with adaptive dead-zone behavior.
 */

import { clamp01, smootherStep } from '@/lib/core/math'
import { CAMERA_CONFIG } from '@/features/effects/config/physics-config'

export interface OutputOverscan {
    /** Allowed normalized overscan beyond left edge (relative to draw size). */
    left: number
    /** Allowed normalized overscan beyond right edge (relative to draw size). */
    right: number
    /** Allowed normalized overscan beyond top edge (relative to draw size). */
    top: number
    /** Allowed normalized overscan beyond bottom edge (relative to draw size). */
    bottom: number
}

const { deadZoneRatio: CAMERA_DEAD_ZONE_RATIO } = CAMERA_CONFIG

/**
 * Calculate adaptive dead zone ratio based on zoom scale.
 * At higher zoom levels, reduce dead-zone so the camera tracks tighter.
 */
export function getAdaptiveDeadZoneRatio(zoomScale: number): number {
    const maxRatio = CAMERA_DEAD_ZONE_RATIO
    const minRatio = 0.18
    const startScale = 1.1
    const endScale = 2.5
    if (zoomScale <= startScale) return maxRatio
    const t = Math.min(1, (zoomScale - startScale) / (endScale - startScale))
    return maxRatio + (minRatio - maxRatio) * t
}

/**
 * Calculate normalized half-window dimensions based on zoom and aspect ratio.
 */
export function getHalfWindows(
    zoomScale: number,
    screenWidth: number,
    screenHeight: number,
    outputWidth?: number,
    outputHeight?: number
): { halfWindowX: number; halfWindowY: number } {
    if (zoomScale <= 1.001) return { halfWindowX: 0.5, halfWindowY: 0.5 }

    let rX = 1
    let rY = 1

    if (outputWidth && outputHeight) {
        const sourceAspect = screenWidth / screenHeight
        const outputAspect = outputWidth / outputHeight
        // When aspects differ, the visible source window is constrained by the
        // narrower axis after fitting. Adjust the half-window on that axis.
        if (outputAspect > sourceAspect) {
            // Output is wider -> constrained by height (letterbox top/bottom).
            rY = outputAspect / sourceAspect
        } else if (outputAspect < sourceAspect) {
            // Output is taller/narrower -> constrained by width (pillarbox left/right).
            rX = sourceAspect / outputAspect
        }
    }

    return {
        halfWindowX: (0.5 * rX) / zoomScale,
        halfWindowY: (0.5 * rY) / zoomScale,
    }
}

/**
 * Calculate follow target with dead-zone behavior.
 * Uses a soft dead-zone: no movement near center, gentle movement near edges.
 * This avoids both "creep" (always moving) and "snap" (discontinuous target).
 */
export function calculateFollowTargetNormalized(
    cursorNorm: { x: number; y: number },
    currentCenterNorm: { x: number; y: number },
    halfWindowX: number,
    halfWindowY: number,
    zoomScale: number,
    overscan: OutputOverscan
): { x: number; y: number } {
    const deadZoneRatio = getAdaptiveDeadZoneRatio(zoomScale)
    const deadZoneHalfX = halfWindowX * deadZoneRatio
    const deadZoneHalfY = halfWindowY * deadZoneRatio

    const clampX = (c: number) =>
        Math.max(halfWindowX - overscan.left, Math.min(1 - halfWindowX + overscan.right, c))
    const clampY = (c: number) =>
        Math.max(halfWindowY - overscan.top, Math.min(1 - halfWindowY + overscan.bottom, c))

    const dx = cursorNorm.x - currentCenterNorm.x
    const dy = cursorNorm.y - currentCenterNorm.y

    // Soft inner dead-zone
    const innerDeadZoneHalfX = deadZoneHalfX * 0.6
    const innerDeadZoneHalfY = deadZoneHalfY * 0.6

    const nextCenterX = (() => {
        const absDx = Math.abs(dx)
        if (absDx <= innerDeadZoneHalfX) return currentCenterNorm.x
        const sign = dx < 0 ? -1 : 1
        const desired = cursorNorm.x - sign * deadZoneHalfX
        const t = deadZoneHalfX > innerDeadZoneHalfX
            ? clamp01((absDx - innerDeadZoneHalfX) / (deadZoneHalfX - innerDeadZoneHalfX))
            : 1
        const eased = smootherStep(t)
        return currentCenterNorm.x + (desired - currentCenterNorm.x) * eased
    })()

    const nextCenterY = (() => {
        const absDy = Math.abs(dy)
        if (absDy <= innerDeadZoneHalfY) return currentCenterNorm.y
        const sign = dy < 0 ? -1 : 1
        const desired = cursorNorm.y - sign * deadZoneHalfY
        const t = deadZoneHalfY > innerDeadZoneHalfY
            ? clamp01((absDy - innerDeadZoneHalfY) / (deadZoneHalfY - innerDeadZoneHalfY))
            : 1
        const eased = smootherStep(t)
        return currentCenterNorm.y + (desired - currentCenterNorm.y) * eased
    })()

    return { x: clampX(nextCenterX), y: clampY(nextCenterY) }
}
