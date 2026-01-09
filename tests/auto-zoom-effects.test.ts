import { detectZoomEffects } from '@/features/effects/logic/effect-detector'
import { ZoomDetector } from '@/features/effects/utils/zoom-detector'

describe('auto zoom generation', () => {
  test('never truncates an action zoom to a split-second at the end', () => {
    const detector = new ZoomDetector()

    const duration = 5000
    const clickAt = 4800
    const blocks = detector.detectZoomBlocks(
      [],
      1920,
      1080,
      duration,
      [{ timestamp: clickAt, x: 100, y: 100 } as any],
      [],
      [],
      { maxZoomsPerMinute: 60, minZoomGapMs: 0 }
    )

    expect(blocks.length).toBe(1)
    const b = blocks[0]
    expect(b.endTime).toBeLessThanOrEqual(duration - 100)
    expect(b.endTime - b.startTime).toBeGreaterThan(1000)
    expect(b.startTime).toBeLessThanOrEqual(clickAt)
    expect(b.endTime).toBeGreaterThan(clickAt)
  })

  test('respects clip sourceIn/sourceOut window when mapping to timeline', () => {
    const recording: any = {
      id: 'r1',
      duration: 10000,
      width: 1920,
      height: 1080,
      metadata: {
        mouseEvents: [],
        clickEvents: [
          // Click happens near the end of the recording, but inside the trimmed clip window.
          { timestamp: 4900, x: 600, y: 400 },
        ],
        keyboardEvents: [],
        scrollEvents: [],
      },
    }

    const clip: any = {
      id: 'c1',
      recordingId: 'r1',
      startTime: 1000,
      duration: 2000,
      sourceIn: 3000,
      sourceOut: 5000,
      playbackRate: 1,
    }

    const { zoomEffects } = detectZoomEffects(recording, clip)
    expect(zoomEffects.length).toBe(1)
    const e = zoomEffects[0]
    expect(e.startTime).toBeGreaterThanOrEqual(clip.startTime)
    expect(e.endTime).toBeLessThanOrEqual(clip.startTime + clip.duration)
    expect(e.endTime - e.startTime).toBeGreaterThan(1000)
  })

  test('does not generate a fill zoom when no zoom blocks are detected', () => {
    const recording: any = {
      id: 'r1',
      duration: 3000,
      width: 1920,
      height: 1080,
      metadata: { mouseEvents: [], clickEvents: [], keyboardEvents: [], scrollEvents: [] },
    }

    const clip: any = {
      id: 'c1',
      recordingId: 'r1',
      startTime: 0,
      duration: 3000,
      sourceIn: 0,
      sourceOut: 3000,
      playbackRate: 1,
    }

    const { zoomEffects } = detectZoomEffects(recording, clip)
    expect(zoomEffects).toHaveLength(0)
  })
})

