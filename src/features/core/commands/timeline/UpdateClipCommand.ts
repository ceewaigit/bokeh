/**
 * UpdateClipCommand - Update clip properties.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { updateClipInTrack } from '@/features/ui/timeline/clips/clip-crud'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { PlayheadService } from '@/features/ui/timeline/playback/playhead-service'
import { playbackService } from '@/features/ui/timeline/playback/playback-service'

export class UpdateClipCommand extends PatchedCommand<{ clipId: string }> {
  private clipId: string
  private updates: Partial<Clip>
  private options?: { exact?: boolean; maintainContiguous?: boolean }

  constructor(
    context: CommandContext,
    clipId: string,
    updates: Partial<Clip>,
    options?: { exact?: boolean; maintainContiguous?: boolean }
  ) {
    super(context, {
      name: 'UpdateClip',
      description: `Update clip ${clipId}`,
      category: 'timeline',
      coalesceKey: `UpdateClip:${clipId}`,
      coalesceWindowMs: 1000
    })
    this.clipId = clipId
    this.updates = updates
    this.options = options
  }

  canExecute(): boolean {
    return this.context.findClip(this.clipId) !== null
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
      throw new Error('No active project')
    }

    // Get clip info before update for playhead tracking
    const result = ClipLookup.byId(draft.currentProject, this.clipId)
    if (!result) {
      throw new Error(`Clip ${this.clipId} not found`)
    }

    // Use the service to update the clip
    if (!updateClipInTrack(draft.currentProject, this.clipId, this.updates, this.options, result.track)) {
      throw new Error('updateClip: Failed to update clip')
    }

    // Clip timing/position can change; keep derived keystroke blocks aligned.
    EffectInitialization.syncKeystrokeEffects(draft.currentProject)

    // Maintain playhead relative position inside the edited clip
    const updatedResult = ClipLookup.byId(draft.currentProject, this.clipId)
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
