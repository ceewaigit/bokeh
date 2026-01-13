/**
 * SplitClipCommand - Split a clip at a specific time point.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import { timelineToClipRelative } from '@/features/ui/timeline/time/time-space-converter'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { Clip } from '@/types/project'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { executeSplitClip } from '@/features/ui/timeline/clips/clip-split'
import { EffectSyncService } from '@/features/effects/sync'
import { playbackService } from '@/features/playback/services/playback-service'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'

export interface SplitClipResult {
  originalClipId: string
  leftClipId: string
  rightClipId: string
}

export class SplitClipCommand extends PatchedCommand<SplitClipResult> {
  private clipId: string
  private splitTime: number
  private leftClipId?: string
  private rightClipId?: string

  constructor(
    context: CommandContext,
    clipId: string,
    splitTime: number
  ) {
    super(context, {
      name: 'SplitClip',
      description: `Split clip ${clipId} at ${splitTime}ms`,
      category: 'timeline'
    })
    this.clipId = clipId
    this.splitTime = splitTime
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false

    const { clip } = result
    const relativeTime = timelineToClipRelative(this.splitTime, clip)
    return relativeTime > 0 && relativeTime < clip.duration
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
      throw new Error('No active project')
    }

    // Capture original clip info BEFORE split for effect sync
    const originalResult = ClipLookup.byId(draft.currentProject, this.clipId)
    const originalClip: Clip | null = originalResult ? { ...originalResult.clip } : null

    const result = executeSplitClip(draft.currentProject, this.clipId, this.splitTime)
    if (!result) {
      throw new Error('Split failed')
    }

    const { firstClip, secondClip } = result

    // Unified effect sync - handles crop duplication and keystroke regeneration
    if (originalClip) {
      const clipChange = EffectSyncService.buildSplitChange(originalClip, firstClip.id, secondClip.id)
      EffectSyncService.syncAfterClipChange(draft.currentProject, clipChange)
    }

    // Select the left clip to keep focus at the split point
    draft.selectedClips = [firstClip.id]

    // Move playhead to just before the split point
    if (draft.currentTime >= this.splitTime) {
      draft.currentTime = playbackService.seek(this.splitTime - 1, draft.currentProject.timeline.duration)
    }

    // Clear render caches to prevent stale data after split
    TimelineDataService.invalidateCache(draft.currentProject)

    this.leftClipId = firstClip.id
    this.rightClipId = secondClip.id

    this.setResult({
      success: true,
      data: {
        originalClipId: this.clipId,
        leftClipId: firstClip.id,
        rightClipId: secondClip.id
      }
    })
  }
}

