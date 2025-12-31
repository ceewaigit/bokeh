/**
 * TrimCommand - Trim clips from start or end.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import type { CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'

export type TrimSide = 'start' | 'end'

export class TrimCommand extends PatchedCommand<{ clipId: string }> {
  private trimPosition: number
  private side: TrimSide
  private clipId: string

  constructor(
    context: CommandContext,
    clipId: string,
    trimPosition: number,
    side: TrimSide
  ) {
    super(context, {
      name: 'Trim',
      description: `Trim ${side} of clip ${clipId} at ${trimPosition}ms`,
      category: 'timeline'
    })
    this.clipId = clipId
    this.trimPosition = trimPosition
    this.side = side
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false

    const { clip } = result

    if (this.side === 'start') {
      return this.trimPosition > clip.startTime && this.trimPosition < clip.startTime + clip.duration
    } else {
      return this.trimPosition > clip.startTime && this.trimPosition < clip.startTime + clip.duration
    }
  }

  doExecute(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)

    if (!result) {
      return { success: false, error: `Clip ${this.clipId} not found` }
    }

    const { clip } = result

    if (this.side === 'start') {
      if (this.trimPosition <= clip.startTime || this.trimPosition >= clip.startTime + clip.duration) {
        return { success: false, error: 'Invalid trim position for start' }
      }
    } else {
      if (this.trimPosition <= clip.startTime || this.trimPosition >= clip.startTime + clip.duration) {
        return { success: false, error: 'Invalid trim position for end' }
      }
    }

    if (this.side === 'start') {
      store.trimClipStart(this.clipId, this.trimPosition)
    } else {
      store.trimClipEnd(this.clipId, this.trimPosition)
    }

    return { success: true, data: { clipId: this.clipId } }
  }
}