/**
 * Cursor effect rendering strategy
 */

import type { Effect, CursorEffectData } from '@/types/project'
import { EffectType, CursorStyle } from '@/types/project'
import type { EffectRenderContext } from '../effect-renderer'
import type { IEffectStrategy } from './index'
import { calculateCursorState, getClickTextStyle, getCursorPath, resolveClickEffectConfig } from '@/features/cursor/logic/cursor-logic'

export class CursorEffectStrategy implements IEffectStrategy {
  readonly effectType = EffectType.Cursor

  canRender(effect: Effect): boolean {
    return effect.type === EffectType.Cursor
  }

  async render(context: EffectRenderContext, effect: Effect): Promise<void> {
    const data = effect.data as CursorEffectData
    if (!context.mouseEvents || context.mouseEvents.length === 0) return

    const { ctx, timestamp } = context
    // Use cursor calculator for state calculation
    const cursorState = calculateCursorState(
      data,
      context.mouseEvents,
      context.clickEvents || [],
      timestamp,
      context.fps
    )

    if (!cursorState.visible) return

    // Draw cursor using calculated state
    ctx.save()
    ctx.globalAlpha = cursorState.opacity

    // Apply shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 4 * cursorState.scale
    ctx.shadowOffsetX = 1 * cursorState.scale
    ctx.shadowOffsetY = 2 * cursorState.scale

    // Draw cursor using path from calculator
    const cursorPath = getCursorPath(cursorState.x, cursorState.y, cursorState.type, cursorState.scale)
    ctx.fillStyle = data.style === CursorStyle.Custom && data.color ? data.color : '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1 * cursorState.scale
    ctx.fill(cursorPath)
    ctx.stroke(cursorPath)

    // Draw click effects from calculated state
    if (cursorState.clickEffects.length > 0) {
      const clickConfig = resolveClickEffectConfig(data)

      ctx.shadowColor = 'transparent'
      for (const click of cursorState.clickEffects) {
        if (clickConfig.style !== 'text') {
          ctx.globalAlpha = click.opacity * cursorState.opacity
          ctx.strokeStyle = clickConfig.color
          ctx.lineWidth = clickConfig.lineWidth * cursorState.scale
          ctx.beginPath()
          ctx.arc(click.x, click.y, click.radius, 0, Math.PI * 2)
          ctx.stroke()
        }

        if (click.word) {
          const textStyle = getClickTextStyle(click, clickConfig)
          if (textStyle) {
            ctx.save()
            ctx.globalAlpha = textStyle.opacity * cursorState.opacity
            ctx.fillStyle = clickConfig.textColor
            ctx.font = `${clickConfig.textSize * cursorState.scale}px SF Pro Display, system-ui, -apple-system, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.translate(click.x, click.y + textStyle.offsetY * cursorState.scale)
            ctx.scale(textStyle.scale, textStyle.scale)
            ctx.fillText(click.word, 0, 0)
            ctx.restore()
          }
        }
      }
    }

    ctx.restore()
  }

  dispose(): void {
    // No-op: deterministic cursor calculation has no internal state to reset.
  }
}
