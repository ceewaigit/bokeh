/**
 * Unified effect renderer that can be used by both Remotion preview and export
 * This ensures consistent rendering between preview and final export
 *
 * Uses the Strategy pattern for extensible effect rendering
 */

import type {
  Effect,
  KeyboardEvent,
  MouseEvent,
  ClickEvent,
} from '@/types/project'

// Import strategies
import { EffectStrategyRegistry, type IEffectStrategy } from './strategies'
import { BackgroundEffectStrategy } from './strategies/background-strategy'
import { CursorEffectStrategy } from './strategies/cursor-strategy'
import { KeystrokeEffectStrategy } from './strategies/keystroke-strategy'
import { AnnotationEffectStrategy } from './strategies/annotation-strategy'

export interface EffectRenderContext {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  timestamp: number // in ms
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

/**
 * Effect rendering logic for export
 * Uses Strategy pattern for extensible effect type support
 */
export class EffectRenderer {
  private registry: EffectStrategyRegistry

  constructor() {
    // Initialize strategy registry with built-in strategies
    this.registry = new EffectStrategyRegistry()

    // Register default strategies
    this.registry.register(new BackgroundEffectStrategy())
    this.registry.register(new CursorEffectStrategy())
    this.registry.register(new KeystrokeEffectStrategy())
    this.registry.register(new AnnotationEffectStrategy())
  }

  /**
   * Register a custom strategy for an effect type
   * Enables extension without modifying this class (Open/Closed Principle)
   * @param strategy - The strategy to register
   */
  registerStrategy(strategy: IEffectStrategy): void {
    this.registry.register(strategy)
  }

  /**
   * Unregister a strategy for an effect type
   * @param effectType - The effect type to unregister
   */
  unregisterStrategy(effectType: IEffectStrategy['effectType']): void {
    this.registry.unregister(effectType)
  }

  /**
   * Main render method that processes all effects
   * Delegates to registered strategies based on effect type
   */
  async renderEffects(context: EffectRenderContext): Promise<void> {
    const { effects, timestamp } = context

    // Find active effects at current timestamp
    const activeEffects = effects.filter(e =>
      e.enabled &&
      timestamp >= e.startTime &&
      timestamp <= e.endTime
    )

    // Render effects in order using strategies
    // Order: background -> video (external) -> cursor -> keystroke -> annotations
    for (const effect of activeEffects) {
      const strategy = this.registry.getStrategy(effect.type)

      if (strategy && strategy.canRender(effect)) {
        // Strategy.render can be sync or async
        await strategy.render(context, effect)
      }
      // Zoom effects are handled separately by video transformation
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.registry.dispose()
  }

  /**
   * Get the strategy registry for advanced use cases
   * @returns The strategy registry
   */
  getRegistry(): EffectStrategyRegistry {
    return this.registry
  }
}
