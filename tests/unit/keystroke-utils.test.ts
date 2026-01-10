import type { KeystrokeEffectData } from '@/types/project'
import { DEFAULT_KEYSTROKE_DATA } from '@/features/effects/keystroke/config'
import { computeKeystrokeSegments, getKeystrokeDisplayState } from '@/features/effects/keystroke/utils'

describe('keystroke utils', () => {
  test('computeKeystrokeSegments sorts events and buffers typing', () => {
    const options = {
      ...DEFAULT_KEYSTROKE_DATA,
      displayDuration: 500,
      fadeOutDuration: 100,
      showShortcuts: true,
      showModifierSymbols: true,
    } as Required<KeystrokeEffectData>

    const events = [
      { timestamp: 200, key: 'c', modifiers: [] },
      { timestamp: 0, key: 'a', modifiers: [] },
      { timestamp: 100, key: 'b', modifiers: [] },
    ]

    const segments = computeKeystrokeSegments(events as any, options)
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('abc')
    expect(segments[0].startTime).toBe(0)
    expect(segments[0].endTime).toBe(700)
    expect(segments[0].charTimestamps).toEqual([0, 100, 200])
  })

  test('getKeystrokeDisplayState reveals characters over time', () => {
    const options = {
      ...DEFAULT_KEYSTROKE_DATA,
      displayDuration: 500,
      fadeOutDuration: 100,
      showShortcuts: true,
      showModifierSymbols: true,
    } as Required<KeystrokeEffectData>

    const events = [
      { timestamp: 0, key: 'a', modifiers: [] },
      { timestamp: 100, key: 'b', modifiers: [] },
      { timestamp: 200, key: 'c', modifiers: [] },
    ]

    const segments = computeKeystrokeSegments(events as any, options)

    expect(getKeystrokeDisplayState(segments, -1, options)).toBeNull()

    const at150 = getKeystrokeDisplayState(segments, 150, options)
    expect(at150?.text).toBe('ab')
    expect((at150?.opacity ?? 0)).toBeGreaterThan(0)

    const at250 = getKeystrokeDisplayState(segments, 250, options)
    expect(at250?.text).toBe('abc')
    expect((at250?.opacity ?? 0)).toBeGreaterThan(0)
  })
})

