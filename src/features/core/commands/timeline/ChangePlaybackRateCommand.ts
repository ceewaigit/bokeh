/**
 * ChangePlaybackRateCommand - Change clip playback speed.
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { computeEffectiveDuration } from '@/features/ui/timeline/time/time-space-converter'
import { updateClipInTrack } from '@/features/ui/timeline/clips/clip-crud'
import { TimelineSyncService } from '@/features/effects/sync'
import { PlayheadService } from '@/features/playback/services/playhead-service'
import { playbackService } from '@/features/playback/services/playback-service'

export class ChangePlaybackRateCommand extends TimelineCommand<{ clipId: string; playbackRate: number }> {
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
    const project = draft.currentProject
    if (!project) throw new Error('No active project')

    const lookup = this.findClip(project, this.clipId)
    if (!lookup) throw new Error(`Clip ${this.clipId} not found`)

    const { clip, track } = lookup
    const oldDuration = clip.duration

    const newDuration = computeEffectiveDuration(clip, this.playbackRate)
    const validSourceOut = (clip.sourceOut != null && isFinite(clip.sourceOut))
      ? clip.sourceOut
      : (clip.sourceIn || 0) + (clip.duration * (clip.playbackRate || 1))

    const updates = {
      playbackRate: this.playbackRate,
      duration: newDuration,
      sourceOut: validSourceOut
    }

    if (!updateClipInTrack(project, this.clipId, updates, undefined, track)) {
      throw new Error('updateClip: Failed to update clip')
    }

    const updatedLookup = this.findClip(project, this.clipId)
    if (updatedLookup) {
      const clipChange = TimelineSyncService.buildRateChange(updatedLookup.clip, oldDuration, track.type)
      this.setPendingChange(draft, clipChange)

      // Maintain playhead relative position
      const newTime = PlayheadService.trackPlayheadDuringClipEdit(
        draft.currentTime, clip, updatedLookup.clip
      )
      if (newTime !== null) {
        draft.currentTime = playbackService.seek(newTime, project.timeline.duration)
      }
    }

    this.clampPlayhead(draft)
    this.setResult({
      success: true,
      data: { clipId: this.clipId, playbackRate: this.playbackRate }
    })
  }
}
