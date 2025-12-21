import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { ZoomBlock, Effect, ZoomEffectData } from '@/types/project'
import { EffectType, ZoomFollowStrategy } from '@/types/project'
import { useProjectStore } from '@/stores/project-store'

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

    // Create zoom effect with TIMELINE SPACE times
    const zoomEffect: Effect = {
      id: this.block.id,
      type: EffectType.Zoom,
      startTime: this.block.startTime,  // TIMELINE time
      endTime: this.block.endTime,      // TIMELINE time
      data: {
        scale: this.block.scale,
        targetX: this.block.targetX,
        targetY: this.block.targetY,
        introMs: this.block.introMs || 300,
        outroMs: this.block.outroMs || 300,
        smoothing: this.block.smoothing ?? 50,
        followStrategy: this.block.followStrategy ?? ZoomFollowStrategy.Mouse,
        autoScale: this.block.autoScale
      } as ZoomEffectData,
      enabled: true
    }

    // Add to timeline.effects[]
    useProjectStore.getState().updateProjectData((proj) => ({
      ...proj,
      timeline: {
        ...proj.timeline,
        effects: [...(proj.timeline.effects || []), zoomEffect]
      }
    }))

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }

  doUndo(): CommandResult<{ blockId: string }> {
    // Remove from timeline.effects
    useProjectStore.getState().updateProjectData((proj) => ({
      ...proj,
      timeline: {
        ...proj.timeline,
        effects: (proj.timeline.effects || []).filter(e => e.id !== this.block.id)
      }
    }))

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    return this.doExecute()
  }
}
