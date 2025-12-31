/**
 * DuplicateClipCommand - Duplicate a clip on the timeline.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import type { CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'

export class DuplicateClipCommand extends PatchedCommand<{ newClipId: string }> {
  private clipId: string
  private newClipId?: string

  constructor(
    context: CommandContext,
    clipId: string
  ) {
    super(context, {
      name: 'DuplicateClip',
      description: `Duplicate clip ${clipId}`,
      category: 'timeline'
    })
    this.clipId = clipId
  }

  canExecute(): boolean {
    return this.context.findClip(this.clipId) !== null
  }

  doExecute(): CommandResult<{ newClipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)

    if (!result) {
      return { success: false, error: `Clip ${this.clipId} not found` }
    }

    const newClipId = store.duplicateClip(this.clipId)

    if (!newClipId) {
      return { success: false, error: 'Failed to duplicate clip' }
    }

    this.newClipId = newClipId
    return { success: true, data: { newClipId } }
  }
}
