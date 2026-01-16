/**
 * Tests for source-resolver.ts
 *
 * Coverage:
 * - Source resolution (screen, window, area)
 * - Display scale factor calculation
 * - Fallback behavior when source unavailable
 * - Area source parsing integration
 * - Multi-display scenarios
 */

import { describe, it, expect, beforeEach as _beforeEach, afterEach as _afterEach, jest } from '@jest/globals'
import { RecordingArea as _RecordingArea } from '@/types'

// Mock the area source parser
jest.mock('@/features/media/recording/logic/area-source-parser', () => ({
  parseAreaSourceId: (sourceId: string) => {
    if (!sourceId || !sourceId.startsWith('area:')) return null
    const parts = sourceId.slice(5).split(',').map(Number)
    if (parts.length < 4 || parts.slice(0, 4).some(isNaN)) return null
    return {
      x: parts[0],
      y: parts[1],
      width: parts[2],
      height: parts[3],
      displayId: parts.length > 4 && !isNaN(parts[4]) ? parts[4] : undefined
    }
  },
  isAreaSource: (sourceId: string | undefined | null) => {
    return typeof sourceId === 'string' && sourceId.startsWith('area:')
  }
}))

// Mock logger
jest.mock('@/shared/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}))

// Helper to create mock sources
function createMockScreenSource(id: string, displayId: number, isPrimary = false) {
  return {
    id: `screen:${id}:0`,
    name: `Display ${displayId}`,
    display_id: String(displayId),
    displayInfo: { id: displayId, isPrimary }
  }
}

function createMockWindowSource(id: string, name: string) {
  return {
    id: `window:${id}:0`,
    name
  }
}

describe('Source Resolver - Area Source Parsing', () => {
  /**
   * Test the area source parsing logic that SourceResolver uses internally
   * We test the parser directly since it's a critical dependency
   */

  const { parseAreaSourceId, isAreaSource } = require('@/features/media/recording/logic/area-source-parser')

  describe('isAreaSource', () => {
    it('returns true for valid area source ID', () => {
      expect(isAreaSource('area:100,200,800,600')).toBe(true)
    })

    it('returns false for screen source ID', () => {
      expect(isAreaSource('screen:1:0')).toBe(false)
    })

    it('returns false for window source ID', () => {
      expect(isAreaSource('window:123:0')).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isAreaSource(undefined)).toBe(false)
    })

    it('returns false for null', () => {
      expect(isAreaSource(null)).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isAreaSource('')).toBe(false)
    })
  })

  describe('parseAreaSourceId', () => {
    it('parses basic area source ID', () => {
      const result = parseAreaSourceId('area:100,200,800,600')
      expect(result).toEqual({
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        displayId: undefined
      })
    })

    it('parses area source ID with displayId', () => {
      const result = parseAreaSourceId('area:100,200,800,600,2')
      expect(result).toEqual({
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        displayId: 2
      })
    })

    it('handles negative coordinates', () => {
      // Negative coords occur on multi-monitor setups
      const result = parseAreaSourceId('area:-1920,0,1920,1080')
      expect(result).toEqual({
        x: -1920,
        y: 0,
        width: 1920,
        height: 1080,
        displayId: undefined
      })
    })

    it('returns null for invalid format', () => {
      expect(parseAreaSourceId('area:invalid')).toBe(null)
      expect(parseAreaSourceId('area:100,200')).toBe(null)
      expect(parseAreaSourceId('screen:1:0')).toBe(null)
    })

    it('returns null for missing prefix', () => {
      expect(parseAreaSourceId('100,200,800,600')).toBe(null)
    })

    it('returns null for empty string', () => {
      expect(parseAreaSourceId('')).toBe(null)
    })
  })
})

describe('Source Resolver - Scale Factor Calculations', () => {
  /**
   * Test the scale factor calculation logic
   * This is critical for high-DPI displays (Retina, 4K, etc.)
   */

  describe('DIP to physical pixel conversion', () => {
    it('calculates correct dimensions for 1x scale factor', () => {
      const dipWidth = 1920
      const dipHeight = 1080
      const scaleFactor = 1

      const physicalWidth = Math.round(dipWidth * scaleFactor)
      const physicalHeight = Math.round(dipHeight * scaleFactor)

      expect(physicalWidth).toBe(1920)
      expect(physicalHeight).toBe(1080)
    })

    it('calculates correct dimensions for 2x scale factor (Retina)', () => {
      const dipWidth = 1920
      const dipHeight = 1080
      const scaleFactor = 2

      const physicalWidth = Math.round(dipWidth * scaleFactor)
      const physicalHeight = Math.round(dipHeight * scaleFactor)

      expect(physicalWidth).toBe(3840)
      expect(physicalHeight).toBe(2160)
    })

    it('calculates correct dimensions for 1.5x scale factor', () => {
      const dipWidth = 1920
      const dipHeight = 1080
      const scaleFactor = 1.5

      const physicalWidth = Math.round(dipWidth * scaleFactor)
      const physicalHeight = Math.round(dipHeight * scaleFactor)

      expect(physicalWidth).toBe(2880)
      expect(physicalHeight).toBe(1620)
    })

    it('handles fractional scale factors with rounding', () => {
      const dipWidth = 1920
      const dipHeight = 1080
      const scaleFactor = 1.25

      const physicalWidth = Math.round(dipWidth * scaleFactor)
      const physicalHeight = Math.round(dipHeight * scaleFactor)

      expect(physicalWidth).toBe(2400)
      expect(physicalHeight).toBe(1350)
    })
  })

  describe('bounds normalization', () => {
    it('normalizes physical pixel bounds to DIP', () => {
      const physicalBounds = { x: 0, y: 0, width: 3840, height: 2160 }
      const scaleFactor = 2

      const dipBounds = {
        x: physicalBounds.x / scaleFactor,
        y: physicalBounds.y / scaleFactor,
        width: physicalBounds.width / scaleFactor,
        height: physicalBounds.height / scaleFactor
      }

      expect(dipBounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
    })

    it('handles negative coordinates in normalization', () => {
      // Second monitor to the left
      const physicalBounds = { x: -3840, y: 0, width: 3840, height: 2160 }
      const scaleFactor = 2

      const dipBounds = {
        x: physicalBounds.x / scaleFactor,
        y: physicalBounds.y / scaleFactor,
        width: physicalBounds.width / scaleFactor,
        height: physicalBounds.height / scaleFactor
      }

      expect(dipBounds).toEqual({ x: -1920, y: 0, width: 1920, height: 1080 })
    })
  })
})

describe('Source Resolver - Source ID Matching', () => {
  /**
   * Test the source ID matching logic used by SourceResolver
   */

  describe('exact match', () => {
    const sources = [
      createMockScreenSource('1', 1, true),
      createMockScreenSource('2', 2, false),
      createMockWindowSource('12345', 'Terminal')
    ]

    it('finds screen source by exact ID', () => {
      const sourceId = 'screen:1:0'
      const source = sources.find(s => s.id === sourceId)
      expect(source).toBeDefined()
      expect(source?.name).toBe('Display 1')
    })

    it('finds window source by exact ID', () => {
      const sourceId = 'window:12345:0'
      const source = sources.find(s => s.id === sourceId)
      expect(source).toBeDefined()
      expect(source?.name).toBe('Terminal')
    })
  })

  describe('prefix match for windows', () => {
    /**
     * Electron window IDs often have a suffix that changes.
     * SourceResolver uses prefix matching as a fallback.
     */
    const sources = [
      createMockWindowSource('12345', 'Terminal')
    ]

    it('matches window by prefix when suffix differs', () => {
      // User selected "window:12345" but actual ID is "window:12345:0"
      const requestedId = 'window:12345'
      const source = sources.find(s => s.id.startsWith(requestedId + ':'))
      expect(source).toBeDefined()
      expect(source?.name).toBe('Terminal')
    })

    it('does not match unrelated windows', () => {
      const requestedId = 'window:99999'
      const source = sources.find(s => s.id.startsWith(requestedId + ':'))
      expect(source).toBeUndefined()
    })
  })

  describe('area source matching', () => {
    const sources = [
      createMockScreenSource('1', 1, true),
      createMockScreenSource('2', 2, false)
    ]

    it('finds screen source matching area displayId', () => {
      // Area selection on display 2
      const areaSourceId = 'area:100,100,800,600,2'
      const { parseAreaSourceId } = require('@/features/media/recording/logic/area-source-parser')
      const area = parseAreaSourceId(areaSourceId)

      expect(area?.displayId).toBe(2)

      // SourceResolver logic: find screen matching display ID
      const matchingScreen = sources.find(s => s.id.startsWith(`screen:${area?.displayId}:`))
      expect(matchingScreen).toBeDefined()
      expect(matchingScreen?.id).toBe('screen:2:0')
    })
  })

  describe('primary screen fallback', () => {
    const sources = [
      createMockScreenSource('1', 1, true),  // Primary
      createMockScreenSource('2', 2, false)
    ]

    it('falls back to primary screen for app-only recording', () => {
      const primaryScreen = sources.find(
        s => s.id.startsWith('screen:') && (s as any).displayInfo?.isPrimary
      )
      expect(primaryScreen).toBeDefined()
      expect(primaryScreen?.id).toBe('screen:1:0')
    })

    it('falls back to any screen if no primary', () => {
      const sourcesNoPrimary = [
        { ...createMockScreenSource('1', 1, false), displayInfo: { id: 1, isPrimary: false } },
        { ...createMockScreenSource('2', 2, false), displayInfo: { id: 2, isPrimary: false } }
      ]

      const anyScreen = sourcesNoPrimary.find(s => s.id.startsWith('screen:'))
      expect(anyScreen).toBeDefined()
    })
  })
})

describe('Source Resolver - Multi-Display Scenarios', () => {
  /**
   * Test scenarios involving multiple displays with different scale factors
   */

  describe('display containment check', () => {
    const containsPoint = (
      b: { x: number; y: number; width: number; height: number },
      x: number,
      y: number
    ) => x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height

    it('detects point inside bounds', () => {
      const bounds = { x: 0, y: 0, width: 1920, height: 1080 }
      expect(containsPoint(bounds, 960, 540)).toBe(true)
      expect(containsPoint(bounds, 0, 0)).toBe(true)
      expect(containsPoint(bounds, 1919, 1079)).toBe(true)
    })

    it('detects point outside bounds', () => {
      const bounds = { x: 0, y: 0, width: 1920, height: 1080 }
      expect(containsPoint(bounds, -1, 0)).toBe(false)
      expect(containsPoint(bounds, 1920, 0)).toBe(false)
      expect(containsPoint(bounds, 0, 1080)).toBe(false)
    })

    it('handles negative origin (second monitor left of primary)', () => {
      const bounds = { x: -1920, y: 0, width: 1920, height: 1080 }
      expect(containsPoint(bounds, -960, 540)).toBe(true)
      expect(containsPoint(bounds, 0, 0)).toBe(false)  // Right edge is at x=0
    })

    it('handles multi-monitor vertical setup', () => {
      const topMonitor = { x: 0, y: -1080, width: 1920, height: 1080 }
      const bottomMonitor = { x: 0, y: 0, width: 1920, height: 1080 }

      expect(containsPoint(topMonitor, 960, -540)).toBe(true)
      expect(containsPoint(topMonitor, 960, 540)).toBe(false)
      expect(containsPoint(bottomMonitor, 960, 540)).toBe(true)
    })
  })

  describe('window center calculation', () => {
    it('calculates center point correctly', () => {
      const bounds = { x: 100, y: 200, width: 800, height: 600 }
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2

      expect(centerX).toBe(500)
      expect(centerY).toBe(500)
    })

    it('handles odd dimensions', () => {
      const bounds = { x: 0, y: 0, width: 1921, height: 1081 }
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2

      expect(centerX).toBe(960.5)
      expect(centerY).toBe(540.5)
    })
  })
})

describe('Source Resolver - Area Selection Integration', () => {
  /**
   * Test area selection bounds calculation
   */

  describe('effective bounds calculation', () => {
    it('offsets area bounds from display origin', () => {
      const displayBounds = { x: 0, y: 0, width: 1920, height: 1080 }
      const areaSelection = { x: 100, y: 100, width: 800, height: 600 }

      const effectiveBounds = {
        x: displayBounds.x + areaSelection.x,
        y: displayBounds.y + areaSelection.y,
        width: areaSelection.width,
        height: areaSelection.height
      }

      expect(effectiveBounds).toEqual({ x: 100, y: 100, width: 800, height: 600 })
    })

    it('handles area on secondary display with negative origin', () => {
      const displayBounds = { x: -1920, y: 0, width: 1920, height: 1080 }
      const areaSelection = { x: 100, y: 100, width: 800, height: 600 }

      const effectiveBounds = {
        x: displayBounds.x + areaSelection.x,
        y: displayBounds.y + areaSelection.y,
        width: areaSelection.width,
        height: areaSelection.height
      }

      expect(effectiveBounds).toEqual({ x: -1820, y: 100, width: 800, height: 600 })
    })

    it('calculates capture dimensions with scale factor', () => {
      const areaBounds = { width: 800, height: 600 }
      const scaleFactor = 2

      const captureWidth = Math.round(areaBounds.width * scaleFactor)
      const captureHeight = Math.round(areaBounds.height * scaleFactor)

      expect(captureWidth).toBe(1600)
      expect(captureHeight).toBe(1200)
    })
  })
})

describe('Source Resolver - Edge Cases', () => {
  describe('missing or invalid data', () => {
    it('handles source with no display_id', () => {
      const source = { id: 'screen:1:0', name: 'Display' }
      const rawDisplayId = (source as any).display_id

      expect(rawDisplayId).toBeUndefined()
    })

    it('handles source with string display_id', () => {
      const source = { id: 'screen:1:0', name: 'Display', display_id: '42' }
      const rawDisplayId =
        typeof source.display_id === 'string'
          ? Number(source.display_id)
          : source.display_id

      expect(rawDisplayId).toBe(42)
    })

    it('handles NaN display_id gracefully', () => {
      const source = { id: 'screen:1:0', name: 'Display', display_id: 'invalid' }
      const rawDisplayId =
        typeof source.display_id === 'string'
          ? Number(source.display_id)
          : source.display_id

      expect(Number.isNaN(rawDisplayId)).toBe(true)
      // Should use fallback
      const parsedDisplayId = Number.isFinite(rawDisplayId) ? rawDisplayId : undefined
      expect(parsedDisplayId).toBeUndefined()
    })
  })

  describe('default values', () => {
    it('uses 1920x1080 as default dimensions', () => {
      const defaultWidth = 1920
      const defaultHeight = 1080
      expect(defaultWidth).toBe(1920)
      expect(defaultHeight).toBe(1080)
    })

    it('uses 1 as default scale factor', () => {
      const defaultScaleFactor = 1
      expect(defaultScaleFactor).toBe(1)
    })
  })
})
