/**
 * AddEffectCommand - Add an effect to the project.
 *
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { Effect } from '@/types/project'
import { EffectStore } from '@/features/effects/core/effects-store'
import { markProjectModified } from '@/features/core/stores/store-utils'

export class AddEffectCommand extends PatchedCommand<{ effectId: string }> {
    private effect: Effect

    constructor(
        context: CommandContext,
        effect: Effect
    ) {
        super(context, {
            name: 'AddEffect',
            description: `Add effect ${effect.id}`,
            category: 'effects'
        })
        this.effect = effect
    }

    canExecute(): boolean {
        return !!this.context.getProject()
    }

    protected mutate(draft: WritableDraft<ProjectStore>): void {
        if (!draft.currentProject) {
            throw new Error('No active project')
        }

        EffectStore.add(draft.currentProject, this.effect)
        markProjectModified(draft)

        this.setResult({ success: true, data: { effectId: this.effect.id } })
    }
}
