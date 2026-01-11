/**
 * UpdateZoomBlockCommand - Update zoom effects in timeline.effects[]
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { ZoomBlock } from '@/types/project'
import { EffectType } from '@/types/project'
import { EffectStore } from '@/features/effects/core/store'
import { TimelineConfig } from '@/features/ui/timeline/config'

export class UpdateZoomBlockCommand extends PatchedCommand<{ blockId: string }> {
  private blockId: string
  private updates: Partial<ZoomBlock>

  constructor(
    context: CommandContext,
    blockId: string,
    updates: Partial<ZoomBlock>
  ) {
    super(context, {
      name: 'UpdateZoomBlock',
      description: `Update zoom block ${blockId}`,
      category: 'effects'
    })
    this.blockId = blockId
    this.updates = updates
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    if (!project) return false
    const effect = EffectStore.get(project, this.blockId)
    return effect?.type === EffectType.Zoom
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
      throw new Error('No active project')
    }

    const effect = EffectStore.get(draft.currentProject, this.blockId)
    if (!effect || effect.type !== EffectType.Zoom) {
      throw new Error(`Zoom effect ${this.blockId} not found`)
    }

    // Validate timing
    const nextStartTime = this.updates.startTime ?? effect.startTime
    const nextEndTime = this.updates.endTime ?? effect.endTime

    if (!Number.isFinite(nextStartTime) || !Number.isFinite(nextEndTime)) {
      throw new Error(`Invalid zoom timing for ${this.blockId}`)
    }
    if (nextEndTime <= nextStartTime) {
      throw new Error(`Zoom block ${this.blockId} must have positive duration`)
    }
    if (nextEndTime - nextStartTime < TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS) {
      throw new Error(`Zoom block ${this.blockId} is shorter than minimum duration`)
    }

    // Update effect times
    effect.startTime = nextStartTime
    effect.endTime = nextEndTime

    // Update effect data
    const zoomData = effect.data as any

    if ('origin' in this.updates) zoomData.origin = this.updates.origin
    if (this.updates.scale !== undefined) zoomData.scale = this.updates.scale
    if ('targetX' in this.updates) zoomData.targetX = this.updates.targetX
    if ('targetY' in this.updates) zoomData.targetY = this.updates.targetY
    if ('screenWidth' in this.updates) zoomData.screenWidth = this.updates.screenWidth
    if ('screenHeight' in this.updates) zoomData.screenHeight = this.updates.screenHeight
    if (this.updates.introMs !== undefined) zoomData.introMs = this.updates.introMs
    if (this.updates.outroMs !== undefined) zoomData.outroMs = this.updates.outroMs
    if (this.updates.smoothing !== undefined) zoomData.smoothing = this.updates.smoothing
    if ('followStrategy' in this.updates) zoomData.followStrategy = this.updates.followStrategy
    if ('autoScale' in this.updates) zoomData.autoScale = this.updates.autoScale
    if ('mouseIdlePx' in this.updates) zoomData.mouseIdlePx = this.updates.mouseIdlePx
    if ('transitionStyle' in this.updates) zoomData.transitionStyle = this.updates.transitionStyle
    if ('mouseFollowAlgorithm' in this.updates) zoomData.mouseFollowAlgorithm = this.updates.mouseFollowAlgorithm
    if ('zoomIntoCursorMode' in this.updates) zoomData.zoomIntoCursorMode = this.updates.zoomIntoCursorMode

    draft.currentProject.modifiedAt = new Date().toISOString()

    this.setResult({ success: true, data: { blockId: this.blockId } })
  }
}
