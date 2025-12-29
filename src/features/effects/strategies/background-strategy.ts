/**
 * Background effect rendering strategy
 */

import type { Effect, BackgroundEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import type { EffectRenderContext } from '../effect-renderer'
import type { IEffectStrategy } from './index'
import { calculateBackgroundStyle, applyGradientToCanvas } from '../utils/background-calculator'

export class BackgroundEffectStrategy implements IEffectStrategy {
  readonly effectType = EffectType.Background

  canRender(effect: Effect): boolean {
    if (effect.type !== EffectType.Background) return false
    const data = effect.data as BackgroundEffectData
    return !!data?.type
  }

  render(context: EffectRenderContext, effect: Effect): void {
    const data = effect.data as BackgroundEffectData
    if (!data?.type) return

    const { ctx, width, height } = context

    // Use background calculator for consistent rendering
    const backgroundStyle = calculateBackgroundStyle(data, width, height)

    if (backgroundStyle.canvasDrawing) {
      if (backgroundStyle.canvasDrawing.type === 'fill') {
        ctx.fillStyle = backgroundStyle.canvasDrawing.color || '#000000'
        ctx.fillRect(0, 0, width, height)
      } else if (backgroundStyle.canvasDrawing.type === 'gradient' && backgroundStyle.canvasDrawing.gradient) {
        applyGradientToCanvas(
          ctx,
          backgroundStyle.canvasDrawing.gradient,
          width,
          height
        )
      }
      // Image backgrounds handled externally by compositor
    }
  }
}
