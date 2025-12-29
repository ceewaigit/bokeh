import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'
import { calculateCursorState } from '@/features/effects/utils/cursor-calculator'
import type { MouseEvent } from '@/types/project'

describe('cursor directional tilt', () => {
  const baseEvent = {
    screenWidth: 1920,
    screenHeight: 1080,
    captureWidth: 1920,
    captureHeight: 1080,
  }

  it('does nothing when disabled', () => {
    const events: MouseEvent[] = [
      { ...baseEvent, x: 0, y: 0, timestamp: 0 },
      { ...baseEvent, x: 200, y: 0, timestamp: 100 },
    ]

    const data = {
      ...DEFAULT_CURSOR_DATA,
      directionalTilt: false,
      gliding: false,
      hideOnIdle: false,
    }

    const state = calculateCursorState(data, events, [], 100, 60, false)
    expect(state.rotation ?? 0).toBe(0)
    expect(state.tiltX ?? 0).toBe(0)
    expect(state.tiltY ?? 0).toBe(0)
  })

  it('banks in direction of travel and eases back to 0 when stopped', () => {
    const events: MouseEvent[] = [
      { ...baseEvent, x: 0, y: 0, timestamp: 0 },
      { ...baseEvent, x: 200, y: 0, timestamp: 100 },
      { ...baseEvent, x: 200, y: 0, timestamp: 300 },
    ]

    const data = {
      ...DEFAULT_CURSOR_DATA,
      directionalTilt: true,
      directionalTiltMaxDeg: 12,
      gliding: false,
      hideOnIdle: false,
    }

    const stateMoving = calculateCursorState(data, events, [], 100, 60, false)
    // Resistance: moving right => lean left (negative rotateY)
    expect(stateMoving.tiltY ?? 0).toBeGreaterThan(0)

    const stateStopped1 = calculateCursorState(data, events, [], 200, 60, false)
    expect(Math.abs(stateStopped1.tiltY ?? 0)).toBeLessThanOrEqual(Math.abs(stateMoving.tiltY ?? 0))

    const stateStopped2 = calculateCursorState(data, events, [], 260, 60, false)
    expect(Math.abs(stateStopped2.tiltY ?? 0)).toBeLessThan(Math.abs(stateStopped1.tiltY ?? 0))
  })
})
