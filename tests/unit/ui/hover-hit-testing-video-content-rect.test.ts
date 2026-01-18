import { getHoveredLayer } from '@/features/ui/editor/logic/hover-hit-testing'

jest.mock('@/features/ui/editor/logic/dom-hit-testing', () => ({
  hitTestAnnotationsFromPoint: () => null,
}))

describe('hover-hit-testing (video)', () => {
  it('does not treat letterbox area as video (uses visible content rect)', () => {
    const containerRect = {
      left: 0,
      top: 0,
      right: 1000,
      bottom: 1000,
      width: 1000,
      height: 1000,
    } as DOMRect

    const snapshot = {
      mockup: { enabled: false, position: null, data: null },
      layout: {
        offsetX: 100,
        offsetY: 100,
        drawWidth: 800,
        drawHeight: 800,
        // Active clip is 16:9 inside a square frame (will be letterboxed)
        activeSourceWidth: 1920,
        activeSourceHeight: 1080,
      },
      camera: { zoomTransform: null },
      transforms: { combined: '' },
    } as any

    const ctxBase = {
      containerRect,
      canSelectBackground: true,
      canSelectCursor: false,
      canSelectWebcam: false,
      canSelectVideo: true,
      webcamClip: null,
      snapshot,
      aspectContainer: {} as any,
      playerContainer: null,
    }

    // Point inside top letterbox band (frame y=100..900, content y=275..725)
    const hitTopBand = getHoveredLayer({
      ...ctxBase,
      clientX: 200,
      clientY: 150,
    })

    expect(hitTopBand.layer).toBe('background')

    // Point inside visible video content
    const hitContent = getHoveredLayer({
      ...ctxBase,
      clientX: 200,
      clientY: 300,
    })

    expect(hitContent.layer).toBe('video')
    expect(hitContent.video?.height).toBeLessThan(800)
  })
})

