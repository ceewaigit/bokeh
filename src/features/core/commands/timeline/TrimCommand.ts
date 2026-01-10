/**
 * TrimCommand - Trim clips from start or end.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { executeTrimClipStart, executeTrimClipEnd } from '@/features/ui/timeline/clips/clip-trim'
import { EffectSyncService } from '@/features/effects/sync'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'

export type TrimSide = 'start' | 'end'

export class TrimCommand extends PatchedCommand<{ clipId: string }> {
  private trimPosition: number
  private side: TrimSide
  private clipId: string

  constructor(
    context: CommandContext,
    clipId: string,
    trimPosition: number,
    side: TrimSide
  ) {
    super(context, {
      name: 'Trim',
      description: `Trim ${side} of clip ${clipId} at ${trimPosition}ms`,
      category: 'timeline'
    })
    this.clipId = clipId
    this.trimPosition = trimPosition
    this.side = side
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false
    const { clip } = result

    if (this.side === 'start') {
      return this.trimPosition > clip.startTime && this.trimPosition < clip.startTime + clip.duration
    } else {
      return this.trimPosition > clip.startTime && this.trimPosition < clip.startTime + clip.duration
    }
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

    // Capture state BEFORE trim for effect sync
    const oldState = {
      startTime: clip.startTime,
      endTime: clip.startTime + clip.duration,
      sourceIn: clip.sourceIn || 0,
      sourceOut: clip.sourceOut || clip.duration,
    }

    if (this.side === 'start') {
      if (!executeTrimClipStart(draft.currentProject, this.clipId, this.trimPosition)) {
        throw new Error('Trim start failed')
      }
    } else if (!executeTrimClipEnd(draft.currentProject, this.clipId, this.trimPosition)) {
      throw new Error('Trim end failed')
    }

    // Re-lookup clip to get updated state
    const updatedResult = ClipLookup.byId(draft.currentProject, this.clipId)
    if (updatedResult) {
      const clipChange = EffectSyncService.buildTrimChange(updatedResult.clip, this.side, oldState)
      EffectSyncService.syncAfterClipChange(draft.currentProject, clipChange)
    }

    // Clear render caches after trim operation
    TimelineDataService.invalidateCache(draft.currentProject)

    this.setResult({ success: true, data: { clipId: this.clipId } })
  }
}

