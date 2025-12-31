/**
 * TrimCommand - Trim clips from start or end.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/stores/project-store'
import { findClipById, executeTrimClipStart, executeTrimClipEnd } from '@/features/timeline/timeline-operations'
import { EffectsFactory } from '@/features/effects/effects-factory'
import { TimelineDataService } from '@/features/timeline/timeline-data-service'

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

    const result = findClipById(draft.currentProject, this.clipId)
    if (!result) {
      throw new Error(`Clip ${this.clipId} not found`)
    }

    const { clip } = result

    // Validate trim position again within the transaction to ensure consistency
    if (this.side === 'start') {
      if (this.trimPosition <= clip.startTime || this.trimPosition >= clip.startTime + clip.duration) {
        throw new Error('Invalid trim position for start')
      }

      if (!executeTrimClipStart(draft.currentProject, this.clipId, this.trimPosition)) {
        throw new Error('Trim start failed')
      }
    } else {
      if (this.trimPosition <= clip.startTime || this.trimPosition >= clip.startTime + clip.duration) {
        throw new Error('Invalid trim position for end')
      }

      if (!executeTrimClipEnd(draft.currentProject, this.clipId, this.trimPosition)) {
        throw new Error('Trim end failed')
      }
    }

    // Trim changes clip boundaries; rebuild derived keystroke blocks.
    EffectsFactory.syncKeystrokeEffects(draft.currentProject)

    // Clear render caches after trim operation
    TimelineDataService.invalidateCache(draft.currentProject)

    this.setResult({ success: true, data: { clipId: this.clipId } })
  }
}