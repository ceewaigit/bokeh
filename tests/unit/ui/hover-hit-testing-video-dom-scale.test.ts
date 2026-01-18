import { getHoveredLayer } from '@/features/ui/editor/logic/hover-hit-testing'

jest.mock('@/features/ui/editor/logic/dom-hit-testing', () => ({
  hitTestAnnotationsFromPoint: () => null,
}))

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('hover-hit-testing (video) - DOM scaled rect', () => {
  it('uses DOM-derived rect so overlay aligns with scaled preview', () => {
    ;(window as any).getComputedStyle = () => ({
      clipPath: 'none',
      borderRadius: '0px',
    })

    const containerRect = makeRect(0, 0, 1000, 1000)

    const videoTransformContainer = {
      getBoundingClientRect: () => makeRect(50, 60, 400, 400),
    } as any as HTMLElement

    const playerContainer = {
      querySelector: (selector: string) => {
        if (selector === '[data-video-transform-container="true"]') return videoTransformContainer
        return null
      },
    } as any as HTMLElement

    const snapshot = {
      mockup: { enabled: false, position: null, data: null },
      layout: {
        offsetX: 100,
        offsetY: 100,
        drawWidth: 800,
        drawHeight: 800,
        activeSourceWidth: 1920,
        activeSourceHeight: 1080,
      },
      camera: { zoomTransform: null },
      transforms: { combined: '' },
    } as any

    const state = getHoveredLayer({
      containerRect,
      clientX: 100,
      clientY: 200,
      canSelectBackground: true,
      canSelectCursor: false,
      canSelectWebcam: false,
      canSelectVideo: true,
      webcamClip: null,
      snapshot,
      aspectContainer: {} as any,
      playerContainer,
    })

    // 16:9 inside 400x400 => content is 400x225 centered vertically
    expect(state.layer).toBe('video')
    expect(state.video?.width).toBe(400)
    expect(state.video?.height).toBeCloseTo(225, 3)
    expect(state.video?.x).toBe(50)
    expect(state.video?.y).toBeCloseTo(60 + (400 - 225) / 2, 3)
  })
})
