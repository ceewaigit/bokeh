/**
 * Dead Zone Module
 * 
 * Camera follow logic with adaptive dead-zone behavior.
 */

import { CAMERA_CONFIG } from '@/shared/config/physics-config'


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
 *
 * NOTE: At very high zoom (2.5x+), we keep a larger minimum dead-zone
 * to prevent jittery/sensitive camera behavior from small cursor movements.
 */
export function getAdaptiveDeadZoneRatio(zoomScale: number): number {
    const maxRatio = CAMERA_DEAD_ZONE_RATIO  // 0.4 at 1x zoom
    const minRatio = 0.28                     // Larger minimum for smoother high-zoom tracking
    const startScale = 1.2                    // Start shrinking later
    const endScale = 3.0                      // Extend curve for gradual transition
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
 * Simple: cursor inside zone = no movement, cursor outside = track to edge.
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

    // Simple dead-zone: inside = stay put, outside = move so cursor is at edge
    const nextCenterX = (() => {
        const absDx = Math.abs(dx)
        if (absDx <= deadZoneHalfX) return currentCenterNorm.x
        const sign = dx < 0 ? -1 : 1
        return cursorNorm.x - sign * deadZoneHalfX
    })()

    const nextCenterY = (() => {
        const absDy = Math.abs(dy)
        if (absDy <= deadZoneHalfY) return currentCenterNorm.y
        const sign = dy < 0 ? -1 : 1
        return cursorNorm.y - sign * deadZoneHalfY
    })()

    return { x: clampX(nextCenterX), y: clampY(nextCenterY) }
}
