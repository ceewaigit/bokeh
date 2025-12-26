import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Effect, Project, ZoomBlock } from '@/types/project'
import { EffectType } from '@/types/project'
import { EffectStore } from '@/lib/core/effects'

/**
 * Find zoom effect in the project using EffectStore
 */
function findZoomEffect(project: Project | null, effectId: string): Effect | null {
  if (!project) return null
  const effect = EffectStore.get(project, effectId)
  return effect?.type === EffectType.Zoom ? effect : null
}

export class UpdateZoomBlockCommand extends Command<{ blockId: string }> {
  private originalBlock?: ZoomBlock
  private blockId: string
  private updates: Partial<ZoomBlock>

  constructor(
    private context: CommandContext,
    blockId: string,
    updates: Partial<ZoomBlock>
  ) {
    super({
      name: 'UpdateZoomBlock',
      description: `Update zoom block ${blockId}`,
      category: 'effects'
    })
    this.blockId = blockId
    this.updates = updates
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    return findZoomEffect(project, this.blockId) !== null
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    const project = this.context.getProject()
    const effect = findZoomEffect(project, this.blockId)

    if (!effect) {
      return {
        success: false,
        error: `Zoom effect ${this.blockId} not found`
      }
    }

    // Store original state
    const zoomData = effect.data as any
    this.originalBlock = {
      id: effect.id,
      startTime: effect.startTime,
      endTime: effect.endTime,
      scale: zoomData.scale,
      targetX: zoomData.targetX,
      targetY: zoomData.targetY,
      screenWidth: zoomData.screenWidth,
      screenHeight: zoomData.screenHeight,
      introMs: zoomData.introMs,
      outroMs: zoomData.outroMs,
      smoothing: zoomData.smoothing,
      followStrategy: zoomData.followStrategy,
      autoScale: zoomData.autoScale,
      mouseIdlePx: zoomData.mouseIdlePx
    }

    // Update the effect with new zoom data
    const updatedData = {
      ...zoomData,
      scale: this.updates.scale ?? zoomData.scale,
      targetX: 'targetX' in this.updates ? this.updates.targetX : zoomData.targetX,
      targetY: 'targetY' in this.updates ? this.updates.targetY : zoomData.targetY,
      screenWidth: 'screenWidth' in this.updates ? this.updates.screenWidth : zoomData.screenWidth,
      screenHeight: 'screenHeight' in this.updates ? this.updates.screenHeight : zoomData.screenHeight,
      introMs: this.updates.introMs ?? zoomData.introMs,
      outroMs: this.updates.outroMs ?? zoomData.outroMs,
      smoothing: this.updates.smoothing ?? zoomData.smoothing,
      followStrategy: 'followStrategy' in this.updates ? this.updates.followStrategy : zoomData.followStrategy,
      autoScale: 'autoScale' in this.updates ? this.updates.autoScale : zoomData.autoScale,
      mouseIdlePx: 'mouseIdlePx' in this.updates ? this.updates.mouseIdlePx : zoomData.mouseIdlePx
    }

    store.updateEffect(this.blockId, {
      startTime: this.updates.startTime ?? effect.startTime,
      endTime: this.updates.endTime ?? effect.endTime,
      data: updatedData
    })

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doUndo(): CommandResult<{ blockId: string }> {
    if (!this.originalBlock) {
      return {
        success: false,
        error: 'No original block data to restore'
      }
    }

    const store = this.context.getStore()

    store.updateEffect(this.blockId, {
      startTime: this.originalBlock.startTime,
      endTime: this.originalBlock.endTime,
      data: {
        scale: this.originalBlock.scale || 2,
        targetX: this.originalBlock.targetX,
        targetY: this.originalBlock.targetY,
        screenWidth: this.originalBlock.screenWidth,
        screenHeight: this.originalBlock.screenHeight,
        introMs: this.originalBlock.introMs || 300,
        outroMs: this.originalBlock.outroMs || 300,
        smoothing: this.originalBlock.smoothing ?? 50,
        followStrategy: this.originalBlock.followStrategy,
        autoScale: this.originalBlock.autoScale,
        mouseIdlePx: this.originalBlock.mouseIdlePx
      }
    })

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    const project = this.context.getProject()
    const effect = findZoomEffect(project, this.blockId)

    if (effect) {
      const zoomData = effect.data as any
      const updatedData = {
        ...zoomData,
        scale: this.updates.scale ?? zoomData.scale,
        targetX: 'targetX' in this.updates ? this.updates.targetX : zoomData.targetX,
        targetY: 'targetY' in this.updates ? this.updates.targetY : zoomData.targetY,
        screenWidth: 'screenWidth' in this.updates ? this.updates.screenWidth : zoomData.screenWidth,
        screenHeight: 'screenHeight' in this.updates ? this.updates.screenHeight : zoomData.screenHeight,
        introMs: this.updates.introMs ?? zoomData.introMs,
        outroMs: this.updates.outroMs ?? zoomData.outroMs,
        smoothing: this.updates.smoothing ?? zoomData.smoothing,
        followStrategy: 'followStrategy' in this.updates ? this.updates.followStrategy : zoomData.followStrategy,
        autoScale: 'autoScale' in this.updates ? this.updates.autoScale : zoomData.autoScale,
        mouseIdlePx: 'mouseIdlePx' in this.updates ? this.updates.mouseIdlePx : zoomData.mouseIdlePx
      }

      store.updateEffect(this.blockId, {
        startTime: this.updates.startTime ?? effect.startTime,
        endTime: this.updates.endTime ?? effect.endTime,
        data: updatedData
      })
    }

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }
}
