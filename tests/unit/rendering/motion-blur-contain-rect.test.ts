import { calculateContainRect } from '@/features/rendering/motion-blur/logic/MotionBlurController'

describe('MotionBlurController.calculateContainRect', () => {
  it('letterboxes wider sources into a taller container (contain)', () => {
    // Container roughly matches the screen recording canvas aspect (3218x2960 ≈ 1.0867)
    const containerWidth = 660
    const containerHeight = 607

    // Source is 16:9
    const sourceWidth = 1280
    const sourceHeight = 720

    const rect = calculateContainRect(containerWidth, containerHeight, sourceWidth, sourceHeight)

    // Fit by width -> height shrinks, centered vertically.
    expect(rect.x).toBeCloseTo(0, 3)
    expect(rect.width).toBeCloseTo(containerWidth, 3)
    expect(rect.height).toBeCloseTo(containerWidth / (sourceWidth / sourceHeight), 3)
    expect(rect.y).toBeCloseTo((containerHeight - rect.height) / 2, 3)
  })

  it('pillarboxes taller sources into a wider container (contain)', () => {
    const containerWidth = 660
    const containerHeight = 371

    // Source is tall
    const sourceWidth = 720
    const sourceHeight = 1280

    const rect = calculateContainRect(containerWidth, containerHeight, sourceWidth, sourceHeight)

    // Fit by height -> width shrinks, centered horizontally.
    expect(rect.y).toBeCloseTo(0, 3)
    expect(rect.height).toBeCloseTo(containerHeight, 3)
    expect(rect.width).toBeCloseTo(containerHeight * (sourceWidth / sourceHeight), 3)
    expect(rect.x).toBeCloseTo((containerWidth - rect.width) / 2, 3)
  })
})

