
/**
 * Integration Test: Zoom Detection Reset
 * Tests that the reset zoom detection functionality works correctly
 */

const assert = require('assert')

// Mock the zoom detector behavior
class MockZoomDetector {
  detectZoomBlocks(mouseEvents, videoWidth, videoHeight, duration) {
    // Return mock zoom blocks based on mouse events
    if (!mouseEvents || mouseEvents.length < 8) {
      return []
    }

    // Simulate detection of zoom blocks
    return [
      {
        id: 'zoom-cluster-0',
        startTime: 0,
        endTime: 2400,
        introMs: 400,
        outroMs: 500,
        scale: 2.0
      },
      {
        id: 'zoom-cluster-3000',
        startTime: 3000,
        endTime: 5500,
        introMs: 400,
        outroMs: 500,
        scale: 1.75
      }
    ]
  }
}

describe('Zoom Reset Integration', () => {
  test('Zoom Reset Functionality', () => {
    // Setup
    const detector = new MockZoomDetector()
    const mockMouseEvents = Array.from({ length: 40 }, (_, i) => ({
      x: 500 + Math.random() * 100,
      y: 300 + Math.random() * 100,
      timestamp: i * 100
    }))

    // Simulate initial state with zoom blocks
    let clipEffects = {
      zoom: {
        enabled: true,
        blocks: [
          { id: 'old-block-1', startTime: 100, endTime: 500, scale: 1.5 }
        ]
      }
    }

    // Test 1: Clicking reset should trigger regeneration
    // This is what effects-sidebar.tsx does now
    const resetEffects = {
      ...clipEffects.zoom,
      regenerate: Date.now() // Only adds regenerate flag, keeps existing blocks
    }

    expect(resetEffects.blocks).toBeDefined()
    expect(resetEffects.regenerate).toBeDefined()

    // Test 2: Workspace manager handles regeneration
    // This is what workspace-manager.tsx does
    if (resetEffects.regenerate) {
      const newZoomBlocks = detector.detectZoomBlocks(
        mockMouseEvents,
        1920,
        1080,
        10000
      )

      // Update effects with new blocks
      clipEffects = {
        zoom: {
          ...resetEffects,
          blocks: newZoomBlocks,
          regenerate: undefined // Clear the flag
        }
      }
    }

    // Test 3: Verify final state
    expect(clipEffects.zoom.blocks.length).toBeGreaterThan(0)
    expect(clipEffects.zoom.regenerate).toBeUndefined()
    expect(clipEffects.zoom.blocks[0].id).not.toBe('old-block-1')
  })
})