import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export class RemoveClipCommand extends Command<{ clipId: string }> {
  private clip?: Clip
  private clipIndex?: number
  private wasSelected: boolean = false
  private trackId?: string

  constructor(
    private context: CommandContext,
    private clipId: string
  ) {
    super({
      name: 'RemoveClip',
      description: `Remove clip ${clipId}`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    return result !== null
  }

  private shiftedClips: { id: string, oldStartTime: number }[] = []

  doExecute(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)

    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    // Store clip data for undo
    this.clip = { ...result.clip }
    this.trackId = result.track.id
    this.clipIndex = result.track.clips.indexOf(result.clip)
    this.wasSelected = this.context.getSelectedClips().includes(this.clipId)

    // Check for Auto Ripple
    const shouldRipple = store.settings.editing.autoRipple
    if (shouldRipple) {
      // Find clips on the same track that start after the removed clip
      const subsequentClips = result.track.clips.filter(c => c.startTime > result.clip.startTime)

      // Store their original positions for undo
      this.shiftedClips = subsequentClips.map(c => ({
        id: c.id,
        oldStartTime: c.startTime
      }))

      // Shift them left by the duration of the removed clip
      subsequentClips.forEach(c => {
        store.updateClip(c.id, { startTime: c.startTime - result.clip.duration })
      })
    }

    // Remove using store method
    store.removeClip(this.clipId)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doUndo(): CommandResult<{ clipId: string }> {
    if (!this.clip || !this.trackId || this.clipIndex === undefined) {
      return {
        success: false,
        error: 'Cannot undo: missing clip data'
      }
    }

    const store = this.context.getStore()

    // 1. Restore the removed clip
    store.restoreClip(this.trackId, this.clip, this.clipIndex)

    // 2. Restore shifted clips (if any)
    // We must do this AFTER restoring the clip to ensure the track structure is correct,
    // although technically they are independent updates.
    if (this.shiftedClips.length > 0) {
      this.shiftedClips.forEach(item => {
        store.updateClip(item.id, { startTime: item.oldStartTime })
      })
    }

    // Restore selection if it was selected
    if (this.wasSelected) {
      store.selectClip(this.clipId)
    }

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doRedo(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()

    // 1. Apply Ripple (Shift clips)
    // We need to re-calculate or use stored data. 
    // Since we stored oldStartTime, we can calculate newStartTime.
    // Or just re-run the logic if we can access the clip duration.
    // But this.clip is available.

    if (this.shiftedClips.length > 0 && this.clip) {
      this.shiftedClips.forEach(item => {
        store.updateClip(item.id, { startTime: item.oldStartTime - this.clip!.duration })
      })
    }

    // 2. Remove the clip
    store.removeClip(this.clipId)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }
}