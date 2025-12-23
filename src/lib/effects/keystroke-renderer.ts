import type { KeyboardEvent, KeystrokeEffectData } from '@/types/project'
import { KeystrokePosition } from '@/types/project'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'
import {
  computeKeystrokeSegments,
  getKeystrokeDisplayState,
  getKeystrokeFontFamily,
  getKeystrokePresetStyle,
  type KeystrokePresetStyle,
  type KeystrokeSegment,
  type KeystrokeStylePreset,
} from '@/lib/effects/keystroke-utils'

export type KeystrokeDrawRect = {
  x: number
  y: number
  width: number
  height: number
}

export class KeystrokeRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private keyHistory: KeyboardEvent[] = []
  private segments: KeystrokeSegment[] = []
  private options: Required<KeystrokeEffectData>
  private dpr: number = 1  // Device pixel ratio for Retina support

  constructor(initialOptions: KeystrokeEffectData = {}) {
    this.options = {
      ...DEFAULT_KEYSTROKE_DATA,
      ...initialOptions
    } as Required<KeystrokeEffectData>
  }

  updateSettings(newOptions: KeystrokeEffectData) {
    this.options = {
      ...this.options,
      ...newOptions
    } as Required<KeystrokeEffectData>
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
  }

  /**
   * Set the device pixel ratio for Retina display support.
   * When set, the renderer will apply a scale transform for crisp rendering.
   */
  setDPR(dpr: number) {
    this.dpr = dpr
  }

  setKeyboardEvents(events: KeyboardEvent[]) {
    // Ensure deterministic behavior and correct incremental rendering even if
    // metadata events are not in strict chronological order.
    const orderedEvents = events
      .map((e, index) => ({ e, index }))
      .sort((a, b) => (a.e.timestamp - b.e.timestamp) || (a.index - b.index))
      .map(({ e }) => e)

    this.keyHistory = orderedEvents
    this.segments = computeKeystrokeSegments(orderedEvents, this.options)
  }

  render(timestamp: number, videoWidth: number, videoHeight: number): KeystrokeDrawRect | null {
    if (!this.canvas || !this.ctx || this.segments.length === 0) return null

    const ctx = this.ctx
    // Apply DPR scale transform for crisp Retina rendering
    // This must be done before any drawing operations
    if (this.dpr !== 1) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    }

    const displayState = getKeystrokeDisplayState(this.segments, timestamp, this.options)
    if (!displayState) return null

    const position = this.calculatePosition(videoWidth, videoHeight)
    return this.drawKeystroke(displayState.text, position.x, position.y, displayState.opacity)
  }

  private calculatePosition(videoWidth: number, videoHeight: number): { x: number; y: number } {
    const scale = this.options.scale || 1
    const margin = 48 * scale

    switch (this.options.position) {
      case KeystrokePosition.BottomRight:
        return { x: videoWidth - margin - 100, y: videoHeight - margin }
      case KeystrokePosition.TopCenter:
        return { x: videoWidth / 2, y: margin }
      case KeystrokePosition.BottomCenter:
      default:
        return { x: videoWidth / 2, y: videoHeight - margin }
    }
  }

  private drawKeystroke(text: string, x: number, y: number, opacity: number): KeystrokeDrawRect | null {
    if (!this.ctx) return null

    const ctx = this.ctx
    const scale = this.options.scale || 1
    const fontSize = (this.options.fontSize || 14) * scale
    const padding = (this.options.padding || 10) * scale
    const borderRadius = (this.options.borderRadius || 8) * scale
    const preset = (this.options.stylePreset || 'glass') as KeystrokeStylePreset
    const presetStyle = getKeystrokePresetStyle(preset, this.options, scale)

    ctx.save()
    ctx.globalAlpha = opacity

    // Clean, professional typography
    const fontFamily = getKeystrokeFontFamily(preset, this.options.fontFamily)

    ctx.font = `500 ${fontSize}px ${fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const metrics = ctx.measureText(text)
    const textWidth = metrics.width
    const hPad = padding * 1.4
    const vPad = padding * 0.9
    const boxWidth = textWidth + hPad * 2
    const boxHeight = fontSize + vPad * 2
    const boxX = x - boxWidth / 2
    const boxY = y - boxHeight / 2

    this.drawBackground(ctx, presetStyle, boxX, boxY, boxWidth, boxHeight, borderRadius, scale)
    this.drawText(ctx, presetStyle, text, x, y, scale)

    ctx.restore()

    // Return an expanded rectangle for targeted clearing on next frame.
    // Include some padding to cover blur/shadows/subpixel AA.
    const clearPad = Math.ceil(24 * scale)
    return {
      x: Math.floor(boxX - clearPad),
      y: Math.floor(boxY - clearPad),
      width: Math.ceil(boxWidth + clearPad * 2),
      height: Math.ceil(boxHeight + clearPad * 2),
    }
  }

  private drawBackground(
    ctx: CanvasRenderingContext2D,
    presetStyle: KeystrokePresetStyle,
    x: number, y: number,
    w: number, h: number,
    r: number,
    scale: number
  ) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)

    if (presetStyle.boxShadow) {
      ctx.shadowColor = presetStyle.boxShadow.color
      ctx.shadowBlur = presetStyle.boxShadow.blur
      ctx.shadowOffsetY = presetStyle.boxShadow.offsetY
    }

    if (presetStyle.backgroundColor) {
      ctx.fillStyle = presetStyle.backgroundColor
      ctx.fill()
    }

    if (presetStyle.borderColor) {
      ctx.strokeStyle = presetStyle.borderColor
      ctx.lineWidth = presetStyle.borderWidth ?? 1
      ctx.stroke()
    }

    // Reset shadow
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }

  private drawText(ctx: CanvasRenderingContext2D, presetStyle: KeystrokePresetStyle, text: string, x: number, y: number, scale: number) {
    if (presetStyle.textShadow) {
      ctx.shadowColor = presetStyle.textShadow.color
      ctx.shadowBlur = presetStyle.textShadow.blur
      ctx.shadowOffsetY = presetStyle.textShadow.offsetY
    }

    ctx.fillStyle = presetStyle.textColor || this.options.textColor || '#ffffff'
    ctx.fillText(text, x, y)

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }

  reset() { }

  hasKeystrokesAtTime(timestamp: number): boolean {
    const fadeOutDuration = this.options.fadeOutDuration || 400
    return this.segments.some(s => s.startTime <= timestamp && s.endTime + fadeOutDuration > timestamp)
  }
}
