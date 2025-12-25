import { calculateCropTransform, isFullFrameCrop, clampCropData } from '@/remotion/compositions/utils/transforms/crop-transform'

describe('crop-transform', () => {
  describe('calculateCropTransform', () => {
    it('returns identity for full-frame crop', () => {
      const t = calculateCropTransform({ x: 0, y: 0, width: 1, height: 1 }, 1920, 1080)
      expect(t.isActive).toBe(false)
    })

    it('scales a 50% crop to 2x (uniform based on min scale)', () => {
      const t = calculateCropTransform({ x: 0, y: 0, width: 0.5, height: 0.5 }, 100, 100)
      expect(t.isActive).toBe(true)
      expect(t.scale).toBeCloseTo(2, 6) // min(1/0.5, 1/0.5) = 2
      expect(t.clipPath).toBeDefined()
    })

    it('uses min scale logic (constrained by width)', () => {
      // Width 50% (scale 2), Height 25% (scale 4) -> Min scale 2
      const t = calculateCropTransform({ x: 0.25, y: 0.375, width: 0.5, height: 0.25 }, 100, 100)
      expect(t.isActive).toBe(true)
      expect(t.scale).toBeCloseTo(2, 6)
      expect(t.clipPath).toBe('inset(37.50% 25.00% 37.50% 25.00%)')
    })

    it('uses min scale logic (constrained by height)', () => {
      // Width 25% (scale 4), Height 50% (scale 2) -> Min scale 2
      const t = calculateCropTransform({ x: 0.375, y: 0.25, width: 0.25, height: 0.5 }, 100, 100)
      expect(t.isActive).toBe(true)
      expect(t.scale).toBeCloseTo(2, 6)
      expect(t.clipPath).toBe('inset(25.00% 37.50% 25.00% 37.50%)')
    })

    it('centers a centered crop (no translation)', () => {
      const t = calculateCropTransform({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 100, 100)
      expect(t.translateX).toBeCloseTo(0, 6)
      expect(t.translateY).toBeCloseTo(0, 6)
    })

    it('translates correctly for off-center crops', () => {
      const t = calculateCropTransform({ x: 0, y: 0, width: 0.5, height: 0.5 }, 100, 100)
      expect(t.translateX).toBeCloseTo(50, 6)
      expect(t.translateY).toBeCloseTo(50, 6)
    })
  })

  describe('isFullFrameCrop', () => {
    it('returns true for exact full frame', () => {
      expect(isFullFrameCrop({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
    })
  })

  describe('clampCropData', () => {
    it('clamps crop to valid bounds', () => {
      const clamped = clampCropData({ x: -0.5, y: 1.5, width: 2, height: 0.01 })
      expect(clamped.x).toBe(0)
      expect(clamped.width).toBe(1)
    })
  })
})
