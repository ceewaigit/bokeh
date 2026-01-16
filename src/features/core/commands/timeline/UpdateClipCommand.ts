/**
 * UpdateClipCommand - Update clip properties.
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { updateClipInTrack } from '@/features/ui/timeline/clips/clip-crud'
import { TimelineSyncService, syncKeystrokeEffects } from '@/features/effects/sync'
import { PlayheadService } from '@/features/playback/services/playhead-service'
import { playbackService } from '@/features/playback/services/playback-service'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'

export class UpdateClipCommand extends TimelineCommand<{ clipId: string }> {
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
      description: 'Update clip',
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
    const project = draft.currentProject
    if (!project) throw new Error('No active project')

    const lookup = this.findClip(project, this.clipId)
    if (!lookup) throw new Error(`Clip ${this.clipId} not found`)

    const { clip, track } = lookup
    const beforeState = this.buildClipState(clip)

    // Check if timing properties will change
    const timingChanged =
      this.updates.startTime !== undefined ||
      this.updates.duration !== undefined ||
      this.updates.sourceIn !== undefined ||
      this.updates.sourceOut !== undefined ||
      this.updates.playbackRate !== undefined

    // Use the service to update the clip
    if (!updateClipInTrack(project, this.clipId, this.updates, this.options, track)) {
      throw new Error('updateClip: Failed to update clip')
    }

    const updatedLookup = this.findClip(project, this.clipId)

    // Sync effects based on what changed
    if (timingChanged && updatedLookup) {
      const clipChange = TimelineSyncService.buildUpdateChange(
        updatedLookup.clip, beforeState, track.type
      )
      this.setPendingChange(draft, clipChange)
    } else {
      // Non-timing update: sync keystroke effects and invalidate cache
      syncKeystrokeEffects(project)
      TimelineDataService.invalidateCache(project)
    }

    // Maintain playhead relative position
    if (updatedLookup) {
      const newTime = PlayheadService.trackPlayheadDuringClipEdit(
        draft.currentTime, clip, updatedLookup.clip
      )
      if (newTime !== null) {
        draft.currentTime = playbackService.seek(newTime, project.timeline.duration)
      }
    }

    if (timingChanged) {
      this.clampPlayhead(draft)
    }

    this.setResult({ success: true, data: { clipId: this.clipId } })
  }
}
