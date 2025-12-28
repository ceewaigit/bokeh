/**
 * Annotation effect rendering strategy
 */

import type { Effect, AnnotationData } from '@/types/project'
import { EffectType, AnnotationType } from '@/types/project'
import type { EffectRenderContext } from '../effect-renderer'
import type { IEffectStrategy } from './index'

export class AnnotationEffectStrategy implements IEffectStrategy {
  readonly effectType = EffectType.Annotation

  canRender(effect: Effect): boolean {
    if (effect.type !== EffectType.Annotation) return false
    const data = effect.data as AnnotationData
    return !!data
  }

  render(context: EffectRenderContext, effect: Effect): void {
    const data = effect.data as AnnotationData
    if (!data) return

    const { ctx, timestamp, width, height } = context

    // Calculate fade based on effect timing
    const effectDuration = effect.endTime - effect.startTime
    const effectAge = timestamp - effect.startTime
    const fadeInTime = 200
    const fadeOutTime = 200

    let opacity = 1
    const fadeIn = effectAge < fadeInTime ? effectAge / fadeInTime : 1
    const fadeOut = effectAge > effectDuration - fadeOutTime ? (effectDuration - effectAge) / fadeOutTime : 1

    opacity = Math.min(fadeIn, fadeOut)

    if (opacity <= 0) return

    ctx.save()
    ctx.globalAlpha = opacity * (data.style?.opacity || 1)

    // Convert 0-100% position to pixel coordinates
    const rawPosition = data.position || { x: 50, y: 50 }
    const position = {
      x: (rawPosition.x / 100) * width,
      y: (rawPosition.y / 100) * height,
    }

    // Convert end position for arrows (0-100% to pixels)
    const rawEndPosition = data.endPosition || { x: 60, y: 60 }
    const endPosition = {
      x: (rawEndPosition.x / 100) * width,
      y: (rawEndPosition.y / 100) * height,
    }

    // Convert width/height for highlights (percentage to pixels)
    const highlightWidth = ((data.width ?? 10) / 100) * width
    const highlightHeight = ((data.height ?? 10) / 100) * height

    const style = data.style || {}

    switch (data.type) {
      case AnnotationType.Text:
        this.drawTextAnnotation(ctx, position, data.content || '', style)
        break
      case AnnotationType.Arrow:
        this.drawArrowAnnotation(ctx, position, endPosition, style)
        break
      case AnnotationType.Highlight:
        this.drawHighlightAnnotation(ctx, position, highlightWidth, highlightHeight, style)
        break
      case AnnotationType.Keyboard:
        this.drawKeyboardAnnotation(ctx, position, data.keys || [], style)
        break
    }

    ctx.restore()
  }

  private drawTextAnnotation(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    position: { x: number; y: number },
    text: string,
    style: any
  ): void {
    const fontSize = style.fontSize || 18
    const fontFamily = style.fontFamily || 'system-ui, -apple-system, sans-serif'
    const color = style.color || '#ffffff'
    const bgColor = style.backgroundColor
    const padding = style.padding || 8

    ctx.font = `${style.fontWeight || 'normal'} ${fontSize}px ${fontFamily}`

    if (bgColor) {
      const metrics = ctx.measureText(text)
      const boxWidth = metrics.width + padding * 2
      const boxHeight = fontSize * 1.4 + padding * 2

      ctx.fillStyle = bgColor
      ctx.fillRect(position.x - padding, position.y - padding, boxWidth, boxHeight)
    }

    ctx.fillStyle = color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(text, position.x, position.y)
  }

  private drawArrowAnnotation(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    style: any
  ): void {
    const color = style.color || '#ff0000'
    const strokeWidth = style.strokeWidth || 3
    const arrowHeadSize = style.arrowHeadSize || 10

    ctx.strokeStyle = color
    ctx.lineWidth = strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Draw line
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()

    // Draw arrowhead
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    ctx.save()
    ctx.translate(end.x, end.y)
    ctx.rotate(angle)

    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-arrowHeadSize, -arrowHeadSize / 2)
    ctx.lineTo(-arrowHeadSize, arrowHeadSize / 2)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()

    ctx.restore()
  }

  private drawHighlightAnnotation(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    position: { x: number; y: number },
    width: number,
    height: number,
    style: any
  ): void {
    const color = style.backgroundColor || 'rgba(255, 255, 0, 0.3)'
    const borderColor = style.borderColor
    const borderWidth = style.borderWidth || 2

    ctx.fillStyle = color
    ctx.fillRect(position.x, position.y, width, height)

    if (borderColor) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth
      ctx.strokeRect(position.x, position.y, width, height)
    }
  }

  private drawKeyboardAnnotation(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    position: { x: number; y: number },
    keys: string[],
    style: any
  ): void {
    const label = keys.length ? keys.join(' + ') : 'Keys'
    const fontSize = style.fontSize || 16
    const fontFamily = style.fontFamily || 'system-ui, -apple-system, sans-serif'
    const fontWeight = style.fontWeight || 600
    const color = style.color || '#ffffff'
    const padding = style.padding || 10
    const radius = style.borderRadius || 8
    const background = style.backgroundColor || 'rgba(0, 0, 0, 0.65)'
    const borderColor = style.borderColor || 'rgba(255,255,255,0.15)'
    const borderWidth = style.borderWidth || 1

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
    const metrics = ctx.measureText(label)
    const boxWidth = metrics.width + padding * 2
    const boxHeight = fontSize * 1.6 + padding * 2

    ctx.fillStyle = background
    this.drawRoundedRect(ctx, position.x, position.y, boxWidth, boxHeight, radius)
    ctx.fill()

    if (borderWidth > 0) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth
      this.drawRoundedRect(ctx, position.x, position.y, boxWidth, boxHeight, radius)
      ctx.stroke()
    }

    ctx.fillStyle = color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, position.x + padding, position.y + boxHeight / 2)
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))

    const hasRoundRect =
      typeof (ctx as CanvasRenderingContext2D & { roundRect?: (...args: number[]) => void }).roundRect ===
      'function'

    if (hasRoundRect) {
      ctx.beginPath()
      ctx.roundRect(x, y, width, height, safeRadius)
      ctx.closePath()
      return
    }

    const r = safeRadius
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + width - r, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + r)
    ctx.lineTo(x + width, y + height - r)
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
    ctx.lineTo(x + r, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }
}
