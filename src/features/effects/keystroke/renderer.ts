import type { Effect, KeyboardEvent, KeystrokeEffectData } from '@/types/project'
import { EffectType, KeystrokePosition } from '@/types/project'
import { OverlayAnchor } from '@/types/overlays'
import { DEFAULT_KEYSTROKE_DATA } from '@/features/effects/keystroke/config'
import type { EffectRenderContext } from '../rendering/renderer'
import {
  computeKeystrokeSegments,
  getKeystrokeDisplayState,
  getKeystrokeFontFamily,
  getKeystrokePresetStyle,
  type KeystrokePresetStyle,
  type KeystrokeSegment,
  type KeystrokeStylePreset,
} from './utils'

import { getOverlayAnchorPosition } from '@/features/rendering/overlays/anchor-utils'
import { getOverlaySafeMarginPx } from '@/features/rendering/overlays/overlay-metrics'

export type KeystrokeDrawRect = { x: number; y: number; width: number; height: number }

export class KeystrokeRenderer {
  readonly effectType = EffectType.Keystroke
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private segments: KeystrokeSegment[] = []
  private options: Required<KeystrokeEffectData>
  private dpr: number = 1
  private displayScale: number = 1
  private lastKeyboardEvents: KeyboardEvent[] | undefined
  private lastCanvas: HTMLCanvasElement | undefined

  constructor(initialOptions: KeystrokeEffectData = {}) {
    this.options = { ...DEFAULT_KEYSTROKE_DATA, ...initialOptions } as Required<KeystrokeEffectData>
  }

  canRender(effect: Effect): boolean {
    return effect.type === EffectType.Keystroke
  }

  updateSettings(newOptions: KeystrokeEffectData) {
    this.options = { ...this.options, ...newOptions } as Required<KeystrokeEffectData>
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
  }

  setDPR(dpr: number) {
    this.dpr = dpr
  }

  setDisplayScale(displayScale: number) {
    this.displayScale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1
  }

  setKeyboardEvents(events: KeyboardEvent[]) {
    this.segments = computeKeystrokeSegments(events, this.options)
  }

  render(timestamp: number, videoWidth: number, videoHeight: number): KeystrokeDrawRect | null
  render(context: EffectRenderContext, effect: Effect): void
  render(
    arg1: number | EffectRenderContext,
    arg2: number | Effect | undefined,
    arg3?: number
  ): KeystrokeDrawRect | null | void {
    if (typeof arg1 === 'number') {
      return this.renderFrame(arg1, arg2 as number, arg3 as number)
    }

    const context = arg1
    const effect = arg2 as Effect
    if (!effect || effect.type !== EffectType.Keystroke) return
    if (!context.keyboardEvents || context.keyboardEvents.length === 0) return

    const data = effect.data as KeystrokeEffectData
    this.updateSettings({ ...DEFAULT_KEYSTROKE_DATA, ...data })

    if (this.lastKeyboardEvents !== context.keyboardEvents) {
      this.setKeyboardEvents(context.keyboardEvents)
      this.lastKeyboardEvents = context.keyboardEvents
    }

    const canvas = context.canvas as HTMLCanvasElement
    if (this.lastCanvas !== canvas) {
      this.setCanvas(canvas)
      this.lastCanvas = canvas
    }

    this.renderFrame(context.timestamp, context.width, context.height)
  }

  private renderFrame(timestamp: number, videoWidth: number, videoHeight: number): KeystrokeDrawRect | null {
    if (!this.canvas || !this.ctx || this.segments.length === 0) return null

    const ctx = this.ctx
    if (this.dpr !== 1) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    const displayState = getKeystrokeDisplayState(this.segments, timestamp, this.options)
    if (!displayState) return null

    const position = this.calculatePosition(videoWidth, videoHeight, this.displayScale)
    return this.drawKeystroke(displayState.text, position.x, position.y, displayState.opacity, this.displayScale)
  }

  private calculatePosition(videoWidth: number, videoHeight: number, displayScale: number): { x: number; y: number } {
    const margin = getOverlaySafeMarginPx(displayScale)
    const anchor = this.resolveAnchor()
    const offsetX = this.options.offsetX ?? 0
    const offsetY = this.options.offsetY ?? 0

    const pos = getOverlayAnchorPosition(anchor, videoWidth, videoHeight, margin)
    return { x: pos.x + offsetX, y: pos.y + offsetY }
  }

  private resolveAnchor(): OverlayAnchor {
    if (this.options.anchor) return this.options.anchor
    switch (this.options.position) {
      case KeystrokePosition.TopCenter:
        return OverlayAnchor.TopCenter
      case KeystrokePosition.BottomRight:
        return OverlayAnchor.BottomRight
      case KeystrokePosition.BottomCenter:
      default:
        return OverlayAnchor.BottomCenter
    }
  }

  private drawKeystroke(text: string, x: number, y: number, opacity: number, displayScale: number): KeystrokeDrawRect | null {
    if (!this.ctx) return null

    const ctx = this.ctx
    const scale = (this.options.scale || 1) * displayScale
    const fontSize = (this.options.fontSize || 14) * scale
    const padding = (this.options.padding || 12) * scale
    const borderRadius = (this.options.borderRadius || 8) * scale
    const preset = (this.options.stylePreset || 'glass') as KeystrokeStylePreset
    const presetStyle = getKeystrokePresetStyle(preset, this.options, scale)

    ctx.save()
    ctx.globalAlpha = opacity

    const fontFamily = getKeystrokeFontFamily(preset, this.options.fontFamily)
    ctx.font = `500 ${fontSize}px ${fontFamily}`

    const metrics = ctx.measureText(text)
    const textWidth = metrics.width
    const hPad = padding * 1.4
    const vPad = padding * 0.9
    const boxWidth = textWidth + hPad * 2
    const boxHeight = fontSize + vPad * 2

    let boxX = 0
    let boxY = 0
    const anchor = this.resolveAnchor()

    switch (anchor) {
      case OverlayAnchor.TopLeft:
        boxX = x
        boxY = y
        break
      case OverlayAnchor.TopCenter:
        boxX = x - boxWidth / 2
        boxY = y
        break
      case OverlayAnchor.TopRight:
        boxX = x - boxWidth
        boxY = y
        break
      case OverlayAnchor.CenterLeft:
        boxX = x
        boxY = y - boxHeight / 2
        break
      case OverlayAnchor.Center:
        boxX = x - boxWidth / 2
        boxY = y - boxHeight / 2
        break
      case OverlayAnchor.CenterRight:
        boxX = x - boxWidth
        boxY = y - boxHeight / 2
        break
      case OverlayAnchor.BottomLeft:
        boxX = x
        boxY = y - boxHeight
        break
      case OverlayAnchor.BottomRight:
        boxX = x - boxWidth
        boxY = y - boxHeight
        break
      case OverlayAnchor.BottomCenter:
      default:
        boxX = x - boxWidth / 2
        boxY = y - boxHeight
        break
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const textX = boxX + boxWidth / 2
    const textY = boxY + boxHeight / 2

    this.drawBackground(ctx, presetStyle, boxX, boxY, boxWidth, boxHeight, borderRadius)
    this.drawText(ctx, presetStyle, text, textX, textY)

    ctx.restore()

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
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
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

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }

  private drawText(ctx: CanvasRenderingContext2D, presetStyle: KeystrokePresetStyle, text: string, x: number, y: number) {
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

  reset() {}

  hasKeystrokesAtTime(timestamp: number): boolean {
    const fadeOutDuration = this.options.fadeOutDuration || 400
    return this.segments.some(s => s.startTime <= timestamp && s.endTime + fadeOutDuration > timestamp)
  }
}
