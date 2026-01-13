import {
  calculateZoomTransform,
  getZoomTransformString,
  calculateAdaptiveDurations,
  getMinDurationForScale,
  calculateZoomScale,
  getEffectiveZoomEaseDurations
} from '@/features/rendering/canvas/math/transforms/zoom-transform'

describe('zoom-transform', () => {
  it('does not snap by returning an empty transform near 1x', () => {
    const block: any = {
      startTime: 0,
      endTime: 1000,
      scale: 2,
      introMs: 400,
      outroMs: 400,
    }

    // Very start of the block: scale is effectively 1.
    const t0 = calculateZoomTransform(block, 0, 1920, 1080, { x: 0.2, y: 0.8 })
    expect(t0.scale).toBe(1)
    expect(t0.panX).toBeCloseTo(0, 10)
    expect(t0.panY).toBeCloseTo(0, 10)
    const s0 = getZoomTransformString(t0)
    expect(s0).toContain('scale3d(1, 1, 1)')
    expect(s0).toContain('translate3d(0px, 0px, 0)')

    // Just after the start: still very close to 1 but should remain continuous.
    const t1 = calculateZoomTransform(block, 10, 1920, 1080, { x: 0.2, y: 0.8 })
    expect(t1.scale).toBeGreaterThan(1)
    expect(t1.scale).toBeLessThan(1.1)
    expect(t1.panX).not.toBe(0)
    expect(t1.panY).not.toBe(0)
    const s1 = getZoomTransformString(t1)
    expect(s1).toContain('scale3d(')
  })
})

describe('getMinDurationForScale', () => {
  it('returns minimum values based on scale', () => {
    expect(getMinDurationForScale(1)).toBe(200)
    expect(getMinDurationForScale(1.4)).toBe(200)
    expect(getMinDurationForScale(1.5)).toBe(300)
    expect(getMinDurationForScale(2)).toBe(400)
    expect(getMinDurationForScale(3)).toBe(600)
    expect(getMinDurationForScale(4)).toBe(800)
    expect(getMinDurationForScale(5)).toBe(900)
    expect(getMinDurationForScale(7)).toBe(900)
  })

  it('handles edge cases', () => {
    expect(getMinDurationForScale(0)).toBe(200) // Should clamp to 1
    expect(getMinDurationForScale(-1)).toBe(200) // Should clamp to 1
  })
})

describe('calculateAdaptiveDurations', () => {
  it('uses logarithmic scaling for deeper zooms', () => {
    const dur1x = calculateAdaptiveDurations(1, 5000)
    const dur2x = calculateAdaptiveDurations(2, 5000)
    const dur4x = calculateAdaptiveDurations(4, 5000)

    // 2x should be ~1.5x the duration of 1x (log2(2) = 1, multiplier = 1.5)
    expect(dur2x.introMs).toBeGreaterThan(dur1x.introMs * 1.4)
    expect(dur2x.introMs).toBeLessThan(dur1x.introMs * 1.6)

    // 4x should be ~2x the duration of 1x (log2(4) = 2, multiplier = 2)
    expect(dur4x.introMs).toBeGreaterThan(dur1x.introMs * 1.8)
    expect(dur4x.introMs).toBeLessThan(dur1x.introMs * 2.2)
  })

  it('respects user-provided base durations', () => {
    const result = calculateAdaptiveDurations(2, 5000, 1000, 1100)
    // User set 1000ms intro, with 2x multiplier = 1.5, expect ~1500ms
    expect(result.introMs).toBeGreaterThan(1400)
    expect(result.introMs).toBeLessThan(1600)
  })

  it('never exceeds 60% of block duration', () => {
    const shortBlock = calculateAdaptiveDurations(4, 1000)
    // Total should not exceed 600ms
    expect(shortBlock.introMs + shortBlock.outroMs).toBeLessThanOrEqual(600)
  })

  it('clamps to min/max bounds', () => {
    // Very low scale with tiny user value should still be at least 300ms
    const lowResult = calculateAdaptiveDurations(1, 10000, 100, 100)
    expect(lowResult.introMs).toBeGreaterThanOrEqual(300)

    // Very high scale should be capped at 2500ms
    const highResult = calculateAdaptiveDurations(100, 100000, 5000, 5000)
    expect(highResult.introMs).toBeLessThanOrEqual(2500)
  })
})

describe('calculateZoomScale with easing', () => {
  it('applies minimum duration constraints for deep zooms when non-zero', () => {
    // 4x zoom with 200ms user setting should get boosted to 800ms
    // Both should behave similarly at 100ms because 200ms gets boosted to 800ms minimum
    const scale1 = calculateZoomScale(100, 5000, 4, 200, 200, 'smoother')
    const scale2 = calculateZoomScale(100, 5000, 4, 800, 200, 'smoother')

    // With minimum constraint, both should behave similarly
    expect(Math.abs(scale1 - scale2)).toBeLessThan(0.1)
  })

  it('respects zero intro for instant zoom', () => {
    // With introMs=0, should jump to target scale immediately
    const scaleInstant = calculateZoomScale(0, 5000, 4, 0, 0, 'smoother')
    expect(scaleInstant).toBe(4) // Already at target scale
  })

  it('returns 1 at start and targetScale at end of intro', () => {
    const scaleStart = calculateZoomScale(0, 5000, 3, 1000, 500, 'smoother')
    const scaleEnd = calculateZoomScale(1000, 5000, 3, 1000, 500, 'smoother')

    expect(scaleStart).toBe(1)
    expect(scaleEnd).toBe(3)
  })
})

describe('getEffectiveZoomEaseDurations with scale', () => {
  it('applies scale-based minimums when user sets non-zero value', () => {
    // 4x zoom with 200ms user setting should get boosted to 800ms
    const result = getEffectiveZoomEaseDurations(5000, 200, 200, 4)
    expect(result.introMs).toBeGreaterThanOrEqual(800)
    expect(result.outroMs).toBeGreaterThanOrEqual(800)
  })

  it('respects zero values for instant zoom', () => {
    // If user sets 0, they want instant zoom - don't apply minimum
    const result = getEffectiveZoomEaseDurations(5000, 0, 0, 4)
    expect(result.introMs).toBe(0)
    expect(result.outroMs).toBe(0)
  })

  it('preserves user values when above minimum', () => {
    const result = getEffectiveZoomEaseDurations(5000, 1500, 1500, 2)
    expect(result.introMs).toBe(1500)
    expect(result.outroMs).toBe(1500)
  })

  it('works without scale parameter (backward compatibility)', () => {
    const result = getEffectiveZoomEaseDurations(5000, 500, 500)
    expect(result.introMs).toBe(500)
    expect(result.outroMs).toBe(500)
  })
})

// =============================================================================
// INTEGRATION TESTS for calculateZoomTransform
// =============================================================================

describe('calculateZoomTransform integration tests', () => {
  const createBlock = (overrides: Partial<any> = {}): any => ({
    startTime: 0,
    endTime: 5000,
    scale: 3,
    introMs: 1000,
    outroMs: 1000,
    ...overrides,
  })

  describe('intro phase progression', () => {
    it('scale progresses from 1 to targetScale during intro', () => {
      const block = createBlock({ scale: 3, introMs: 1000, outroMs: 1000 })

      // At start: scale = 1
      const t0 = calculateZoomTransform(block, 0, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t0.scale).toBe(1)

      // Mid-intro: scale between 1 and 3
      const t500 = calculateZoomTransform(block, 500, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t500.scale).toBeGreaterThan(1)
      expect(t500.scale).toBeLessThan(3)

      // End of intro: scale = targetScale
      const t1000 = calculateZoomTransform(block, 1000, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t1000.scale).toBe(3)
    })

    it('scale is monotonically increasing during intro', () => {
      const block = createBlock({ scale: 2.5, introMs: 800 })
      let prevScale = 1

      for (let t = 0; t <= 800; t += 50) {
        const transform = calculateZoomTransform(block, t, 1920, 1080, { x: 0.5, y: 0.5 })
        expect(transform.scale).toBeGreaterThanOrEqual(prevScale)
        prevScale = transform.scale
      }
    })
  })

  describe('hold phase', () => {
    it('maintains exact target scale during hold', () => {
      const block = createBlock({ scale: 2, introMs: 500, outroMs: 500, endTime: 3000 })

      // Sample during hold phase (500ms - 2500ms)
      const times = [600, 1000, 1500, 2000, 2400]
      for (const t of times) {
        const transform = calculateZoomTransform(block, t, 1920, 1080, { x: 0.5, y: 0.5 })
        expect(transform.scale).toBe(2)
      }
    })

    it('has no refocus blur during hold phase', () => {
      const block = createBlock({ scale: 2, introMs: 500, outroMs: 500, endTime: 3000 })

      // Mid-hold: no blur
      const transform = calculateZoomTransform(block, 1500, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(transform.refocusBlur).toBe(0)
    })
  })

  describe('outro phase progression', () => {
    it('scale progresses from targetScale back to 1 during outro', () => {
      const block = createBlock({ scale: 3, introMs: 1000, outroMs: 1000, endTime: 5000 })

      // Start of outro (4000ms): scale = 3
      const t4000 = calculateZoomTransform(block, 4000, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t4000.scale).toBe(3)

      // Mid-outro: scale between 1 and 3
      const t4500 = calculateZoomTransform(block, 4500, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t4500.scale).toBeGreaterThan(1)
      expect(t4500.scale).toBeLessThan(3)

      // End of outro: scale = 1
      const t5000 = calculateZoomTransform(block, 5000, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t5000.scale).toBe(1)
    })

    it('scale is monotonically decreasing during outro', () => {
      const block = createBlock({ scale: 2.5, introMs: 500, outroMs: 800, endTime: 3000 })
      let prevScale = 2.5
      const outroStart = 3000 - 800 // 2200ms

      for (let t = outroStart; t <= 3000; t += 50) {
        const transform = calculateZoomTransform(block, t, 1920, 1080, { x: 0.5, y: 0.5 })
        expect(transform.scale).toBeLessThanOrEqual(prevScale)
        prevScale = transform.scale
      }
    })
  })

  describe('refocus blur during transitions', () => {
    it('has refocus blur during intro that peaks mid-transition', () => {
      const block = createBlock({ scale: 2, introMs: 1000 })

      // Start: no blur
      const t0 = calculateZoomTransform(block, 0, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t0.refocusBlur).toBe(0)

      // Mid-intro: blur peaks
      const t500 = calculateZoomTransform(block, 500, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t500.refocusBlur).toBeGreaterThan(0)

      // End of intro: blur returns to 0
      const t1000 = calculateZoomTransform(block, 1000, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t1000.refocusBlur).toBeCloseTo(0, 5)
    })

    it('respects disableRefocusBlur flag', () => {
      const block = createBlock({ scale: 2, introMs: 1000 })

      // Mid-intro with blur disabled
      const transform = calculateZoomTransform(
        block, 500, 1920, 1080, { x: 0.5, y: 0.5 },
        undefined, undefined, true // disableRefocusBlur = true
      )
      expect(transform.refocusBlur).toBe(0)
    })
  })

  describe('pan calculations', () => {
    it('pans toward off-center zoom targets', () => {
      const block = createBlock({ scale: 2 })

      // Zoom center at top-left (0.2, 0.2)
      const transformTopLeft = calculateZoomTransform(block, 1500, 1920, 1080, { x: 0.2, y: 0.2 })

      // Zoom center at bottom-right (0.8, 0.8)
      const transformBottomRight = calculateZoomTransform(block, 1500, 1920, 1080, { x: 0.8, y: 0.8 })

      // Pan should be in opposite directions
      expect(transformTopLeft.panX).toBeGreaterThan(0) // Pan right to show left content
      expect(transformBottomRight.panX).toBeLessThan(0) // Pan left to show right content
    })

    it('no pan when zoom center is at center', () => {
      const block = createBlock({ scale: 2, introMs: 500, outroMs: 500, endTime: 2000 })

      // During hold phase with center zoom
      const transform = calculateZoomTransform(block, 1000, 1920, 1080, { x: 0.5, y: 0.5 })

      // Pan should be zero when centered
      expect(transform.panX).toBeCloseTo(0, 5)
      expect(transform.panY).toBeCloseTo(0, 5)
    })

    it('pan scales with zoom level', () => {
      const block = createBlock({ scale: 3, introMs: 500, outroMs: 500, endTime: 2000 })

      // During intro - pan should increase with scale
      const t200 = calculateZoomTransform(block, 200, 1920, 1080, { x: 0.3, y: 0.5 })
      const t400 = calculateZoomTransform(block, 400, 1920, 1080, { x: 0.3, y: 0.5 })

      // As scale increases, pan magnitude should increase
      expect(Math.abs(t400.panX)).toBeGreaterThan(Math.abs(t200.panX))
    })
  })

  describe('edge cases', () => {
    it('returns identity transform when no block provided', () => {
      const transform = calculateZoomTransform(undefined, 1000, 1920, 1080, { x: 0.5, y: 0.5 })

      expect(transform.scale).toBe(1)
      expect(transform.panX).toBe(0)
      expect(transform.panY).toBe(0)
      expect(transform.refocusBlur).toBe(0)
    })

    it('handles zero-duration block gracefully', () => {
      const block = createBlock({ startTime: 1000, endTime: 1000, scale: 2 })

      const transform = calculateZoomTransform(block, 1000, 1920, 1080, { x: 0.5, y: 0.5 })

      // Should not crash, return reasonable values
      expect(transform.scale).toBeDefined()
      expect(isNaN(transform.scale)).toBe(false)
    })

    it('handles time before block start', () => {
      const block = createBlock({ startTime: 1000, endTime: 5000, scale: 2 })

      const transform = calculateZoomTransform(block, 500, 1920, 1080, { x: 0.5, y: 0.5 })

      // Before block starts, should be at scale 1
      expect(transform.scale).toBe(1)
    })

    it('handles time after block end', () => {
      const block = createBlock({ startTime: 0, endTime: 3000, scale: 2 })

      const transform = calculateZoomTransform(block, 4000, 1920, 1080, { x: 0.5, y: 0.5 })

      // After block ends, should be back at scale 1
      expect(transform.scale).toBe(1)
    })

    it('handles overlapping intro/outro on short blocks', () => {
      // Block is only 500ms but intro+outro = 2000ms
      const block = createBlock({
        startTime: 0,
        endTime: 500,
        scale: 2,
        introMs: 1000,
        outroMs: 1000
      })

      // Should normalize intro/outro to fit within block
      const t0 = calculateZoomTransform(block, 0, 1920, 1080, { x: 0.5, y: 0.5 })
      const t250 = calculateZoomTransform(block, 250, 1920, 1080, { x: 0.5, y: 0.5 })
      const t500 = calculateZoomTransform(block, 500, 1920, 1080, { x: 0.5, y: 0.5 })

      // Should still produce smooth, valid transforms
      expect(t0.scale).toBe(1)
      expect(t250.scale).toBeGreaterThanOrEqual(1)
      expect(t500.scale).toBe(1)
    })
  })

  describe('deep zoom minimum duration enforcement', () => {
    it('enforces minimum duration for 4x zoom', () => {
      // 4x zoom should have minimum 800ms intro
      const block = createBlock({ scale: 4, introMs: 200, outroMs: 200, endTime: 5000 })

      // At 200ms (user-requested intro end), should still be transitioning
      // because minimum duration for 4x is 800ms
      const t200 = calculateZoomTransform(block, 200, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t200.scale).toBeLessThan(4)

      // At 800ms (enforced minimum), should be at target
      const t800 = calculateZoomTransform(block, 800, 1920, 1080, { x: 0.5, y: 0.5 })
      expect(t800.scale).toBe(4)
    })
  })
})

