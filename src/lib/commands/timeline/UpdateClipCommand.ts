/**
 * UpdateClipCommand - Update clip properties.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import type { CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export class UpdateClipCommand extends PatchedCommand<{ clipId: string }> {
  private clipId: string
  private updates: Partial<Clip>

  constructor(
    context: CommandContext,
    clipId: string,
    updates: Partial<Clip>
  ) {
    super(context, {
      name: 'UpdateClip',
      description: `Update clip ${clipId}`,
      category: 'timeline'
    })
    this.clipId = clipId
    this.updates = updates
  }

  canExecute(): boolean {
    return this.context.findClip(this.clipId) !== null
  }

  doExecute(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)

    if (!result) {
      return { success: false, error: `Clip ${this.clipId} not found` }
    }

    store.updateClip(this.clipId, this.updates)
    return { success: true, data: { clipId: this.clipId } }
  }
}
