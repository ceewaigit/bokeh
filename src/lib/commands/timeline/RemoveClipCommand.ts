/**
 * RemoveClipCommand - Remove a clip from the timeline.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import type { CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'

export class RemoveClipCommand extends PatchedCommand<{ clipId: string }> {
  private clipId: string

  constructor(
    context: CommandContext,
    clipId: string
  ) {
    super(context, {
      name: 'RemoveClip',
      description: `Remove clip ${clipId}`,
      category: 'timeline'
    })
    this.clipId = clipId
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

    // Auto Ripple handling
    const shouldRipple = store.settings.editing.autoRipple
    if (shouldRipple) {
      const subsequentClips = result.track.clips.filter(c => c.startTime > result.clip.startTime)
      subsequentClips.forEach(c => {
        store.updateClip(c.id, { startTime: c.startTime - result.clip.duration })
      })
    }

    store.removeClip(this.clipId)
    return { success: true, data: { clipId: this.clipId } }
  }
}