/**
 * UpdateEffectCommand - Update an effect in the project.
 *
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 * No longer needs manual originalData tracking.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { Effect } from '@/types/project'
import { EffectStore } from '@/features/effects/core/effects-store'
import { markProjectModified } from '@/features/core/stores/store-utils'

export class UpdateEffectCommand extends PatchedCommand<{ effectId: string }> {
    private effectId: string
    private updates: Partial<Effect>

    constructor(
        context: CommandContext,
        effectId: string,
        updates: Partial<Effect>
    ) {
        super(context, {
            name: 'UpdateEffect',
            description: `Update effect ${effectId}`,
            category: 'effects',
            coalesceKey: `UpdateEffect:${effectId}`,
            coalesceWindowMs: 1000
        })
        this.effectId = effectId
        this.updates = updates
    }

    canExecute(): boolean {
        const project = this.context.getProject()
        if (!project) return false
        return EffectStore.exists(project, this.effectId)
    }

    protected mutate(draft: WritableDraft<ProjectStore>): void {
        if (!draft.currentProject) {
            throw new Error('No active project')
        }

        const located = EffectStore.find(draft.currentProject, this.effectId)
        if (!located) {
            throw new Error('Effect not found')
        }

        // Update effect using EffectStore - Immer patches will capture the old state
        EffectStore.update(draft.currentProject, this.effectId, this.updates)
        markProjectModified(draft)

        this.setResult({ success: true, data: { effectId: this.effectId } })
    }
}
