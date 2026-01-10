import { getHighlightWeight, mixColors, scaleAlpha } from '@/features/rendering/renderer/compositions/layers/subtitle-highlight'

describe('subtitle-highlight', () => {
  test('getHighlightWeight ramps in and out deterministically', () => {
    const word = { id: 'w1', text: 'hello', startTime: 1000, endTime: 1200 }
    const transitionMs = 100

    expect(getHighlightWeight(999, word as any, transitionMs)).toBe(0)
    expect(getHighlightWeight(1000, word as any, transitionMs)).toBe(0)
    expect(getHighlightWeight(1050, word as any, transitionMs)).toBeCloseTo(0.5, 5)
    expect(getHighlightWeight(1100, word as any, transitionMs)).toBe(1)
    expect(getHighlightWeight(1199, word as any, transitionMs)).toBe(1)
    expect(getHighlightWeight(1200, word as any, transitionMs)).toBe(1)
    expect(getHighlightWeight(1250, word as any, transitionMs)).toBeCloseTo(0.5, 5)
    expect(getHighlightWeight(1300, word as any, transitionMs)).toBe(0)
    expect(getHighlightWeight(1400, word as any, transitionMs)).toBe(0)
  })

  test('mixColors blends rgba for supported formats', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('rgba(128, 128, 128, 1)')
    expect(mixColors('rgb(0, 0, 0)', 'rgb(255, 255, 255)', 0.5)).toBe('rgba(128, 128, 128, 1)')
    expect(mixColors('rgba(0, 0, 0, 0.2)', 'rgba(0, 0, 0, 1)', 0.5)).toBe('rgba(0, 0, 0, 0.6)')
  })

  test('mixColors falls back for unsupported formats', () => {
    expect(mixColors('red', 'blue', 0.49)).toBe('red')
    expect(mixColors('red', 'blue', 0.5)).toBe('blue')
  })

  test('scaleAlpha multiplies alpha for rgba', () => {
    expect(scaleAlpha('rgba(10, 20, 30, 0.8)', 0.5)).toBe('rgba(10, 20, 30, 0.4)')
  })
})

