import { getVideoShadowStyle } from '@/features/rendering/renderer/compositions/utils/shadow-style'

describe('getVideoShadowStyle', () => {
  it('uses drop-shadow when content is letterboxed/pillarboxed (shadow wraps video pixels, not frame)', () => {
    const style = getVideoShadowStyle({
      shadowIntensity: 50,
      mockupEnabled: false,
      frameWidth: 3218,
      frameHeight: 2960,
      sourceWidth: 1920,
      sourceHeight: 1080,
    })

    expect(style.filter).toContain('drop-shadow(')
    expect(style.boxShadow).toBeUndefined()
  })

  it('uses box-shadow when the active content fills the frame (perf)', () => {
    const style = getVideoShadowStyle({
      shadowIntensity: 50,
      mockupEnabled: false,
      frameWidth: 1920,
      frameHeight: 1080,
      sourceWidth: 1920,
      sourceHeight: 1080,
    })

    expect(style.boxShadow).toContain('rgba(0,0,0,')
    expect(style.filter).toBeUndefined()
  })
})
