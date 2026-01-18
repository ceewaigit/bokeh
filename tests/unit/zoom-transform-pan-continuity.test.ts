/**
 * Zoom Transform Pan Continuity Tests
 *
 * Black box tests to ensure pan calculations are continuous across all zoom phases
 * (intro, hold, outro) and that the camera can reach its full range during hold phase.
 *
 * These tests prevent regressions of the "camera bounds clamping" bug where:
 * 1. Pan jumped at intro-to-hold boundary
 * 2. Pan jumped at hold-to-outro boundary (snap to center)
 * 3. Camera couldn't reach padding edges during hold phase
 */

import { calculateZoomTransform } from '@/features/rendering/canvas/math/transforms/zoom-transform'
import type { ZoomBlock } from '@/features/effects/types'

// Helper to create a zoom block with common defaults
function createZoomBlock(overrides: Partial<ZoomBlock> = {}): ZoomBlock {
  return {
    id: 'test-zoom',
    origin: 'manual',
    startTime: 0,
    endTime: 5000,
    scale: 2,
    introMs: 500,
    outroMs: 500,
    zoomIntoCursorMode: 'cursor',
    ...overrides,
  } as ZoomBlock
}

// Helper to get pan at a specific time
function getPanAt(
  block: ZoomBlock,
  timeMs: number,
  center: { x: number; y: number },
  videoSize = { width: 1920, height: 1080 }
) {
  const result = calculateZoomTransform(
    block,
    timeMs,
    videoSize.width,
    videoSize.height,
    center,
    undefined,
    undefined,
    true // disable refocus blur for cleaner testing
  )
  return { panX: result.panX, panY: result.panY, scale: result.scale }
}

describe('Zoom Transform Pan Continuity', () => {
  describe('intro-to-hold boundary continuity', () => {
    it('should have no pan jump at intro-to-hold boundary (center camera)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500 })
      const center = { x: 0.5, y: 0.5 }

      // Get pan just before and just after intro ends
      const justBeforeHold = getPanAt(block, 499, center)
      const justAfterHold = getPanAt(block, 501, center)

      // Pan should be continuous (no jump > 1px)
      expect(Math.abs(justAfterHold.panX - justBeforeHold.panX)).toBeLessThan(5)
      expect(Math.abs(justAfterHold.panY - justBeforeHold.panY)).toBeLessThan(5)
    })

    it('should have no pan jump at intro-to-hold boundary (off-center camera)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.75, y: 0.6 }

      const justBeforeHold = getPanAt(block, 499, center)
      const justAfterHold = getPanAt(block, 501, center)

      // Pan should be continuous (allowing for small numerical error)
      expect(Math.abs(justAfterHold.panX - justBeforeHold.panX)).toBeLessThan(10)
      expect(Math.abs(justAfterHold.panY - justBeforeHold.panY)).toBeLessThan(10)
    })

    it('should have no pan jump at intro-to-hold boundary (extreme edge camera)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 1.9 })
      // Camera at far edge - this is where the bug was most visible
      const center = { x: 0.777, y: 0.5 }

      const justBeforeHold = getPanAt(block, 499, center)
      const justAfterHold = getPanAt(block, 501, center)

      // This was the main bug: pan would jump by ~800px at this boundary
      expect(Math.abs(justAfterHold.panX - justBeforeHold.panX)).toBeLessThan(20)
      expect(Math.abs(justAfterHold.panY - justBeforeHold.panY)).toBeLessThan(20)
    })

    it('should have no pan jump with high zoom scale', () => {
      const block = createZoomBlock({ introMs: 600, outroMs: 600, scale: 4 })
      const center = { x: 0.8, y: 0.7 }

      const justBeforeHold = getPanAt(block, 599, center)
      const justAfterHold = getPanAt(block, 601, center)

      expect(Math.abs(justAfterHold.panX - justBeforeHold.panX)).toBeLessThan(20)
      expect(Math.abs(justAfterHold.panY - justBeforeHold.panY)).toBeLessThan(20)
    })
  })

  describe('hold-to-outro boundary continuity', () => {
    it('should have no pan jump at hold-to-outro boundary (center camera)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500 })
      const center = { x: 0.5, y: 0.5 }

      // Block ends at 5000ms, outro starts at 4500ms
      const justBeforeOutro = getPanAt(block, 4499, center)
      const justAfterOutro = getPanAt(block, 4501, center)

      expect(Math.abs(justAfterOutro.panX - justBeforeOutro.panX)).toBeLessThan(5)
      expect(Math.abs(justAfterOutro.panY - justBeforeOutro.panY)).toBeLessThan(5)
    })

    it('should have no pan jump at hold-to-outro boundary (off-center camera)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.75, y: 0.6 }

      const justBeforeOutro = getPanAt(block, 4499, center)
      const justAfterOutro = getPanAt(block, 4501, center)

      // This was the "snap to center" bug
      expect(Math.abs(justAfterOutro.panX - justBeforeOutro.panX)).toBeLessThan(10)
      expect(Math.abs(justAfterOutro.panY - justBeforeOutro.panY)).toBeLessThan(10)
    })

    it('should have no pan jump at hold-to-outro boundary (extreme edge camera)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 1.9 })
      const center = { x: 0.777, y: 0.5 }

      const justBeforeOutro = getPanAt(block, 4499, center)
      const justAfterOutro = getPanAt(block, 4501, center)

      expect(Math.abs(justAfterOutro.panX - justBeforeOutro.panX)).toBeLessThan(20)
      expect(Math.abs(justAfterOutro.panY - justBeforeOutro.panY)).toBeLessThan(20)
    })
  })

  describe('intro phase behavior', () => {
    it('should start with zero pan at scale=1 (beginning of intro)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.75, y: 0.6 }

      const atStart = getPanAt(block, 0, center)

      // At scale=1, pan should be 0 regardless of camera center
      expect(atStart.scale).toBeCloseTo(1, 1)
      expect(Math.abs(atStart.panX)).toBeLessThan(5)
      expect(Math.abs(atStart.panY)).toBeLessThan(5)
    })

    it('should smoothly increase pan during intro', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.75, y: 0.5 }

      const at0 = getPanAt(block, 0, center)
      const at125 = getPanAt(block, 125, center)
      const at250 = getPanAt(block, 250, center)
      const at375 = getPanAt(block, 375, center)
      const at500 = getPanAt(block, 500, center)

      // Pan should monotonically increase (become more negative for x > 0.5)
      // Note: panX is negative when center.x > 0.5
      expect(at125.panX).toBeLessThanOrEqual(at0.panX)
      expect(at250.panX).toBeLessThanOrEqual(at125.panX)
      expect(at375.panX).toBeLessThanOrEqual(at250.panX)
      expect(at500.panX).toBeLessThanOrEqual(at375.panX)
    })
  })

  describe('hold phase behavior', () => {
    it('should maintain full pan during hold phase', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.75, y: 0.5 }
      const videoWidth = 1920

      // During hold phase (500-4500ms), pan should be at full value
      const atHoldStart = getPanAt(block, 600, center)
      const atHoldMid = getPanAt(block, 2500, center)
      const atHoldEnd = getPanAt(block, 4400, center)

      // Expected full pan: (0.5 - 0.75) * 1920 * 2 = -960px
      const expectedPanX = (0.5 - center.x) * videoWidth * block.scale

      expect(atHoldStart.panX).toBeCloseTo(expectedPanX, 0)
      expect(atHoldMid.panX).toBeCloseTo(expectedPanX, 0)
      expect(atHoldEnd.panX).toBeCloseTo(expectedPanX, 0)
    })

    it('should allow camera to reach padding edges (overscan reveal)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 1.9 })
      // Camera center beyond 0.5 + halfWindow should reveal padding
      // At 1.9x zoom, halfWindow ≈ 0.263, so center at 0.777 is at the edge
      const center = { x: 0.777, y: 0.5 }
      const videoWidth = 2978

      const atHold = getPanAt(block, 2500, center, { width: videoWidth, height: 1080 })

      // Full pan should be: (0.5 - 0.777) * 2978 * 1.9 ≈ -1567px
      // The old buggy formula gave: (0.5 - 0.777) * 2978 * 0.9 ≈ -742px
      const expectedFullPan = (0.5 - center.x) * videoWidth * block.scale

      // Pan should be close to the full value, not the limited (scale-1) value
      expect(atHold.panX).toBeCloseTo(expectedFullPan, -1) // within 10px
    })
  })

  describe('outro phase behavior', () => {
    it('should smoothly return to zero pan during outro', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.75, y: 0.5 }

      // Outro is from 4500-5000ms
      const at4500 = getPanAt(block, 4500, center)
      const at4625 = getPanAt(block, 4625, center)
      const at4750 = getPanAt(block, 4750, center)
      const at4875 = getPanAt(block, 4875, center)
      const at5000 = getPanAt(block, 5000, center)

      // Pan should monotonically decrease in magnitude (become less negative)
      expect(Math.abs(at4625.panX)).toBeLessThanOrEqual(Math.abs(at4500.panX) + 1)
      expect(Math.abs(at4750.panX)).toBeLessThanOrEqual(Math.abs(at4625.panX) + 1)
      expect(Math.abs(at4875.panX)).toBeLessThanOrEqual(Math.abs(at4750.panX) + 1)
      expect(Math.abs(at5000.panX)).toBeLessThanOrEqual(Math.abs(at4875.panX) + 1)
    })

    it('should end with near-zero pan at scale=1 (end of outro)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.75, y: 0.6 }

      const atEnd = getPanAt(block, 5000, center)

      // At scale=1, pan should be 0 regardless of camera center
      expect(atEnd.scale).toBeCloseTo(1, 1)
      expect(Math.abs(atEnd.panX)).toBeLessThan(5)
      expect(Math.abs(atEnd.panY)).toBeLessThan(5)
    })
  })

  describe('symmetry between intro and outro', () => {
    it('should have symmetric pan values at equivalent intro/outro progress', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.7, y: 0.6 }

      // Compare intro progress to equivalent outro progress
      // Intro: 0ms = 0%, 250ms = 50%, 500ms = 100%
      // Outro: 4500ms = 0%, 4750ms = 50%, 5000ms = 100%

      const intro25 = getPanAt(block, 125, center)  // 25% into intro
      const outro75 = getPanAt(block, 4875, center) // 75% into outro (25% remaining)

      const intro50 = getPanAt(block, 250, center)  // 50% into intro
      const outro50 = getPanAt(block, 4750, center) // 50% into outro

      // At same scale, pan should be approximately the same
      // (small differences due to easing curves are ok)
      expect(Math.abs(intro25.panX - outro75.panX)).toBeLessThan(50)
      expect(Math.abs(intro50.panX - outro50.panX)).toBeLessThan(50)
    })
  })

  describe('snap mode (no blending)', () => {
    it('should use raw pan formula in snap mode', () => {
      const block = createZoomBlock({
        introMs: 500,
        outroMs: 500,
        scale: 2,
        zoomIntoCursorMode: 'snap',
      })
      const center = { x: 0.75, y: 0.5 }
      const videoWidth = 1920

      // In snap mode, pan should always use the raw formula: (0.5 - center) * width * scale
      const atIntro = getPanAt(block, 250, center)
      const atHold = getPanAt(block, 2500, center)
      const atOutro = getPanAt(block, 4750, center)

      // All should use rawPan formula
      const expectedIntroPan = (0.5 - center.x) * videoWidth * atIntro.scale
      const expectedHoldPan = (0.5 - center.x) * videoWidth * atHold.scale
      const expectedOutroPan = (0.5 - center.x) * videoWidth * atOutro.scale

      expect(atIntro.panX).toBeCloseTo(expectedIntroPan, 0)
      expect(atHold.panX).toBeCloseTo(expectedHoldPan, 0)
      expect(atOutro.panX).toBeCloseTo(expectedOutroPan, 0)
    })
  })

  describe('edge cases', () => {
    it('should handle zero intro duration', () => {
      const block = createZoomBlock({ introMs: 0, outroMs: 500, scale: 2 })
      const center = { x: 0.75, y: 0.5 }

      // With zero intro, should jump straight to full zoom
      const at0 = getPanAt(block, 0, center)
      const at100 = getPanAt(block, 100, center)

      // Both should be at full scale and full pan
      expect(at0.scale).toBeCloseTo(2, 1)
      expect(at100.scale).toBeCloseTo(2, 1)
    })

    it('should handle zero outro duration', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 0, scale: 2 })
      const center = { x: 0.75, y: 0.5 }

      // With zero outro, should stay at full zoom until the end
      const at4900 = getPanAt(block, 4900, center)
      const at5000 = getPanAt(block, 5000, center)

      expect(at4900.scale).toBeCloseTo(2, 1)
      expect(at5000.scale).toBeCloseTo(2, 1)
    })

    it('should handle center at exact 0.5 (no pan needed)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.5, y: 0.5 }

      const atIntro = getPanAt(block, 250, center)
      const atHold = getPanAt(block, 2500, center)
      const atOutro = getPanAt(block, 4750, center)

      // Pan should be zero throughout
      expect(Math.abs(atIntro.panX)).toBeLessThan(1)
      expect(Math.abs(atHold.panX)).toBeLessThan(1)
      expect(Math.abs(atOutro.panX)).toBeLessThan(1)
    })

    it('should handle center beyond video bounds (overscan)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      // Center beyond 1.0 (in overscan/padding area)
      const center = { x: 1.1, y: 0.5 }

      const atHold = getPanAt(block, 2500, center)

      // Should still calculate pan correctly
      const expectedPan = (0.5 - 1.1) * 1920 * 2
      expect(atHold.panX).toBeCloseTo(expectedPan, 0)
    })

    it('should handle very short block duration', () => {
      const block = createZoomBlock({
        startTime: 0,
        endTime: 200,
        introMs: 100,
        outroMs: 100,
        scale: 2,
      })
      const center = { x: 0.7, y: 0.5 }

      // Even with overlapping intro/outro, should be continuous
      // Note: with very short durations, pan changes rapidly but should still be smooth
      const samples: number[] = []
      for (let t = 0; t <= 200; t += 10) {
        const { panX } = getPanAt(block, t, center)
        samples.push(panX)
      }

      // Check for continuity: no sample should differ from neighbors by more than
      // the expected rate of change. With 10ms intervals and rapid zoom during a
      // very short block, changes can be significant but should still be smooth.
      for (let i = 1; i < samples.length; i++) {
        const delta = Math.abs(samples[i] - samples[i - 1])
        // Allow up to 150px change per 10ms sample (rapid zoom in short blocks)
        expect(delta).toBeLessThan(150)
      }
    })

    it('should handle scale of 1 (no zoom)', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 1 })
      const center = { x: 0.75, y: 0.5 }

      const atIntro = getPanAt(block, 250, center)
      const atHold = getPanAt(block, 2500, center)

      // At scale 1, pan should be minimal
      expect(atIntro.scale).toBe(1)
      expect(atHold.scale).toBe(1)
    })
  })

  describe('different zoomIntoCursorMode values', () => {
    const modes: Array<'cursor' | 'lead' | 'center' | 'snap' | undefined> = [
      'cursor',
      'lead',
      'center',
      'snap',
      undefined,
    ]

    modes.forEach((mode) => {
      it(`should have continuous pan with zoomIntoCursorMode=${mode}`, () => {
        const block = createZoomBlock({
          introMs: 500,
          outroMs: 500,
          scale: 2,
          zoomIntoCursorMode: mode,
        })
        const center = { x: 0.75, y: 0.5 }

        // Test intro-to-hold boundary
        const beforeHold = getPanAt(block, 499, center)
        const afterHold = getPanAt(block, 501, center)
        expect(Math.abs(afterHold.panX - beforeHold.panX)).toBeLessThan(20)

        // Test hold-to-outro boundary
        const beforeOutro = getPanAt(block, 4499, center)
        const afterOutro = getPanAt(block, 4501, center)
        expect(Math.abs(afterOutro.panX - beforeOutro.panX)).toBeLessThan(20)
      })
    })
  })

  describe('monotonic pan progression (no reversals)', () => {
    it('should not reverse pan direction during intro', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.8, y: 0.5 }

      const samples: number[] = []
      for (let t = 0; t <= 500; t += 25) {
        const { panX } = getPanAt(block, t, center)
        samples.push(panX)
      }

      // Pan should monotonically decrease (more negative) during intro for x > 0.5
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1) // small tolerance
      }
    })

    it('should not reverse pan direction during outro', () => {
      const block = createZoomBlock({ introMs: 500, outroMs: 500, scale: 2 })
      const center = { x: 0.8, y: 0.5 }

      const samples: number[] = []
      for (let t = 4500; t <= 5000; t += 25) {
        const { panX } = getPanAt(block, t, center)
        samples.push(Math.abs(panX))
      }

      // Absolute pan should monotonically decrease during outro
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1) // small tolerance
      }
    })
  })
})
