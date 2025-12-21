import { Command, CompositeCommand, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { CopyCommand } from './CopyCommand'
import { RemoveClipCommand } from '../timeline/RemoveClipCommand'
import type { Clip } from '@/types/project'

export class CutCommand extends CompositeCommand<{ clipId: string }> {
  constructor(context: CommandContext, clipId?: string) {
    const actualClipId = clipId || context.getSelectedClips()[0]
    
    super(
      [
        new CopyCommand(context, actualClipId),
        new RemoveClipCommand(context, actualClipId!)
      ],
      {
        name: 'Cut',
        description: `Cut clip ${actualClipId}`,
        category: 'clipboard'
      }
    )
  }
}