
import { interpolateMousePosition } from '@/lib/effects/utils/mouse-interpolation'
import type { MouseEvent } from '@/types/project'

describe('interpolateMousePosition', () => {
  const baseEvent = {
    screenWidth: 1920,
    screenHeight: 1080,
    captureWidth: 1920,
    captureHeight: 1080
  }

  it('interpolates correctly based on timestamp', () => {
    // Note: implementation uses .timestamp, so we test against that.
    const events: MouseEvent[] = [
      { ...baseEvent, x: 0, y: 0, timestamp: 5000 },
      { ...baseEvent, x: 100, y: 100, timestamp: 6000 }
    ]

    const result = interpolateMousePosition(events, 5500)

    expect(result).not.toBeNull()
    expect(result!.x).toBeCloseTo(50, 5)
    expect(result!.y).toBeCloseTo(50, 5)
  })

  it('falls back to bounds when outside range', () => {
    const events: MouseEvent[] = [
      { ...baseEvent, x: 10, y: 10, timestamp: 0 },
      { ...baseEvent, x: 20, y: 20, timestamp: 1000 }
    ]

    const result = interpolateMousePosition(events, 1500)

    expect(result).not.toBeNull()
    expect(result!.x).toBe(20)
  })
})
