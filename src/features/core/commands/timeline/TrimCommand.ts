/**
 * TrimCommand - Trim clips from start or end.
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { executeTrimClipStart, executeTrimClipEnd } from '@/features/ui/timeline/clips/clip-trim'
import { TimelineSyncService } from '@/features/effects/sync'

export type TrimSide = 'start' | 'end'

export class TrimCommand extends TimelineCommand<{ clipId: string }> {
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
      description: `Trim ${side} of clip`,
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
    return this.trimPosition > clip.startTime && this.trimPosition < clip.startTime + clip.duration
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    const project = draft.currentProject
    if (!project) throw new Error('No active project')

    const lookup = this.findClip(project, this.clipId)
    if (!lookup) throw new Error(`Clip ${this.clipId} not found`)

    const { clip, track } = lookup
    const beforeState = this.buildClipState(clip)

    if (this.side === 'start') {
      if (!executeTrimClipStart(project, this.clipId, this.trimPosition)) {
        throw new Error('Trim start failed')
      }
    } else if (!executeTrimClipEnd(project, this.clipId, this.trimPosition)) {
      throw new Error('Trim end failed')
    }

    // Re-lookup clip to get updated state
    const updatedLookup = this.findClip(project, this.clipId)
    if (updatedLookup) {
      const clipChange = TimelineSyncService.buildTrimChange(
        updatedLookup.clip, this.side, beforeState, track.type
      )
      this.setPendingChange(draft, clipChange)
    }

    this.clampPlayhead(draft)
    this.setResult({ success: true, data: { clipId: this.clipId } })
  }
}

