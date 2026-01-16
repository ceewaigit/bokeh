/**
 * DuplicateClipCommand - Duplicate a clip on the timeline.
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { duplicateClipInTrack } from '@/features/ui/timeline/clips/clip-crud'

export class DuplicateClipCommand extends TimelineCommand<{ newClipId: string }> {
  private clipId: string

  constructor(
    context: CommandContext,
    clipId: string
  ) {
    super(context, {
      name: 'DuplicateClip',
      description: 'Duplicate clip',
      category: 'timeline'
    })
    this.clipId = clipId
  }

  canExecute(): boolean {
    return this.context.findClip(this.clipId) !== null
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    const project = draft.currentProject
    if (!project) throw new Error('No active project')

    const newClip = duplicateClipInTrack(project, this.clipId)
    if (!newClip) throw new Error('Failed to duplicate clip')

    // Set pending change for middleware
    this.setPendingChange(draft, this.buildAddChange(newClip))

    this.selectClip(draft, newClip.id)
    this.setResult({ success: true, data: { newClipId: newClip.id } })
  }
}
