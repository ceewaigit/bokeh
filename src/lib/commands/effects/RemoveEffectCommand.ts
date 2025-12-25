import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { Effect } from '@/types/project'
import { EffectStore } from '@/lib/core/effects'

export class RemoveEffectCommand extends Command {
    private originalEffect: Effect | null = null

    constructor(
        private context: CommandContext,
        private effectId: string
    ) {
        super({ name: 'RemoveEffect' })
    }

    canExecute(): boolean {
        return !!this.context.getProject()
    }

    async doExecute(): Promise<CommandResult> {
        const project = this.context.getProject()
        if (!project) return { success: false, error: 'No active project' }

        // Use EffectStore to find the effect (searches both timeline and legacy recording.effects)
        const located = EffectStore.find(project, this.effectId)
        if (!located) {
            return { success: false, error: 'Effect not found' }
        }

        this.originalEffect = JSON.parse(JSON.stringify(located.effect))
        this.context.getStore().removeEffect(this.effectId)

        return { success: true }
    }

    async doUndo(): Promise<CommandResult> {
        if (this.originalEffect) {
            this.context.getStore().addEffect(this.originalEffect)
            return { success: true }
        }
        return { success: false, error: 'No original effect to restore' }
    }
}

