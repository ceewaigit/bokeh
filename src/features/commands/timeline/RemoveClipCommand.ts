/**
 * RemoveClipCommand - Remove a clip from the timeline.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/stores/project-store'
import { findClipById } from '@/features/timeline/clips/clip-reflow'
import { removeClipFromTrack } from '@/features/timeline/clips/clip-crud'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { ProjectCleanupService } from '@/features/timeline/project-cleanup'
import { TimelineDataService } from '@/features/timeline/timeline-data-service'

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
    const result = findClipById(project, this.clipId)

    if (!result) {
      throw new Error(`Clip ${this.clipId} not found`)
    }
    
    const { clip, track } = result

    // Auto Ripple handling
    const shouldRipple = draft.settings.editing.autoRipple
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

        // MEMORY CLEANUP: Check if recording is still referenced by other clips
        if (recordingIdToCheck) {
            ProjectCleanupService.cleanupUnusedRecordings(project, recordingIdToCheck)
        }

        // Always clean up clip-specific resources
        ProjectCleanupService.cleanupClipResources(this.clipId)

        // Clear render caches to prevent stale data after clip removal
        TimelineDataService.invalidateCache(project)
    }
    
    this.setResult({ success: true, data: { clipId: this.clipId } })
  }
}
