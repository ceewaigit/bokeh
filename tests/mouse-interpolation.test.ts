import { interpolateMousePosition } from '@/lib/effects/utils/mouse-interpolation'
import type { MouseEvent } from '@/types/project'

describe('interpolateMousePosition', () => {
  const baseEvent = {
    screenWidth: 1920,
    screenHeight: 1080,
    captureWidth: 1920,
    captureHeight: 1080
  }

  it('uses sourceTimestamp when present to interpolate in source space', () => {
    const events: MouseEvent[] = [
      { ...baseEvent, x: 0, y: 0, timestamp: 0, sourceTimestamp: 5000 },
      { ...baseEvent, x: 100, y: 100, timestamp: 1000, sourceTimestamp: 6000 }
    ]

    const result = interpolateMousePosition(events, 5500)

    expect(result).not.toBeNull()
    expect(result!.x).toBeCloseTo(50, 5)
    expect(result!.y).toBeCloseTo(50, 5)
  })

  it('falls back to timestamp when sourceTimestamp is undefined', () => {
    const events: MouseEvent[] = [
      { ...baseEvent, x: 10, y: 10, timestamp: 0 },
      { ...baseEvent, x: 20, y: 20, timestamp: 1000 }
    ]

    const result = interpolateMousePosition(events, 500)

    expect(result).not.toBeNull()
    expect(result!.x).toBeGreaterThan(10)
    expect(result!.x).toBeLessThan(20)
  })
})
