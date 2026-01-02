import { KeystrokeRenderer } from '@/features/effects/keystroke/renderer'
import type { KeyboardEvent } from '@/types/project'

function makeMockCanvas() {
  const fillText = jest.fn()
  const ctx: any = {
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    roundRect: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    measureText: jest.fn((text: string) => ({ width: text.length * 10 })),
    fillText,
  }

  const canvas = document.createElement('canvas') as any
  canvas.getContext = jest.fn().mockReturnValue(ctx)

  return { canvas: canvas as HTMLCanvasElement, ctx, fillText }
}

describe('KeystrokeRenderer', () => {
  test('prefers the most recent segment when segments overlap', () => {
    const renderer = new KeystrokeRenderer({ displayDuration: 2000, fadeOutDuration: 400 })
    const { canvas, fillText } = makeMockCanvas()
    renderer.setCanvas(canvas)

    const events: KeyboardEvent[] = [
      { timestamp: 0, key: 'KeyA', modifiers: [] },
      { timestamp: 100, key: 'KeyB', modifiers: [] },
      // Gap > 800ms flushes first buffer into a segment.
      { timestamp: 1000, key: 'KeyC', modifiers: [] },
      { timestamp: 1100, key: 'KeyD', modifiers: [] },
    ]

    renderer.setKeyboardEvents(events)
    renderer.render(1200, 1920, 1080)

    expect(fillText).toHaveBeenCalled()
    expect(fillText.mock.calls[0][0]).toBe('cd')
  })

  test('sorts out-of-order keyboard events to render incrementally', () => {
    const renderer = new KeystrokeRenderer({ displayDuration: 2000, fadeOutDuration: 400 })
    const { canvas, fillText } = makeMockCanvas()
    renderer.setCanvas(canvas)

    const events: KeyboardEvent[] = [
      { timestamp: 0, key: 'KeyA', modifiers: [] },
      { timestamp: 200, key: 'KeyC', modifiers: [] },
      { timestamp: 100, key: 'KeyB', modifiers: [] },
    ]

    renderer.setKeyboardEvents(events)
    renderer.render(150, 1920, 1080)

    expect(fillText).toHaveBeenCalled()
    expect(fillText.mock.calls[0][0]).toBe('ab')
  })
})
