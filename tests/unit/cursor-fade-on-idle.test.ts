import { calculateCursorState } from '@/lib/effects/utils/cursor-calculator'
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'
import type { CursorEffectData, MouseEvent } from '@/types/project'

function createMouseEvents(): MouseEvent[] {
  return [
    { timestamp: 0, x: 0, y: 0, screenWidth: 100, screenHeight: 100, cursorType: 'default' },
    { timestamp: 4000, x: 10, y: 10, screenWidth: 100, screenHeight: 100, cursorType: 'default' },
  ]
}

describe('calculateCursorState (fade on idle)', () => {
  it('fades out near the idle timeout when enabled', () => {
    const cursorData: CursorEffectData = {
      ...DEFAULT_CURSOR_DATA,
      hideOnIdle: true,
      fadeOnIdle: true,
      idleTimeout: 3000,
    }

    const state = calculateCursorState(cursorData, createMouseEvents(), [], 2950)
    expect(state.visible).toBe(true)
    expect(state.opacity).toBeCloseTo(1 - (2950 - 2700) / 300, 3)
  })

  it('fades in after a wake movement when enabled', () => {
    const cursorData: CursorEffectData = {
      ...DEFAULT_CURSOR_DATA,
      hideOnIdle: true,
      fadeOnIdle: true,
      idleTimeout: 3000,
    }

    const stateSoonAfterWake = calculateCursorState(cursorData, createMouseEvents(), [], 4050)
    expect(stateSoonAfterWake.visible).toBe(true)
    expect(stateSoonAfterWake.opacity).toBeGreaterThan(0)
    expect(stateSoonAfterWake.opacity).toBeLessThan(1)

    const stateAfterFadeIn = calculateCursorState(cursorData, createMouseEvents(), [], 4200)
    expect(stateAfterFadeIn.visible).toBe(true)
    expect(stateAfterFadeIn.opacity).toBeCloseTo(1, 3)
  })

  it('hides/shows instantly when fade is disabled', () => {
    const cursorData: CursorEffectData = {
      ...DEFAULT_CURSOR_DATA,
      hideOnIdle: true,
      fadeOnIdle: false,
      idleTimeout: 3000,
    }

    const stateBeforeTimeout = calculateCursorState(cursorData, createMouseEvents(), [], 2950)
    expect(stateBeforeTimeout.visible).toBe(true)
    expect(stateBeforeTimeout.opacity).toBeCloseTo(1, 3)

    const stateAfterTimeout = calculateCursorState(cursorData, createMouseEvents(), [], 3500)
    expect(stateAfterTimeout.visible).toBe(false)
    expect(stateAfterTimeout.opacity).toBeCloseTo(0, 3)

    const stateAfterWake = calculateCursorState(cursorData, createMouseEvents(), [], 4050)
    expect(stateAfterWake.visible).toBe(true)
    expect(stateAfterWake.opacity).toBeCloseTo(1, 3)
  })
})

