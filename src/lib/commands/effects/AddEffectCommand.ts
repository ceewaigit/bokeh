import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { Effect } from '@/types/project'

export class AddEffectCommand extends Command {
    constructor(
        private context: CommandContext,
        private effect: Effect
    ) {
        super({ name: 'AddEffect' })
    }

    canExecute(): boolean {
        return !!this.context.getProject()
    }

    async doExecute(): Promise<CommandResult> {
        this.context.getStore().addEffect(this.effect)
        return { success: true }
    }

    async doUndo(): Promise<CommandResult> {
        this.context.getStore().removeEffect(this.effect.id)
        return { success: true }
    }
}
