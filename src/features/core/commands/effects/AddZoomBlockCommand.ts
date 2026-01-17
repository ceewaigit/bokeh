/**
 * AddZoomBlockCommand - Adds zoom effects to timeline.effects[] (TIMELINE SPACE)
 *
 * Zoom effects are now fully decoupled from clips - they stay at their
 * timeline position regardless of which clip is there.
 *
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { ZoomBlock, Effect, ZoomEffectData } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { EffectStore } from '@/features/effects/core/effects-store'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { ZOOM_TRANSITION_CONFIG } from '@/shared/config/physics-config'
import { markProjectModified } from '@/features/core/stores/store-utils'

export class AddZoomBlockCommand extends PatchedCommand<{ blockId: string }> {
  private block: ZoomBlock

  constructor(
    context: CommandContext,
    block: ZoomBlock
  ) {
    super(context, {
      name: 'AddZoomBlock',
      description: `Add zoom block at timeline position ${block.startTime}ms`,
      category: 'effects'
    })
    this.block = block
  }

  canExecute(): boolean {
    if (!this.context.getProject()) return false

    // Validate timing in canExecute for early rejection
    const startTime = this.block.startTime
    const endTime = this.block.endTime
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return false
    if (endTime <= startTime) return false
    if (endTime - startTime < TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS) return false

    return true
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
      throw new Error('No active project')
    }

    // Ensure block has an ID
    if (!this.block.id) {
      this.block.id = `zoom-timeline-${Date.now()}`
    }

    const startTime = this.block.startTime
    const endTime = this.block.endTime

    // Validation (should pass since canExecute() passed, but validate for safety)
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      throw new Error(`Invalid zoom timing for ${this.block.id}`)
    }
    if (endTime <= startTime) {
      throw new Error(`Zoom block ${this.block.id} must have positive duration`)
    }
    if (endTime - startTime < TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS) {
      throw new Error(`Zoom block ${this.block.id} is shorter than minimum duration`)
    }

    // Create zoom effect with TIMELINE SPACE times
    const zoomEffect: Effect = {
      id: this.block.id,
      type: EffectType.Zoom,
      startTime,
      endTime,
      data: {
        origin: this.block.origin,
        scale: this.block.scale,
        targetX: this.block.targetX,
        targetY: this.block.targetY,
        screenWidth: this.block.screenWidth,
        screenHeight: this.block.screenHeight,
        introMs: this.block.introMs ?? ZOOM_TRANSITION_CONFIG.defaultIntroMs,
        outroMs: this.block.outroMs ?? ZOOM_TRANSITION_CONFIG.defaultOutroMs,
        smoothing: this.block.smoothing ?? 50,
        followStrategy: this.block.followStrategy ?? ZoomFollowStrategy.Mouse,
        autoScale: this.block.autoScale,
        mouseIdlePx: this.block.mouseIdlePx,
        transitionStyle: this.block.transitionStyle ?? 'sine',
        mouseFollowAlgorithm: this.block.mouseFollowAlgorithm ?? 'deadzone',
        zoomIntoCursorMode: this.block.zoomIntoCursorMode ?? 'cursor'
      } as ZoomEffectData,
      enabled: true
    }

    // Add to timeline.effects[] using EffectStore
    EffectStore.add(draft.currentProject, zoomEffect)
    markProjectModified(draft)

    this.setResult({ success: true, data: { blockId: this.block.id } })
  }
}
