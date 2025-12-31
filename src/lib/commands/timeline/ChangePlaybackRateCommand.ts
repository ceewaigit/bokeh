/**
 * ChangePlaybackRateCommand - Change clip playback speed.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import type { CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { computeEffectiveDuration } from '@/features/timeline/time/time-space-converter'

export class ChangePlaybackRateCommand extends PatchedCommand<{ clipId: string; playbackRate: number }> {
  private clipId: string
  private playbackRate: number

  constructor(
    context: CommandContext,
    clipId: string,
    playbackRate: number
  ) {
    super(context, {
      name: 'ChangePlaybackRate',
      description: `Change playback rate to ${playbackRate}x`,
      category: 'timeline'
    })
    this.clipId = clipId
    this.playbackRate = playbackRate
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false
    return this.playbackRate > 0.0625 && this.playbackRate <= 16
  }

  doExecute(): CommandResult<{ clipId: string; playbackRate: number }> {
    const result = this.context.findClip(this.clipId)
    if (!result) {
      return { success: false, error: `Clip ${this.clipId} not found` }
    }

    const newDuration = computeEffectiveDuration(result.clip, this.playbackRate)

    const validSourceOut = (result.clip.sourceOut != null && isFinite(result.clip.sourceOut))
      ? result.clip.sourceOut
      : (result.clip.sourceIn || 0) + (result.clip.duration * (result.clip.playbackRate || 1))

    const store = this.context.getStore()
    store.updateClip(this.clipId, {
      playbackRate: this.playbackRate,
      duration: newDuration,
      sourceOut: validSourceOut
    })

    return {
      success: true,
      data: { clipId: this.clipId, playbackRate: this.playbackRate }
    }
  }
}
