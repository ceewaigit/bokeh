import { calculateCameraMotionBlurFromCenters, calculateCameraMotionBlurFromDelta } from '@/remotion/compositions/utils/zoom-transform'

describe('zoom-transform camera motion blur', () => {
  test('does not blur during pure zoom (no center movement)', () => {
    const cfg = { maxBlurRadius: 6, velocityThreshold: 5, intensityMultiplier: 0.2 }
    const prev = calculateCameraMotionBlurFromCenters(
      { x: 0.5, y: 0.5 },
      1,
      { x: 0.5, y: 0.5 },
      2,
      1920,
      1080,
      cfg
    )
    expect(prev.blurRadius).toBe(0)
  })

  test('blurs based on center pan (direction matches content motion)', () => {
    const cfg = { maxBlurRadius: 6, velocityThreshold: 5, intensityMultiplier: 0.2 }
    const out = calculateCameraMotionBlurFromCenters(
      { x: 0.5, y: 0.5 },
      2,
      { x: 0.55, y: 0.5 },
      2,
      1000,
      1000,
      cfg
    )

    expect(out.blurRadius).toBeGreaterThan(0)
    // Camera center moved right -> content translates left -> angle should be ~180deg.
    expect(Math.abs(Math.abs(out.angle) - 180)).toBeLessThan(1e-6)
  })

  test('eases blur onset (small motion < big motion)', () => {
    const cfg = { maxBlurRadius: 6, velocityThreshold: 5, intensityMultiplier: 0.2 }
    const small = calculateCameraMotionBlurFromDelta(6, 0, cfg) // barely above threshold
    const big = calculateCameraMotionBlurFromDelta(60, 0, cfg)

    expect(small.blurRadius).toBeGreaterThan(0)
    expect(big.blurRadius).toBeGreaterThan(small.blurRadius)
    expect(big.blurRadius).toBeLessThanOrEqual(cfg.maxBlurRadius)
  })
})

