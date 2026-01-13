import { calculateZoomTransform, getZoomTransformString } from '@/features/rendering/canvas/math/transforms/zoom-transform'

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

