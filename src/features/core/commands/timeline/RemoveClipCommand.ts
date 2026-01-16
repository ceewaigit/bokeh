/**
 * RemoveClipCommand - Remove a clip from the timeline.
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { removeClipFromTrack } from '@/features/ui/timeline/clips/clip-crud'
import { TimelineSyncService } from '@/features/effects/sync'
import { ProjectCleanupService } from '@/features/ui/timeline/project-cleanup'
import { TrackType } from '@/types/project'

export class RemoveClipCommand extends TimelineCommand<{ clipId: string }> {
  private clipId: string

  constructor(
    context: CommandContext,
    clipId: string
  ) {
    super(context, {
      name: 'RemoveClip',
      description: `Remove clip`,
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

    const lookup = this.findClip(project, this.clipId)
    if (!lookup) throw new Error(`Clip ${this.clipId} not found`)

    const { clip, track } = lookup
    const isWebcamTrack = track.type === TrackType.Webcam

    // Build clip change for sync
    const clipChange = TimelineSyncService.buildDeleteChange(clip, track.type)

    // Auto ripple - skip for webcam track
    const shouldRipple = draft.settings.editing.autoRipple && !isWebcamTrack
    if (shouldRipple) {
      track.clips.filter(c => c.startTime > clip.startTime).forEach(c => {
        c.startTime -= clip.duration
      })
    }

    const recordingIdToCheck = clip.recordingId

    if (removeClipFromTrack(project, this.clipId, track)) {
      draft.selectedClips = draft.selectedClips.filter(id => id !== this.clipId)

      // Set pending change for middleware
      this.setPendingChange(draft, clipChange)

      // Memory cleanup
      if (recordingIdToCheck) {
        ProjectCleanupService.cleanupUnusedRecordings(project, recordingIdToCheck)
        if (isWebcamTrack) {
          ProjectCleanupService.cleanupWebcamRecordingData(project, recordingIdToCheck)
        }
      }
      ProjectCleanupService.cleanupClipResources(this.clipId)
    }

    this.clampPlayhead(draft)
    this.setResult({ success: true, data: { clipId: this.clipId } })
  }
}

