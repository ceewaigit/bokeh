import { calculateCursorState } from '@/features/effects/cursor/logic/cursor-logic'
import { DEFAULT_CURSOR_DATA } from '@/features/effects/cursor/config'

describe('cursor smoothing stability', () => {
  it('does not jitter when input stops with small noise', () => {
    const cursorData = { ...DEFAULT_CURSOR_DATA, gliding: true, speed: 0.2, smoothness: 0.85 }

    // Cursor moves to ~100,100 then "stops" but with tiny +/-1px noise.
    const mouseEvents: any[] = [
      { timestamp: 0, x: 0, y: 0, cursorType: 'default' },
      { timestamp: 50, x: 80, y: 80, cursorType: 'default' },
      { timestamp: 100, x: 100, y: 100, cursorType: 'default' },
      { timestamp: 133, x: 101, y: 99, cursorType: 'default' },
      { timestamp: 166, x: 99, y: 101, cursorType: 'default' },
      { timestamp: 200, x: 100, y: 100, cursorType: 'default' },
    ]

    const outputs: Array<{ x: number; y: number }> = []
    // Warm up from t=0 so smoothing has consistent input history.
    for (let t = 0; t <= 240; t += 16.667) {
      const state = calculateCursorState(cursorData as any, mouseEvents, [], t, 60, false)
      outputs.push({ x: state.x, y: state.y })
    }

    // Success criteria: once near the target, frame-to-frame movement should be small.
    const deltas = outputs.slice(1).map((p, idx) => {
      const prev = outputs[idx]
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      return Math.sqrt(dx * dx + dy * dy)
    })

    // Ignore early movement; evaluate only after we're in the "stopped" region.
    const settleStartIndex = Math.floor(200 / 16.667)
    const tailDeltas = deltas.slice(settleStartIndex)
    const maxDelta = Math.max(...tailDeltas)
    expect(maxDelta).toBeLessThan(8.0)
  })
})
