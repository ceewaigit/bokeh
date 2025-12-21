/**
 * Keystroke effect rendering strategy
 */

import type { Effect, KeystrokeEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import type { EffectRenderContext } from '../effect-renderer'
import type { IEffectStrategy } from './index'
import { KeystrokeRenderer } from '../keystroke-renderer'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'
import type { KeyboardEvent } from '@/types/project'

export class KeystrokeEffectStrategy implements IEffectStrategy {
  readonly effectType = EffectType.Keystroke

  private keystrokeRenderer: KeystrokeRenderer
  private lastKeyboardEvents: KeyboardEvent[] | undefined
  private lastCanvas: HTMLCanvasElement | undefined

  constructor() {
    this.keystrokeRenderer = new KeystrokeRenderer(DEFAULT_KEYSTROKE_DATA)
  }

  canRender(effect: Effect): boolean {
    return effect.type === EffectType.Keystroke
  }

  render(context: EffectRenderContext, effect: Effect): void {
    const data = effect.data as KeystrokeEffectData
    if (!context.keyboardEvents || context.keyboardEvents.length === 0) return

    this.keystrokeRenderer.updateSettings({ ...DEFAULT_KEYSTROKE_DATA, ...data })

    // Set events only when changed to avoid resetting state each frame
    if (this.lastKeyboardEvents !== context.keyboardEvents) {
      this.keystrokeRenderer.setKeyboardEvents(context.keyboardEvents)
      this.lastKeyboardEvents = context.keyboardEvents
    }

    const canvas = context.canvas as HTMLCanvasElement
    if (this.lastCanvas !== canvas) {
      this.keystrokeRenderer.setCanvas(canvas)
      this.lastCanvas = canvas
    }
    this.keystrokeRenderer.render(context.timestamp, context.width, context.height)
  }

  dispose(): void {
    this.keystrokeRenderer?.reset()
  }
}
