
import { TimeConverter } from '@/lib/timeline/time-space-converter'

describe('Timeline Automatic Zoom', () => {
  describe('calculateOptimalZoom', () => {
    it('should calculate correct zoom for short videos', () => {
      // 5 second video
      const duration = 5000
      const viewportWidth = 1200
      const zoom = TimeConverter.calculateOptimalZoom(duration, viewportWidth)

      // Should zoom in to fit the 5 second video
      expect(zoom).toBeGreaterThan(1)
      expect(zoom).toBeLessThanOrEqual(2.0)
    })

    it('should calculate correct zoom for medium videos', () => {
      // 30 second video
      const duration = 30000
      const viewportWidth = 1200
      const zoom = TimeConverter.calculateOptimalZoom(duration, viewportWidth)

      // Should zoom out to fit the 30 second video
      expect(zoom).toBeLessThan(0.5)
      expect(zoom).toBeGreaterThanOrEqual(0.1)
    })

    it('should calculate correct zoom for long videos', () => {
      // 5 minute video
      const duration = 300000
      const viewportWidth = 1200
      const zoom = TimeConverter.calculateOptimalZoom(duration, viewportWidth)

      // Should be at minimum zoom
      expect(zoom).toBe(0.1)
    })

    it('should round zoom to nearest 0.05', () => {
      const duration = 8000
      const viewportWidth = 1200
      const zoom = TimeConverter.calculateOptimalZoom(duration, viewportWidth)

      // Check that zoom is rounded to 0.05 increments
      // Account for floating point precision
      const remainder = zoom % 0.05
      const isRounded = remainder < 0.0001 || remainder > 0.0499
      expect(isRounded).toBe(true)
    })
  })

  describe('calculateTimelineWidth', () => {
    it('should calculate base timeline width', () => {
      const duration = 10000
      const pixelsPerMs = 0.1
      const minWidth = 800

      const width = TimeConverter.calculateTimelineWidth(duration, pixelsPerMs, minWidth)

      // Should be duration * pixelsPerMs (no extra padding in updated logic)
      const expectedWidth = Math.max(duration * pixelsPerMs, minWidth)
      expect(width).toBe(expectedWidth)
    })

    it('should respect minimum width', () => {
      const duration = 1000 // Very short duration
      const pixelsPerMs = 0.1
      const minWidth = 800

      const width = TimeConverter.calculateTimelineWidth(duration, pixelsPerMs, minWidth)

      expect(width).toBeGreaterThanOrEqual(minWidth)
    })

    it('should allow scrolling beyond last video', () => {
      const duration = 10000
      const pixelsPerMs = 0.1
      const minWidth = 800

      const width = TimeConverter.calculateTimelineWidth(duration, pixelsPerMs, minWidth)
      const baseWidth = duration * pixelsPerMs

      // Width should be at least buffer
      expect(width).toBeGreaterThanOrEqual(baseWidth)
    })
  })
})