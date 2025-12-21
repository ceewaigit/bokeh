import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import { computeEffectiveDuration } from '@/lib/timeline/time-space-converter'

export class ChangePlaybackRateCommand extends Command<{ clipId: string; playbackRate: number }> {
  private originalClip?: Clip
  private originalPlaybackRate?: number
  private originalDuration?: number
  private originalSourceOut?: number
  private appliedDuration?: number
  private appliedSourceOut?: number

  constructor(
    private context: CommandContext,
    private clipId: string,
    private playbackRate: number
  ) {
    super({
      name: 'ChangePlaybackRate',
      description: `Change playback rate to ${playbackRate}x`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false

    // Validate playback rate range (similar to Remotion's limits)
    return this.playbackRate > 0.0625 && this.playbackRate <= 16
  }

  doExecute(): CommandResult<{ clipId: string; playbackRate: number }> {
    const result = this.context.findClip(this.clipId)
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    // Store original state for undo
    this.originalClip = { ...result.clip }
    this.originalPlaybackRate = result.clip.playbackRate || 1.0
    this.originalDuration = result.clip.duration
    this.originalSourceOut = result.clip.sourceOut

    // Use utility to compute new effective duration
    const newDuration = computeEffectiveDuration(result.clip, this.playbackRate)

    // Calculate sourceOut if missing or invalid (NaN)
    // sourceOut should remain constant when playback rate changes (same source range, different speed)
    const validSourceOut = (result.clip.sourceOut != null && isFinite(result.clip.sourceOut))
      ? result.clip.sourceOut
      : (result.clip.sourceIn || 0) + (result.clip.duration * (result.clip.playbackRate || 1))

    this.appliedDuration = newDuration
    this.appliedSourceOut = validSourceOut

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

  doUndo(): CommandResult<{ clipId: string; playbackRate: number }> {
    if (!this.originalClip || this.originalDuration === undefined) {
      return {
        success: false,
        error: 'No original clip state to restore'
      }
    }

    const store = this.context.getStore()
    store.updateClip(this.clipId, {
      playbackRate: this.originalPlaybackRate,
      duration: this.originalDuration,
      sourceOut: this.originalSourceOut
    }, { exact: true })

    return {
      success: true,
      data: { clipId: this.clipId, playbackRate: this.originalPlaybackRate || 1.0 }
    }
  }

  doRedo(): CommandResult<{ clipId: string; playbackRate: number }> {
    if (this.appliedDuration === undefined) {
      return this.doExecute()
    }

    const store = this.context.getStore()
    store.updateClip(this.clipId, {
      playbackRate: this.playbackRate,
      duration: this.appliedDuration,
      sourceOut: this.appliedSourceOut
    }, { exact: true })

    return {
      success: true,
      data: { clipId: this.clipId, playbackRate: this.playbackRate }
    }
  }
} 
