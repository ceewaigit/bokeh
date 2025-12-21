import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export class DuplicateClipCommand extends Command<{ newClipId: string }> {
  private newClipId?: string
  private newClipSnapshot?: Clip
  private sourceTrackId?: string
  private insertIndex?: number

  constructor(
    private context: CommandContext,
    private clipId: string
  ) {
    super({
      name: 'DuplicateClip',
      description: `Duplicate clip ${clipId}`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    return result !== null
  }

  doExecute(): CommandResult<{ newClipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)
    
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    const { track } = result
    this.sourceTrackId = track.id
    this.insertIndex = Math.max(0, track.clips.findIndex(c => c.id === this.clipId) + 1)

    // Use store's duplicateClip method
    const newClipId = store.duplicateClip(this.clipId)
    
    if (!newClipId) {
      return {
        success: false,
        error: 'Failed to duplicate clip'
      }
    }

    this.newClipId = newClipId

    // Snapshot the duplicated clip for reliable undo/redo.
    const newClipResult = this.context.findClip(newClipId)
    if (!newClipResult) {
      return {
        success: false,
        error: 'Duplicated clip was not found after creation'
      }
    }
    this.newClipSnapshot = JSON.parse(JSON.stringify(newClipResult.clip))

    return {
      success: true,
      data: { newClipId: newClipId }
    }
  }

  doUndo(): CommandResult<{ newClipId: string }> {
    if (!this.newClipId) {
      return {
        success: false,
        error: 'No duplicated clip to remove'
      }
    }

    const store = this.context.getStore()
    store.removeClip(this.newClipId)

    // Restore selection to original clip
    store.selectClip(this.clipId)

    return {
      success: true,
      data: { newClipId: this.newClipId }
    }
  }

  doRedo(): CommandResult<{ newClipId: string }> {
    if (!this.newClipId || !this.newClipSnapshot || !this.sourceTrackId || this.insertIndex === undefined) {
      return {
        success: false,
        error: 'No clip data to re-duplicate'
      }
    }

    const store = this.context.getStore()

    // If clip already exists (e.g., due to a prior failed undo), avoid creating duplicates.
    if (this.context.findClip(this.newClipId)) {
      store.selectClip(this.newClipId)
      return {
        success: true,
        data: { newClipId: this.newClipId }
      }
    }

    // Reinsert into the original track and position; do not use addClip() since it targets the video track.
    store.restoreClip(this.sourceTrackId, JSON.parse(JSON.stringify(this.newClipSnapshot)), this.insertIndex)
    store.selectClip(this.newClipId)

    return {
      success: true,
      data: { newClipId: this.newClipId }
    }
  }
}
