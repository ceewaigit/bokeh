/**
 * Camera Bounds Clamping Tests
 *
 * Tests for the camera center clamping logic that controls whether
 * the zoom camera can reveal background padding or must stay within video bounds.
 */

import { clampCenterToContentBounds } from '@/features/ui/editor/logic/viewport/visibility'

describe('clampCenterToContentBounds', () => {
    describe('without overscan reveal (ignoreOverscan=true)', () => {
        it('should clamp camera center to [halfWindow, 1-halfWindow] in output space', () => {
            const center = { x: 0.1, y: 0.9 }
            const halfWindowX = 0.25
            const halfWindowY = 0.25
            const overscan = { left: 0.05, right: 0.05, top: 0.05, bottom: 0.05 }

            const result = clampCenterToContentBounds(
                center,
                halfWindowX,
                halfWindowY,
                overscan,
                true, // allowFullRange (output space)
                true  // ignoreOverscan - should clamp strictly
            )

            // Should clamp to [0.25, 0.75]
            expect(result.x).toBe(0.25)
            expect(result.y).toBe(0.75)
        })

        it('should not allow camera to reveal padding when ignoreOverscan=true', () => {
            const center = { x: 0, y: 1 } // Trying to go to extreme edges
            const halfWindowX = 0.2
            const halfWindowY = 0.2
            const overscan = { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 }

            const result = clampCenterToContentBounds(
                center,
                halfWindowX,
                halfWindowY,
                overscan,
                true,
                true // ignoreOverscan
            )

            // Should be clamped away from edges
            expect(result.x).toBeGreaterThanOrEqual(halfWindowX)
            expect(result.y).toBeLessThanOrEqual(1 - halfWindowY)
        })
    })

    describe('with overscan reveal (ignoreOverscan=false)', () => {
        it('should allow camera center to go to edges [0, 1] in output space', () => {
            const center = { x: 0, y: 1 }
            const halfWindowX = 0.25
            const halfWindowY = 0.25
            const overscan = { left: 0.05, right: 0.05, top: 0.05, bottom: 0.05 }

            const result = clampCenterToContentBounds(
                center,
                halfWindowX,
                halfWindowY,
                overscan,
                true,  // allowFullRange (output space)
                false  // ignoreOverscan=false - should allow edge access
            )

            // Should allow going to edges
            expect(result.x).toBe(0)
            expect(result.y).toBe(1)
        })

        it('should allow camera to reveal full padding when ignoreOverscan=false', () => {
            const center = { x: 0.1, y: 0.9 }
            const halfWindowX = 0.25
            const halfWindowY = 0.25
            const overscan = { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 }

            const result = clampCenterToContentBounds(
                center,
                halfWindowX,
                halfWindowY,
                overscan,
                true,
                false // ignoreOverscan=false
            )

            // Should NOT clamp - values within [0, 1]
            expect(result.x).toBe(0.1)
            expect(result.y).toBe(0.9)
        })

        it('should clamp to [0, 1] not beyond', () => {
            const center = { x: -0.5, y: 1.5 }
            const halfWindowX = 0.25
            const halfWindowY = 0.25
            const overscan = { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 }

            const result = clampCenterToContentBounds(
                center,
                halfWindowX,
                halfWindowY,
                overscan,
                true,
                false
            )

            // Should clamp to [0, 1] bounds
            expect(result.x).toBe(0)
            expect(result.y).toBe(1)
        })
    })

    describe('video space (allowFullRange=false)', () => {
        it('should use overscan bounds when ignoreOverscan=false', () => {
            const center = { x: -0.05, y: 1.05 }
            const halfWindowX = 0.2
            const halfWindowY = 0.2
            const overscan = { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 }

            const result = clampCenterToContentBounds(
                center,
                halfWindowX,
                halfWindowY,
                overscan,
                false, // video space
                false  // use overscan
            )

            // Should allow going into overscan area
            // minCenter = hw + lb = 0.2 + (-0.1) = 0.1
            // maxCenter = 1 - hw + rb = 1 - 0.2 + 0.1 = 0.9
            expect(result.x).toBeCloseTo(0.1, 5)
            expect(result.y).toBeCloseTo(0.9, 5)
        })

        it('should clamp strictly when ignoreOverscan=true', () => {
            const center = { x: 0.1, y: 0.9 }
            const halfWindowX = 0.25
            const halfWindowY = 0.25
            const overscan = { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 }

            const result = clampCenterToContentBounds(
                center,
                halfWindowX,
                halfWindowY,
                overscan,
                false,
                true // ignoreOverscan
            )

            // minCenter = hw + 0 = 0.25
            // maxCenter = 1 - hw + 0 = 0.75
            expect(result.x).toBe(0.25)
            expect(result.y).toBe(0.75)
        })
    })

    describe('edge cases', () => {
        it('should handle zero halfWindow', () => {
            const center = { x: 0.5, y: 0.5 }
            const result = clampCenterToContentBounds(
                center,
                0,
                0,
                { left: 0, right: 0, top: 0, bottom: 0 },
                true,
                false
            )
            expect(result.x).toBe(0.5)
            expect(result.y).toBe(0.5)
        })

        it('should handle infeasible constraints by centering', () => {
            // halfWindow > 0.5 means visible window is larger than content
            const center = { x: 0.3, y: 0.7 }
            const result = clampCenterToContentBounds(
                center,
                0.6, // halfWindow > 0.5
                0.6,
                { left: 0, right: 0, top: 0, bottom: 0 },
                true,
                true
            )
            // When min > max, should return center of bounds
            expect(result.x).toBe(0.5)
            expect(result.y).toBe(0.5)
        })

        it('should handle content bounds (crop)', () => {
            const center = { x: 0.3, y: 0.7 }
            const contentBounds = { minX: 0.2, maxX: 0.8, minY: 0.2, maxY: 0.8 }
            const result = clampCenterToContentBounds(
                center,
                0.1,
                0.1,
                { left: 0, right: 0, top: 0, bottom: 0 },
                true,
                false,
                contentBounds
            )
            // Should respect content bounds
            expect(result.x).toBeGreaterThanOrEqual(contentBounds.minX)
            expect(result.x).toBeLessThanOrEqual(contentBounds.maxX)
            expect(result.y).toBeGreaterThanOrEqual(contentBounds.minY)
            expect(result.y).toBeLessThanOrEqual(contentBounds.maxY)
        })
    })
})

describe('zoom target clamping behavior', () => {
    // Helper to simulate ZoomTargetPreview clampTarget logic
    const clampTarget = (
        target: { x: number; y: number },
        halfWindowNormX: number,
        halfWindowNormY: number,
        allowOverscanReveal: boolean
    ) => {
        const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
        return {
            x: allowOverscanReveal ? clamp(target.x, 0, 1) : clamp(target.x, halfWindowNormX, 1 - halfWindowNormX),
            y: allowOverscanReveal ? clamp(target.y, 0, 1) : clamp(target.y, halfWindowNormY, 1 - halfWindowNormY),
        }
    }

    describe('without background padding (allowOverscanReveal=false)', () => {
        it('should restrict target to safe zone away from edges', () => {
            const halfWindow = 0.25 // At 2x zoom
            const target = { x: 0.1, y: 0.9 }

            const result = clampTarget(target, halfWindow, halfWindow, false)

            expect(result.x).toBe(0.25)
            expect(result.y).toBe(0.75)
        })

        it('should not allow target at video edges', () => {
            const halfWindow = 0.2
            const target = { x: 0, y: 1 }

            const result = clampTarget(target, halfWindow, halfWindow, false)

            expect(result.x).toBe(0.2)
            expect(result.y).toBe(0.8)
        })
    })

    describe('with background padding (allowOverscanReveal=true)', () => {
        it('should allow target to go to video edges', () => {
            const halfWindow = 0.25
            const target = { x: 0, y: 1 }

            const result = clampTarget(target, halfWindow, halfWindow, true)

            expect(result.x).toBe(0)
            expect(result.y).toBe(1)
        })

        it('should allow target anywhere within [0, 1]', () => {
            const halfWindow = 0.3
            const target = { x: 0.1, y: 0.95 }

            const result = clampTarget(target, halfWindow, halfWindow, true)

            expect(result.x).toBe(0.1)
            expect(result.y).toBe(0.95)
        })

        it('should still clamp to [0, 1] bounds', () => {
            const halfWindow = 0.25
            const target = { x: -0.1, y: 1.1 }

            const result = clampTarget(target, halfWindow, halfWindow, true)

            expect(result.x).toBe(0)
            expect(result.y).toBe(1)
        })
    })
})
