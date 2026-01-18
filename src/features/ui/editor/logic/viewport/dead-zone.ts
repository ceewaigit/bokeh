/**
 * Dead Zone Module
 *
 * Camera follow logic with adaptive dead-zone behavior.
 * Uses soft transitions at the dead zone boundary to prevent abrupt camera snaps.
 */

import { CAMERA_CONFIG } from '@/shared/config/physics-config'
import { smootherStep } from '@/features/rendering/canvas/math/easing'


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
 *
 * @param zoomScale - Current zoom scale (1.0 = no zoom)
 * @param baseRatioOverride - Optional per-block override for base dead zone ratio (0-1)
 */
export function getAdaptiveDeadZoneRatio(zoomScale: number, baseRatioOverride?: number): number {
    const maxRatio = baseRatioOverride ?? CAMERA_DEAD_ZONE_RATIO  // 0.4 at 1x zoom (or override)
    // When user sets a custom value, preserve more of it (only shrink to 85%)
    // Default (no override) shrinks more aggressively (to 70%)
    const shrinkFactor = baseRatioOverride !== undefined ? 0.85 : 0.7
    const minRatio = Math.max(0.1, maxRatio * shrinkFactor)
    const startScale = 1.5                    // Start shrinking later to preserve user setting longer
    const endScale = 4.0                      // Extend curve for more gradual transition
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
 * Calculate follow target with soft dead-zone behavior.
 *
 * Instead of discrete "inside = stay, outside = snap" logic, we use a smooth
 * transition zone that prevents abrupt camera jerks when cursor crosses the boundary.
 *
 * - Inside dead zone: camera stays still (t=0)
 * - In transition zone (1x to 1.5x dead zone): smooth blend using smootherStep
 * - Outside transition zone: full tracking to keep cursor at dead zone edge (t=1)
 *
 * NOTE: This function does NOT clamp the result. Clamping is done once at the
 * end of computeCameraState() with full context (padding, overscan, etc.).
 *
 * @param deadZoneRatioOverride - Optional per-block override for dead zone ratio (0-1)
 */
export function calculateFollowTargetNormalized(
    cursorNorm: { x: number; y: number },
    currentCenterNorm: { x: number; y: number },
    halfWindowX: number,
    halfWindowY: number,
    zoomScale: number,
    _overscan: OutputOverscan,  // Kept for API compatibility, clamping moved to orchestrator
    deadZoneRatioOverride?: number
): { x: number; y: number } {
    const deadZoneRatio = getAdaptiveDeadZoneRatio(zoomScale, deadZoneRatioOverride)
    const deadZoneHalfX = halfWindowX * deadZoneRatio
    const deadZoneHalfY = halfWindowY * deadZoneRatio

    // Transition zone extends 50% beyond dead zone for smooth blending
    const transitionHalfX = deadZoneHalfX * 1.5
    const transitionHalfY = deadZoneHalfY * 1.5

    const dx = cursorNorm.x - currentCenterNorm.x
    const dy = cursorNorm.y - currentCenterNorm.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // Calculate soft transition factor for each axis
    // t=0: inside dead zone (no movement)
    // t=1: at or beyond transition zone edge (full tracking)
    const calcTransitionFactor = (absD: number, deadHalf: number, transHalf: number): number => {
        if (absD <= deadHalf) return 0
        if (absD >= transHalf) return 1
        // Smooth interpolation in the transition zone
        const raw = (absD - deadHalf) / (transHalf - deadHalf)
        return smootherStep(raw)
    }

    const tx = calcTransitionFactor(absDx, deadZoneHalfX, transitionHalfX)
    const ty = calcTransitionFactor(absDy, deadZoneHalfY, transitionHalfY)

    // Target position if we were doing full tracking (cursor at dead zone edge)
    const signX = dx < 0 ? -1 : 1
    const signY = dy < 0 ? -1 : 1
    const fullTrackX = cursorNorm.x - signX * deadZoneHalfX
    const fullTrackY = cursorNorm.y - signY * deadZoneHalfY

    // Blend between current position (t=0) and full tracking (t=1)
    const nextCenterX = currentCenterNorm.x + (fullTrackX - currentCenterNorm.x) * tx
    const nextCenterY = currentCenterNorm.y + (fullTrackY - currentCenterNorm.y) * ty

    // No clamping here - done once at end of computeCameraState with full context
    return { x: nextCenterX, y: nextCenterY }
}
