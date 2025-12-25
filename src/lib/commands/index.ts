// Base infrastructure
export { Command, CompositeCommand } from './base/Command'
export type { CommandResult, CommandMetadata } from './base/Command'
export { DefaultCommandContext } from './base/CommandContext'
export type { CommandContext } from './base/CommandContext'
export { CommandManager } from './base/CommandManager'
export type { CommandHistoryEntry } from './base/CommandManager'
export { CommandExecutor } from './base/CommandExecutor'

// Timeline commands
export {
  AddClipCommand,
  RemoveClipCommand,
  SplitClipCommand,
  DuplicateClipCommand,
  UpdateClipCommand,
  TrimCommand,
  ChangePlaybackRateCommand,
  ApplySpeedUpCommand,
  ApplyAllSpeedUpsCommand
} from './timeline'

// Effect commands
export {
  AddZoomBlockCommand,
  RemoveZoomBlockCommand,
  UpdateZoomBlockCommand,
  AddEffectCommand,
  RemoveEffectCommand,
  UpdateEffectCommand
} from './effects'

// Clipboard commands
export {
  CopyCommand,
  CutCommand,
  PasteCommand
} from './clipboard'

// Command registry helper
import { CommandManager } from './base/CommandManager'
import { AddClipCommand } from './timeline/AddClipCommand'
import { RemoveClipCommand } from './timeline/RemoveClipCommand'
import { SplitClipCommand } from './timeline/SplitClipCommand'
import { DuplicateClipCommand } from './timeline/DuplicateClipCommand'
import { UpdateClipCommand } from './timeline/UpdateClipCommand'
import { TrimCommand } from './timeline/TrimCommand'
import { ChangePlaybackRateCommand } from './timeline/ChangePlaybackRateCommand'
import { AddZoomBlockCommand } from './effects/AddZoomBlockCommand'
import { RemoveZoomBlockCommand } from './effects/RemoveZoomBlockCommand'
import { UpdateZoomBlockCommand } from './effects/UpdateZoomBlockCommand'
import { AddEffectCommand } from './effects/AddEffectCommand'
import { RemoveEffectCommand } from './effects/RemoveEffectCommand'
import { UpdateEffectCommand } from './effects/UpdateEffectCommand'
import { CopyCommand } from './clipboard/CopyCommand'
import { CutCommand } from './clipboard/CutCommand'
import { PasteCommand } from './clipboard/PasteCommand'

export function registerAllCommands(manager: CommandManager): void {
  // Timeline commands
  manager.registerCommand('AddClip', AddClipCommand as any)
  manager.registerCommand('RemoveClip', RemoveClipCommand as any)
  manager.registerCommand('SplitClip', SplitClipCommand as any)
  manager.registerCommand('DuplicateClip', DuplicateClipCommand as any)
  manager.registerCommand('UpdateClip', UpdateClipCommand as any)
  manager.registerCommand('Trim', TrimCommand as any)
  manager.registerCommand('ChangePlaybackRate', ChangePlaybackRateCommand as any)

  // Effect commands
  manager.registerCommand('AddZoomBlock', AddZoomBlockCommand as any)
  manager.registerCommand('RemoveZoomBlock', RemoveZoomBlockCommand as any)
  manager.registerCommand('UpdateZoomBlock', UpdateZoomBlockCommand as any)
  manager.registerCommand('AddEffect', AddEffectCommand as any)
  manager.registerCommand('RemoveEffect', RemoveEffectCommand as any)
  manager.registerCommand('UpdateEffect', UpdateEffectCommand as any)

  // Clipboard commands
  manager.registerCommand('Copy', CopyCommand as any)
  manager.registerCommand('Cut', CutCommand as any)
  manager.registerCommand('Paste', PasteCommand as any)

  // Register shortcuts
  manager.registerShortcut('cmd+c', 'Copy')
  manager.registerShortcut('cmd+x', 'Cut')
  manager.registerShortcut('cmd+v', 'Paste')
  manager.registerShortcut('cmd+d', 'DuplicateClip')
  manager.registerShortcut('delete', 'RemoveClip')
  manager.registerShortcut('backspace', 'RemoveClip')
  manager.registerShortcut('s', 'SplitClip')
  manager.registerShortcut('cmd+k', 'SplitClip')
}