/**
 * UpdateClipCommand - Update clip properties.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import type { CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/stores/project-store'
import { findClipById, updateClipInTrack } from '@/features/timeline/timeline-operations'
import { EffectsFactory } from '@/features/effects/effects-factory'
import { PlayheadService } from '@/features/timeline/playback/playhead-service'
import { playbackService } from '@/features/timeline/playback/playback-service'

export class UpdateClipCommand extends PatchedCommand<{ clipId: string }> {
  private clipId: string
  private updates: Partial<Clip>

  constructor(
    context: CommandContext,
    clipId: string,
    updates: Partial<Clip>
  ) {
    super(context, {
      name: 'UpdateClip',
      description: `Update clip ${clipId}`,
      category: 'timeline'
    })
    this.clipId = clipId
    this.updates = updates
  }

  canExecute(): boolean {
    return this.context.findClip(this.clipId) !== null
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
        throw new Error('No active project')
    }

    // Get clip info before update for playhead tracking
    const result = findClipById(draft.currentProject, this.clipId)
    if (!result) {
        throw new Error(`Clip ${this.clipId} not found`)
    }

    // Use the service to update the clip
    if (!updateClipInTrack(draft.currentProject, this.clipId, this.updates, undefined, result.track)) {
        throw new Error('updateClip: Failed to update clip')
    }

    // Clip timing/position can change; keep derived keystroke blocks aligned.
    EffectsFactory.syncKeystrokeEffects(draft.currentProject)

    // Maintain playhead relative position inside the edited clip
    const updatedResult = findClipById(draft.currentProject, this.clipId)
    if (updatedResult) {
        const newTime = PlayheadService.trackPlayheadDuringClipEdit(
            draft.currentTime,
            result.clip, // Note: result.clip reference in draft might be updated in-place by updateClipInTrack.
                         // For exact precision we might need a copy, but PlayheadService logic usually handles bounds.
            updatedResult.clip
        )
        if (newTime !== null) {
            draft.currentTime = playbackService.seek(newTime, draft.currentProject.timeline.duration)
        }
    }

    // Clamp current time inside new timeline bounds
    draft.currentTime = playbackService.seek(
        draft.currentTime,
        draft.currentProject.timeline.duration
    )
    
    this.setResult({ success: true, data: { clipId: this.clipId } })
  }
}
