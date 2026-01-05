import { resolveClipFade } from '@/features/rendering/renderer/compositions/utils/effects/clip-fade'

describe('resolveClipFade', () => {
  it('returns no parent fade when no fades are set', () => {
    const result = resolveClipFade({
      clip: {},
      layout: { padding: 40, shadowIntensity: 40, mockupEnabled: true },
      currentFrame: 0,
      startFrame: 0,
      durationFrames: 120,
      fps: 30,
    })

    expect(result.clipFadeOpacity).toBe(1)
    expect(result.useParentFade).toBe(false)
  })

  it('uses parent fade when look window is enabled and fade is active', () => {
    const result = resolveClipFade({
      clip: { introFadeMs: 500 },
      layout: { padding: 40, shadowIntensity: 40, mockupEnabled: false },
      currentFrame: 0,
      startFrame: 0,
      durationFrames: 120,
      fps: 30,
    })

    expect(result.clipFadeOpacity).toBe(0)
    expect(result.useParentFade).toBe(true)
  })

  it('does not force parent fade when look window is off', () => {
    const result = resolveClipFade({
      clip: { introFadeMs: 500 },
      layout: { padding: 0, shadowIntensity: 0, mockupEnabled: false },
      currentFrame: 0,
      startFrame: 0,
      durationFrames: 120,
      fps: 30,
    })

    expect(result.clipFadeOpacity).toBe(0)
    expect(result.useParentFade).toBe(false)
  })
})
