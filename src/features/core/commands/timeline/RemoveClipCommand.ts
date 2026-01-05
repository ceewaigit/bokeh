/**
 * RemoveClipCommand - Remove a clip from the timeline.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { removeClipFromTrack } from '@/features/ui/timeline/clips/clip-crud'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { ProjectCleanupService } from '@/features/ui/timeline/project-cleanup'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { TrackType } from '@/types/project'

export class RemoveClipCommand extends PatchedCommand<{ clipId: string }> {
  private clipId: string

  constructor(
    context: CommandContext,
    clipId: string
  ) {
    super(context, {
      name: 'RemoveClip',
      description: `Remove clip ${clipId}`,
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

    const project = draft.currentProject

    // We need to find the clip on the DRAFT project
    const result = ClipLookup.byId(project, this.clipId)

    if (!result) {
      throw new Error(`Clip ${this.clipId} not found`)
    }

    const { clip, track } = result
    const isWebcamTrack = track.type === TrackType.Webcam

    // Auto Ripple handling - SKIP for webcam track (overlays can be placed anywhere)
    const shouldRipple = draft.settings.editing.autoRipple && !isWebcamTrack
    if (shouldRipple) {
      const subsequentClips = track.clips.filter(c => c.startTime > clip.startTime)
      subsequentClips.forEach(c => {
        c.startTime -= clip.duration
      })
    }

    // Logic from timeline-slice.ts: removeClip
    // Get clip info BEFORE removal to check recording reference
    const recordingIdToCheck = clip.recordingId

    if (removeClipFromTrack(project, this.clipId, track)) {
      // Clip removal changes layout; rebuild derived keystroke blocks.
      EffectInitialization.syncKeystrokeEffects(project)

      // Clear selection if removed clip was selected
      draft.selectedClips = draft.selectedClips.filter(id => id !== this.clipId)

      // CLEANUP: Remove clip-bound effects (webcam effects, etc.)
      if (project.timeline.effects) {
        project.timeline.effects = project.timeline.effects.filter(e => e.clipId !== this.clipId)
      }

      // MEMORY CLEANUP: Check if recording is still referenced by other clips
      if (recordingIdToCheck) {
        ProjectCleanupService.cleanupUnusedRecordings(project, recordingIdToCheck)

        // WEBCAM-SPECIFIC: Clean up transcript/subtitle data if no more webcam clips use this recording
        if (isWebcamTrack) {
          ProjectCleanupService.cleanupWebcamRecordingData(project, recordingIdToCheck)
        }
      }

      // Always clean up clip-specific resources
      ProjectCleanupService.cleanupClipResources(this.clipId)

      // Clear render caches to prevent stale data after clip removal
      TimelineDataService.invalidateCache(project)
    }

    this.setResult({ success: true, data: { clipId: this.clipId } })
  }
}
