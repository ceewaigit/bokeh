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

    const clampInContentSpace = (
        center: { x: number; y: number },
        hwX: number,
        hwY: number,
        overscanInContentSpace: OutputOverscan
    ) => {
        const leftBound = ignoreOverscan ? 0 : -overscanInContentSpace.left
        const rightBound = ignoreOverscan ? 0 : overscanInContentSpace.right
        const topBound = ignoreOverscan ? 0 : -overscanInContentSpace.top
        const bottomBound = ignoreOverscan ? 0 : overscanInContentSpace.bottom

        const applyAxis = (c: number, hw: number, minV: number, maxV: number, lb: number, rb: number) => {
            const minCenter = hw + lb + minV
            const maxCenter = maxV - hw + rb

            if (minCenter > maxCenter) {
                return (minCenter + maxCenter) / 2
            }
            return Math.max(minCenter, Math.min(maxCenter, c))
        }

        return {
            x: applyAxis(center.x, hwX, minX, maxX, leftBound, rightBound),
            y: applyAxis(center.y, hwY, minY, maxY, topBound, bottomBound),
        }
    }

    if (allowFullRange) {
        // Input is in OUTPUT space (0..1 across the full rendered output, including padding).
        // Convert into CONTENT space (0..1 across the video draw area) so we can apply the
        // same clamping math consistently, then convert back.
        const contentWidthOut = 1 - overscan.left - overscan.right
        const contentHeightOut = 1 - overscan.top - overscan.bottom

        if (contentWidthOut <= 0 || contentHeightOut <= 0) {
            return {
                x: Math.max(0, Math.min(1, centerNorm.x)),
                y: Math.max(0, Math.min(1, centerNorm.y)),
            }
        }

        const denomX = 1 / contentWidthOut
        const denomY = 1 / contentHeightOut

        const overscanContent: OutputOverscan = {
            left: overscan.left * denomX,
            right: overscan.right * denomX,
            top: overscan.top * denomY,
            bottom: overscan.bottom * denomY,
        }

        const centerContent = {
            x: centerNorm.x * denomX - overscanContent.left,
            y: centerNorm.y * denomY - overscanContent.top,
        }
        const clampedContent = clampInContentSpace(
            centerContent,
            halfWindowX * denomX,
            halfWindowY * denomY,
            overscanContent
        )

        return {
            x: (overscanContent.left + clampedContent.x) / denomX,
            y: (overscanContent.top + clampedContent.y) / denomY,
        }
    }

    // Input is already in CONTENT space.
    return clampInContentSpace(centerNorm, halfWindowX, halfWindowY, overscan)
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
