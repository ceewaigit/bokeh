/**
 * Unified effect renderer that can be used by both Remotion preview and export.
 */

import type { Effect, KeyboardEvent, MouseEvent, ClickEvent } from '@/types/project'
import { EffectStrategyRegistry, type IEffectStrategy } from '../strategies'
import { BackgroundEffectStrategy } from '../strategies/background-strategy'
import { CursorEffectStrategy } from '../strategies/cursor-strategy'
import { KeystrokeEffectStrategy } from '../strategies/keystroke-strategy'

export interface EffectRenderContext {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  timestamp: number
  width: number
  height: number
  videoWidth: number
  videoHeight: number
  fps?: number
  effects: Effect[]
  mouseEvents?: MouseEvent[]
  keyboardEvents?: KeyboardEvent[]
  clickEvents?: ClickEvent[]
}

export class EffectRenderer {
  private registry: EffectStrategyRegistry

  constructor() {
    this.registry = new EffectStrategyRegistry()
    this.registry.register(new BackgroundEffectStrategy())
    this.registry.register(new CursorEffectStrategy())
    this.registry.register(new KeystrokeEffectStrategy())
  }

  registerStrategy(strategy: IEffectStrategy): void {
    this.registry.register(strategy)
  }

  unregisterStrategy(effectType: IEffectStrategy['effectType']): void {
    this.registry.unregister(effectType)
  }

  async renderEffects(context: EffectRenderContext): Promise<void> {
    const { effects, timestamp } = context
    const activeEffects = effects.filter(e => e.enabled && timestamp >= e.startTime && timestamp <= e.endTime)

    for (const effect of activeEffects) {
      const strategy = this.registry.getStrategy(effect.type)
      if (strategy && strategy.canRender(effect)) {
        await strategy.render(context, effect)
      }
    }
  }

  dispose(): void {
    this.registry.dispose()
  }

  getRegistry(): EffectStrategyRegistry {
    return this.registry
  }
}

