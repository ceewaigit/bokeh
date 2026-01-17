/**
 * SplitClipCommand - Split a clip at a specific time point.
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { executeSplitClip } from '@/features/ui/timeline/clips/clip-split'
import { ClipChangeBuilder } from '@/features/effects/sync'

export interface SplitClipResult {
  originalClipId: string
  leftClipId: string
  rightClipId: string
}

export class SplitClipCommand extends TimelineCommand<SplitClipResult> {
  private clipId: string
  private splitTime: number

  constructor(
    context: CommandContext,
    clipId: string,
    splitTime: number
  ) {
    super(context, {
      name: 'SplitClip',
      description: `Split clip at ${splitTime}ms`,
      category: 'timeline'
    })
    this.clipId = clipId
    this.splitTime = splitTime
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false

    const { clip } = result
    // Inline clip-relative calculation: just subtract clip.startTime
    const relativeTime = this.splitTime - clip.startTime
    return relativeTime > 0 && relativeTime < clip.duration
  }

  protected doMutate(draft: WritableDraft<ProjectStore>): void {
    const project = draft.currentProject
    if (!project) throw new Error('No active project')

    const lookup = this.findClip(project, this.clipId)
    if (!lookup) throw new Error('Clip not found')

    const _beforeState = this.buildClipState(lookup.clip)
    const originalTrackType = lookup.track.type

    const result = executeSplitClip(project, this.clipId, this.splitTime)
    if (!result) throw new Error('Split failed')

    const { firstClip, secondClip } = result

    // Build and defer clip change for inline sync
    const clipChange = ClipChangeBuilder.buildSplitChange(
      lookup.clip,
      firstClip.id,
      secondClip.id,
      originalTrackType
    )
    this.deferClipChange(clipChange)

    // Select left clip and adjust playhead
    this.selectClip(draft, firstClip.id)
    if (draft.currentTime >= this.splitTime) {
      draft.currentTime = this.splitTime - 1
    }
    this.clampPlayhead(draft)

    this.setResult({
      success: true,
      data: {
        originalClipId: this.clipId,
        leftClipId: firstClip.id,
        rightClipId: secondClip.id
      }
    })
  }
}

