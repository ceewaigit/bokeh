/**
 * Visibility Module
 * 
 * Keep cursor visible within the camera viewport.
 */

import type { OutputOverscan } from './dead-zone'

/**
 * Clamp camera center to content bounds.
 *
 * When ignoreOverscan=false (i.e. we want to reveal background padding):
 * - Camera is allowed to get closer to edges than halfWindow would normally allow
 * - This enables the visible window to extend into the padding area
 * - The camera can go as close as halfWindow - overscan to the content edge
 */
export function clampCenterToContentBounds(
    centerNorm: { x: number; y: number },
    halfWindowX: number,
    halfWindowY: number,
    overscan: OutputOverscan,
    /** When true, allow full 0-1 range for output-space calculations */
    allowFullRange: boolean = false,
    /** When true, ignore overscan and clamp strictly to content bounds (no padding reveal) */
    ignoreOverscan: boolean = false,
    /** Optional explicit content bounds (normalized 0-1) to clamp within. Defaults to 0,0,1,1 */
    contentBounds?: { minX: number; maxX: number; minY: number; maxY: number }
): { x: number; y: number } {
    const minX = contentBounds?.minX ?? 0
    const maxX = contentBounds?.maxX ?? 1
    const minY = contentBounds?.minY ?? 0
    const maxY = contentBounds?.maxY ?? 1

    if (allowFullRange) {
        // In output space - calculate bounds based on whether we want to reveal padding
        // When ignoreOverscan=false, allow camera to go ALL THE WAY to edges
        // This lets the visible window extend fully into the padding/overscan area
        //
        // The key insight: to reveal padding, camera center must be able to go to
        // the very edge (0 or 1), not just halfWindow away from the edge.

        // When ignoreOverscan=true: clamp to [halfWindow, 1-halfWindow] (no padding reveal)
        // When ignoreOverscan=false: clamp to [0, 1] (full padding reveal possible)
        const effectiveMinX = ignoreOverscan ? halfWindowX + minX : minX
        const effectiveMaxX = ignoreOverscan ? maxX - halfWindowX : maxX
        const effectiveMinY = ignoreOverscan ? halfWindowY + minY : minY
        const effectiveMaxY = ignoreOverscan ? maxY - halfWindowY : maxY

        const result = {
            x: effectiveMinX > effectiveMaxX ? (effectiveMinX + effectiveMaxX) / 2 : Math.max(effectiveMinX, Math.min(effectiveMaxX, centerNorm.x)),
            y: effectiveMinY > effectiveMaxY ? (effectiveMinY + effectiveMaxY) / 2 : Math.max(effectiveMinY, Math.min(effectiveMaxY, centerNorm.y)),
        }
        return result
    }

    const leftBound = ignoreOverscan ? 0 : -overscan.left
    const rightBound = ignoreOverscan ? 0 : overscan.right
    const topBound = ignoreOverscan ? 0 : -overscan.top
    const bottomBound = ignoreOverscan ? 0 : overscan.bottom

    const applyAxis = (c: number, hw: number, minV: number, maxV: number, lb: number, rb: number, allowFull: boolean) => {
        // Effective constraints
        const minCenter = allowFull ? hw + minV : hw + lb + minV
        const maxCenter = allowFull ? maxV - hw : maxV - hw + rb

        if (minCenter > maxCenter) {
            return (minCenter + maxCenter) / 2
        }
        return Math.max(minCenter, Math.min(maxCenter, c))
    }

    return {
        x: applyAxis(centerNorm.x, halfWindowX, minX, maxX, leftBound, rightBound, allowFullRange),
        y: applyAxis(centerNorm.y, halfWindowY, minY, maxY, topBound, bottomBound, allowFullRange),
    }
}

/**
 * Project camera center to keep cursor visible in viewport.
 * Adjusts center so that the full cursor image stays within the visible window.
 */
export function projectCenterToKeepCursorVisible(
    centerNorm: { x: number; y: number },
    cursorNorm: { x: number; y: number },
    halfWindowX: number,
    halfWindowY: number,
    overscan: OutputOverscan,
    cursorMargins?: { left: number; right: number; top: number; bottom: number },
    /** When true, allow full 0-1 range for output-space calculations */
    allowFullRange: boolean = false
): { x: number; y: number } {
    const projectAxis = (
        c: number,
        cursorPos: number,
        halfWindow: number,
        marginMin: number,
        marginMax: number,
        overscanMin: number,
        overscanMax: number
    ) => {
        const clampedCursor = Math.max(0, Math.min(1, cursorPos))

        // Keep the full cursor image visible, not just the hotspot point.
        // Visible source window is [center - halfWindow, center + halfWindow].
        // Require: cursorPos - marginMin >= center - halfWindow  => center <= cursorPos - marginMin + halfWindow
        //          cursorPos + marginMax <= center + halfWindow  => center >= cursorPos + marginMax - halfWindow
        let minCenter = clampedCursor + marginMax - halfWindow
        let maxCenter = clampedCursor - marginMin + halfWindow

        const minAllowed = allowFullRange ? halfWindow : halfWindow - overscanMin
        const maxAllowed = allowFullRange ? 1 - halfWindow : 1 - halfWindow + overscanMax

        minCenter = Math.max(minCenter, minAllowed)
        maxCenter = Math.min(maxCenter, maxAllowed)

        // If constraints are infeasible (e.g., giant cursor at extreme zoom),
        // fall back to clamping within allowed content bounds.
        if (minCenter > maxCenter) {
            return Math.max(minAllowed, Math.min(maxAllowed, c))
        }

        return Math.max(minCenter, Math.min(maxCenter, c))
    }

    return {
        x: projectAxis(
            centerNorm.x,
            cursorNorm.x,
            halfWindowX,
            cursorMargins?.left ?? 0,
            cursorMargins?.right ?? 0,
            overscan.left,
            overscan.right
        ),
        y: projectAxis(
            centerNorm.y,
            cursorNorm.y,
            halfWindowY,
            cursorMargins?.top ?? 0,
            cursorMargins?.bottom ?? 0,
            overscan.top,
            overscan.bottom
        ),
    }
}
