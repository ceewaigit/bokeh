/**
 * SplitClipCommand - Split a clip at a specific time point.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import type { CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { timelineToClipRelative } from '@/features/timeline/time/time-space-converter'

export interface SplitClipResult {
  originalClipId: string
  leftClipId: string
  rightClipId: string
}

export class SplitClipCommand extends PatchedCommand<SplitClipResult> {
  private clipId: string
  private splitTime: number
  private leftClipId?: string
  private rightClipId?: string

  constructor(
    context: CommandContext,
    clipId: string,
    splitTime: number
  ) {
    super(context, {
      name: 'SplitClip',
      description: `Split clip ${clipId} at ${splitTime}ms`,
      category: 'timeline'
    })
    this.clipId = clipId
    this.splitTime = splitTime
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false

    const { clip } = result
    const relativeTime = timelineToClipRelative(this.splitTime, clip)
    return relativeTime > 0 && relativeTime < clip.duration
  }

  doExecute(): CommandResult<SplitClipResult> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)

    if (!result) {
      return { success: false, error: `Clip ${this.clipId} not found` }
    }

    const { track } = result
    const originalIndex = track.clips.findIndex(c => c.id === this.clipId)

    store.splitClip(this.clipId, this.splitTime)

    // Re-read project after store mutation to get new clip IDs
    const updatedProject = this.context.getProject()
    if (updatedProject) {
      const updatedTrack = updatedProject.timeline.tracks.find(t => t.id === track.id)
      if (updatedTrack && originalIndex !== -1) {
        const candidateLeft = updatedTrack.clips[originalIndex]
        const candidateRight = updatedTrack.clips[originalIndex + 1]
        if (candidateLeft) this.leftClipId = candidateLeft.id
        if (candidateRight) this.rightClipId = candidateRight.id
      }
    }

    return {
      success: true,
      data: {
        originalClipId: this.clipId,
        leftClipId: this.leftClipId || '',
        rightClipId: this.rightClipId || ''
      }
    }
  }
}
