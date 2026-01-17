/**
 * RemoveZoomBlockCommand - Remove a zoom effect from the project.
 *
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { Project } from '@/types/project'
import { EffectType } from '@/types/project'
import { EffectStore } from '@/features/effects/core/effects-store'
import { markProjectModified } from '@/features/core/stores/store-utils'

/**
 * Find zoom effect in the project using EffectStore
 */
function findZoomEffect(project: Project | null, effectId: string): boolean {
  if (!project) return false
  const effect = EffectStore.get(project, effectId)
  return effect?.type === EffectType.Zoom
}

export class RemoveZoomBlockCommand extends PatchedCommand<{ blockId: string }> {
  private blockId: string

  constructor(
    context: CommandContext,
    blockId: string
  ) {
    super(context, {
      name: 'RemoveZoomBlock',
      description: `Remove zoom block ${blockId}`,
      category: 'effects'
    })
    this.blockId = blockId
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    return findZoomEffect(project, this.blockId)
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
      throw new Error('No active project')
    }

    const effect = EffectStore.get(draft.currentProject, this.blockId)
    if (!effect || effect.type !== EffectType.Zoom) {
      throw new Error(`Zoom effect ${this.blockId} not found`)
    }

    // Remove effect using EffectStore - Immer patches will handle undo
    EffectStore.remove(draft.currentProject, this.blockId)
    markProjectModified(draft)

    this.setResult({ success: true, data: { blockId: this.blockId } })
  }
}
