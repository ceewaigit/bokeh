import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export class UpdateClipCommand extends Command<{ clipId: string }> {
  private originalClip?: Clip
  private updates: Partial<Clip>
  private adjustedUpdates?: Partial<Clip>

  constructor(
    private context: CommandContext,
    private clipId: string,
    updates: Partial<Clip>
  ) {
    super({
      name: 'UpdateClip',
      description: `Update clip ${clipId}`,
      category: 'timeline'
    })
    this.updates = updates
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    return result !== null
  }

  doExecute(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)
    
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    const { clip, track } = result
    
    // Store original state
    this.originalClip = JSON.parse(JSON.stringify(clip))
    
    // Don't auto-adjust positions - let the store handle overlap detection
    // The store will prevent the update if it would cause an overlap
    this.adjustedUpdates = { ...this.updates }

    // Apply updates using store method
    store.updateClip(this.clipId, this.adjustedUpdates)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doUndo(): CommandResult<{ clipId: string }> {
    if (!this.originalClip) {
      return {
        success: false,
        error: 'No original clip data to restore'
      }
    }

    const store = this.context.getStore()
    
    // Restore all original properties exactly as they were
    store.updateClip(this.clipId, this.originalClip, { exact: true })

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doRedo(): CommandResult<{ clipId: string }> {
    if (!this.adjustedUpdates) {
      return {
        success: false,
        error: 'No update data to reapply'
      }
    }

    const store = this.context.getStore()
    store.updateClip(this.clipId, this.adjustedUpdates)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }
}