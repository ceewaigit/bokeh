/**
 * ChangePlaybackRateCommand - Change clip playback speed.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/stores/project-store'
import { computeEffectiveDuration } from '@/features/timeline/time/time-space-converter'
import { ClipLookup } from '@/features/timeline/clips/clip-lookup'
import { updateClipInTrack } from '@/features/timeline/clips/clip-crud'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { PlayheadService } from '@/features/timeline/playback/playhead-service'
import { playbackService } from '@/features/timeline/playback/playback-service'

export class ChangePlaybackRateCommand extends PatchedCommand<{ clipId: string; playbackRate: number }> {
  private clipId: string
  private playbackRate: number

  constructor(
    context: CommandContext,
    clipId: string,
    playbackRate: number
  ) {
    super(context, {
      name: 'ChangePlaybackRate',
      description: `Change playback rate to ${playbackRate}x`,
      category: 'timeline'
    })
    this.clipId = clipId
    this.playbackRate = playbackRate
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false
    return this.playbackRate > 0.0625 && this.playbackRate <= 16
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
      throw new Error('No active project')
    }

    const result = ClipLookup.byId(draft.currentProject, this.clipId)
    if (!result) {
      throw new Error(`Clip ${this.clipId} not found`)
    }

    const { clip } = result

    const newDuration = computeEffectiveDuration(clip, this.playbackRate)

    const validSourceOut = (clip.sourceOut != null && isFinite(clip.sourceOut))
      ? clip.sourceOut
      : (clip.sourceIn || 0) + (clip.duration * (clip.playbackRate || 1))

    const updates = {
      playbackRate: this.playbackRate,
      duration: newDuration,
      sourceOut: validSourceOut
    }

    // Use the service to update the clip
    if (!updateClipInTrack(draft.currentProject, this.clipId, updates, undefined, result.track)) {
      throw new Error('updateClip: Failed to update clip')
    }

    // Clip timing/position can change; keep derived keystroke blocks aligned.
    EffectInitialization.syncKeystrokeEffects(draft.currentProject)

    // Maintain playhead relative position inside the edited clip
    const updatedResult = ClipLookup.byId(draft.currentProject, this.clipId)
    if (updatedResult) {
      const newTime = PlayheadService.trackPlayheadDuringClipEdit(
        draft.currentTime,
        result.clip,
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

    this.setResult({
      success: true,
      data: { clipId: this.clipId, playbackRate: this.playbackRate }
    })
  }
}
