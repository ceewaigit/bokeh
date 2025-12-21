import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export type TrimSide = 'start' | 'end'

export class TrimCommand extends Command<{ clipId: string }> {
  private originalClip?: Clip
  private trimPosition: number
  private side: TrimSide

  constructor(
    private context: CommandContext,
    private clipId: string,
    trimPosition: number,
    side: TrimSide
  ) {
    super({
      name: 'Trim',
      description: `Trim ${side} of clip ${clipId} at ${trimPosition}ms`,
      category: 'timeline'
    })
    this.trimPosition = trimPosition
    this.side = side
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false
    
    const { clip } = result
    
    if (this.side === 'start') {
      // Can't trim start beyond clip bounds
      return this.trimPosition > clip.startTime && this.trimPosition < clip.startTime + clip.duration
    } else {
      // Can't trim end beyond clip bounds
      return this.trimPosition > clip.startTime && this.trimPosition < clip.startTime + clip.duration
    }
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

    const { clip } = result
    
    // Validate trim position based on side
    if (this.side === 'start') {
      if (this.trimPosition <= clip.startTime || this.trimPosition >= clip.startTime + clip.duration) {
        return {
          success: false,
          error: 'Invalid trim position for start'
        }
      }
    } else {
      if (this.trimPosition <= clip.startTime || this.trimPosition >= clip.startTime + clip.duration) {
        return {
          success: false,
          error: 'Invalid trim position for end'
        }
      }
    }
    
    // Store original state for undo
    this.originalClip = JSON.parse(JSON.stringify(clip))
    
    // Apply trim using store methods
    if (this.side === 'start') {
      store.trimClipStart(this.clipId, this.trimPosition)
    } else {
      store.trimClipEnd(this.clipId, this.trimPosition)
    }

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
    
    // Restore original clip properties exactly as they were
    store.updateClip(this.clipId, {
      startTime: this.originalClip.startTime,
      duration: this.originalClip.duration,
      sourceIn: this.originalClip.sourceIn,
      sourceOut: this.originalClip.sourceOut
    }, { exact: true })

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doRedo(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    
    // Re-apply the trim
    if (this.side === 'start') {
      store.trimClipStart(this.clipId, this.trimPosition)
    } else {
      store.trimClipEnd(this.clipId, this.trimPosition)
    }

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }
}