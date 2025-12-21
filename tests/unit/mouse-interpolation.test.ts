import { interpolateMousePosition } from '@/lib/effects/utils/mouse-interpolation'

describe('interpolateMousePosition', () => {
  it('does not overshoot between segment endpoints', () => {
    const mouseEvents: any[] = [
      { timestamp: 0, x: 0, y: 0 },
      { timestamp: 10, x: 0, y: 0 },
      { timestamp: 20, x: 100, y: 100 },
      { timestamp: 30, x: 100, y: 100 },
      { timestamp: 40, x: 200, y: 200 },
    ]

    // Sample within the 0->100 segment; result must stay within [0, 100] for both axes.
    const pos = interpolateMousePosition(mouseEvents, 15)
    expect(pos).not.toBeNull()
    expect(pos!.x).toBeGreaterThanOrEqual(0)
    expect(pos!.x).toBeLessThanOrEqual(100)
    expect(pos!.y).toBeGreaterThanOrEqual(0)
    expect(pos!.y).toBeLessThanOrEqual(100)
  })

  it('falls back to simple interpolation for duplicate timestamps', () => {
    const mouseEvents: any[] = [
      { timestamp: 0, x: 0, y: 0 },
      { timestamp: 10, x: 10, y: 10 },
      { timestamp: 10, x: 20, y: 20 }, // duplicate timestamp
      { timestamp: 20, x: 30, y: 30 },
    ]

    const pos = interpolateMousePosition(mouseEvents, 10)
    expect(pos).not.toBeNull()
    // Must be a finite coordinate (no NaN/Infinity).
    expect(Number.isFinite(pos!.x)).toBe(true)
    expect(Number.isFinite(pos!.y)).toBe(true)
  })
})

