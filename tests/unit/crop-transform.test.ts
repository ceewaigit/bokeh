import { calculateCropTransform, getCropTransformString } from '@/remotion/compositions/utils/crop-transform'

describe('crop-transform', () => {
  it('returns identity for full-frame crop', () => {
    const t = calculateCropTransform({ x: 0, y: 0, width: 1, height: 1 }, 1920, 1080)
    expect(t.isActive).toBe(false)
    expect(getCropTransformString(t)).toBe('')
  })

  it('centers a top-left quadrant crop', () => {
    const t = calculateCropTransform({ x: 0, y: 0, width: 0.5, height: 0.5 }, 100, 100)
    expect(t.isActive).toBe(true)
    expect(t.scale).toBeCloseTo(2, 6)
    expect(t.translateX).toBeCloseTo(50, 6)
    expect(t.translateY).toBeCloseTo(50, 6)
    expect(getCropTransformString(t)).toContain('scale3d(2')
  })
})

