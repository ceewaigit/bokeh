import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { ZoomBlock, Effect, ZoomEffectData } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { ZOOM_TRANSITION_CONFIG } from '@/shared/config/physics-config'

/**
 * AddZoomBlockCommand - Adds zoom effects to timeline.effects[] (TIMELINE SPACE)
 * 
 * Zoom effects are now fully decoupled from clips - they stay at their
 * timeline position regardless of which clip is there.
 */
export class AddZoomBlockCommand extends Command<{ blockId: string }> {
  private block: ZoomBlock

  constructor(
    private context: CommandContext,
    block: ZoomBlock
  ) {
    super({
      name: 'AddZoomBlock',
      description: `Add zoom block at timeline position ${block.startTime}ms`,
      category: 'effects'
    })
    this.block = block
  }

  canExecute(): boolean {
    return !!this.context.getProject()
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const project = this.context.getProject()

    if (!project) {
      return {
        success: false,
        error: 'No project found'
      }
    }

    // Ensure block has an ID
    if (!this.block.id) {
      this.block.id = `zoom-timeline-${Date.now()}`
    }
    const startTime = this.block.startTime
    const endTime = this.block.endTime
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return {
        success: false,
        error: `Invalid zoom timing for ${this.block.id}`
      }
    }
    if (endTime <= startTime) {
      return {
        success: false,
        error: `Zoom block ${this.block.id} must have positive duration`
      }
    }
    if (endTime - startTime < TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS) {
      return {
        success: false,
        error: `Zoom block ${this.block.id} is shorter than minimum duration`
      }
    }

    // Create zoom effect with TIMELINE SPACE times
    const zoomEffect: Effect = {
      id: this.block.id,
      type: EffectType.Zoom,
      startTime,  // TIMELINE time
      endTime,      // TIMELINE time
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

    // Add to timeline.effects[] using store action (immer-safe)
    const store = this.context.getStore()
    store.addEffect(zoomEffect)

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }

  doUndo(): CommandResult<{ blockId: string }> {
    // Remove from timeline.effects using store action
    const store = this.context.getStore()
    store.removeEffect(this.block.id)

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    return this.doExecute()
  }
}
