import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Effect, Project } from '@/types/project'
import { EffectType } from '@/types/project'

/**
 * Find zoom effect in timeline.effects ONLY (simplified - no dual-search)
 */
function findZoomEffect(project: Project | null, effectId: string): Effect | null {
  if (!project) return null
  return project.timeline.effects?.find(e => e.id === effectId && e.type === EffectType.Zoom) ?? null
}

export class RemoveZoomBlockCommand extends Command<{ blockId: string }> {
  private effect?: Effect
  private blockId: string

  constructor(
    private context: CommandContext,
    blockId: string
  ) {
    super({
      name: 'RemoveZoomBlock',
      description: `Remove zoom block ${blockId}`,
      category: 'effects'
    })
    this.blockId = blockId
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    return findZoomEffect(project, this.blockId) !== null
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const project = this.context.getProject()
    const effect = findZoomEffect(project, this.blockId)

    if (!effect) {
      return {
        success: false,
        error: `Zoom effect ${this.blockId} not found`
      }
    }

    // Store effect for undo
    this.effect = JSON.parse(JSON.stringify(effect))

    // Remove effect using store method
    const store = this.context.getStore()
    store.removeEffect(this.blockId)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doUndo(): CommandResult<{ blockId: string }> {
    if (!this.effect) {
      return {
        success: false,
        error: 'No block data to restore'
      }
    }

    const store = this.context.getStore()
    store.addEffect(this.effect)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    store.removeEffect(this.blockId)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }
}