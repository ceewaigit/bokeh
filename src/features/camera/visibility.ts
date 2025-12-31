/**
 * Visibility Module
 * 
 * Keep cursor visible within the camera viewport.
 */

import type { OutputOverscan } from './dead-zone'

/**
 * Clamp camera center to content bounds.
 */
export function clampCenterToContentBounds(
    centerNorm: { x: number; y: number },
    halfWindowX: number,
    halfWindowY: number,
    overscan: OutputOverscan,
    /** When true, allow full 0-1 range for output-space calculations */
    allowFullRange: boolean = false,
    /** When true, ignore overscan and clamp strictly to content bounds */
    ignoreOverscan: boolean = false,
    /** Optional explicit content bounds (normalized 0-1) to clamp within. Defaults to 0,0,1,1 */
    contentBounds?: { minX: number; maxX: number; minY: number; maxY: number }
): { x: number; y: number } {
    const minX = contentBounds?.minX ?? 0
    const maxX = contentBounds?.maxX ?? 1
    const minY = contentBounds?.minY ?? 0
    const maxY = contentBounds?.maxY ?? 1

    if (allowFullRange) {
        // In output space, allow camera center to span full 0-1 range
        return {
            x: Math.max(halfWindowX + minX, Math.min(maxX - halfWindowX, centerNorm.x)),
            y: Math.max(halfWindowY + minY, Math.min(maxY - halfWindowY, centerNorm.y)),
        }
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
