import { Command, type CommandResult } from '../base/Command'
import type { CommandContext } from '../base/CommandContext'
import type { ProjectSettings } from '@/types/project'

type AudioSettings = ProjectSettings['audio']

export class UpdateAudioSettingsCommand extends Command {
  constructor(
    private context: CommandContext,
    private before: Partial<AudioSettings>,
    private after: Partial<AudioSettings>
  ) {
    super({
      name: 'UpdateAudioSettings',
      description: 'Update audio settings',
      category: 'settings',
    })
  }

  canExecute(): boolean {
    return Boolean(this.context.getProject())
  }

  doExecute(): CommandResult {
    const store = this.context.getStore()
    store.setAudioSettings(this.after)
    return { success: true }
  }

  doUndo(): CommandResult {
    const store = this.context.getStore()
    store.setAudioSettings(this.before)
    return { success: true }
  }
}

