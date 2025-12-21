import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { Effect } from '@/types/project'

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
        // Find the effect before removing it so we can restore it later
        const project = this.context.getProject()
        if (!project) return { success: false, error: 'No active project' }

        // Search in timeline effects (global)
        let effect = project.timeline.effects?.find(e => e.id === this.effectId)

        // If not found, search in recordings (scoped effects like zoom)
        if (!effect) {
            for (const recording of project.recordings) {
                const found = recording.effects?.find(e => e.id === this.effectId)
                if (found) {
                    effect = found
                    break
                }
            }
        }

        if (!effect) {
            return { success: false, error: 'Effect not found' }
        }

        this.originalEffect = JSON.parse(JSON.stringify(effect))
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
