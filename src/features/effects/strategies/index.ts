/**
 * Effect strategy pattern infrastructure
 * Enables extensible effect rendering without modifying the core renderer
 */

import type { Effect } from '@/types/project'
import { EffectType } from '@/types/project'
import type { EffectRenderContext } from '../effect-renderer'

/**
 * Interface for effect rendering strategies
 * Each strategy handles a specific effect type
 */
export interface IEffectStrategy {
  /** The effect type this strategy handles */
  readonly effectType: EffectType

  /**
   * Check if this strategy can render the given effect
   * @param effect - The effect to check
   * @returns true if this strategy can render the effect
   */
  canRender(effect: Effect): boolean

  /**
   * Render the effect
   * @param context - The rendering context
   * @param effect - The effect to render
   */
  render(context: EffectRenderContext, effect: Effect): Promise<void> | void

  /**
   * Optional cleanup method
   */
  dispose?(): void
}

/**
 * Registry for effect strategies
 * Allows dynamic registration and lookup of strategies
 */
export class EffectStrategyRegistry {
  private strategies = new Map<EffectType, IEffectStrategy>()

  /**
   * Register a strategy for an effect type
   * @param strategy - The strategy to register
   */
  register(strategy: IEffectStrategy): void {
    this.strategies.set(strategy.effectType, strategy)
  }

  /**
   * Unregister a strategy for an effect type
   * @param effectType - The effect type to unregister
   */
  unregister(effectType: EffectType): void {
    this.strategies.delete(effectType)
  }

  /**
   * Get the strategy for an effect type
   * @param effectType - The effect type to look up
   * @returns The strategy or undefined if not found
   */
  getStrategy(effectType: EffectType): IEffectStrategy | undefined {
    return this.strategies.get(effectType)
  }

  /**
   * Check if a strategy exists for an effect type
   * @param effectType - The effect type to check
   * @returns true if a strategy is registered
   */
  hasStrategy(effectType: EffectType): boolean {
    return this.strategies.has(effectType)
  }

  /**
   * Get all registered strategies
   * @returns Array of registered strategies
   */
  getAllStrategies(): IEffectStrategy[] {
    return Array.from(this.strategies.values())
  }

  /**
   * Dispose all strategies
   */
  dispose(): void {
    for (const strategy of this.strategies.values()) {
      strategy.dispose?.()
    }
    this.strategies.clear()
  }
}

// Re-export for convenience
export { EffectType }
