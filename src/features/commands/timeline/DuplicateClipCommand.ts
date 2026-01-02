/**
 * DuplicateClipCommand - Duplicate a clip on the timeline.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/stores/project-store'
import { duplicateClipInTrack } from '@/features/timeline/timeline-operations'
import { EffectsFactory } from '@/features/effects/effects-factory'

export class DuplicateClipCommand extends PatchedCommand<{ newClipId: string }> {
  private clipId: string
  private newClipId?: string

  constructor(
    context: CommandContext,
    clipId: string
  ) {
    super(context, {
      name: 'DuplicateClip',
      description: `Duplicate clip ${clipId}`,
      category: 'timeline'
    })
    this.clipId = clipId
  }

  canExecute(): boolean {
    return this.context.findClip(this.clipId) !== null
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
        throw new Error('No active project')
    }

    const newClip = duplicateClipInTrack(draft.currentProject, this.clipId)
    if (!newClip) {
        throw new Error('Failed to duplicate clip')
    }

    const newClipId = newClip.id

    // Duplicated clips should get matching derived keystroke blocks.
    EffectsFactory.syncKeystrokeEffects(draft.currentProject)

    // Select the duplicated clip
    draft.selectedClips = [newClipId]

    this.newClipId = newClipId
    this.setResult({ success: true, data: { newClipId } })
  }
}
