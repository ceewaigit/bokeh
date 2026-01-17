// Base infrastructure
export { Command, CompositeCommand } from './base/Command'
export type { CommandResult, CommandMetadata } from './base/Command'
export { PatchedCommand } from './base/PatchedCommand'
export { DefaultCommandContext } from './base/CommandContext'
export type { CommandContext } from './base/CommandContext'
export { CommandManager } from './base/CommandManager'
export type { CommandHistoryEntry } from './base/CommandManager'
export { CommandExecutor } from './base/CommandExecutor'
export type {
  CommandName,
  CommandArgsMap,
  CommandResultMap,
  CommandConstructor,
  CommandConstructorMap
} from './base/CommandRegistry'

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
  ApplyAllSpeedUpsCommand,
  ReorderClipCommand,
  AddAssetCommand
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
import { AddAssetCommand } from './timeline/AddAssetCommand'
import { ReorderClipCommand } from './timeline/ReorderClipCommand'
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
  manager.registerCommand('AddClip', AddClipCommand)
  manager.registerCommand('AddAsset', AddAssetCommand)
  manager.registerCommand('ReorderClip', ReorderClipCommand)
  manager.registerCommand('RemoveClip', RemoveClipCommand)
  manager.registerCommand('SplitClip', SplitClipCommand)
  manager.registerCommand('DuplicateClip', DuplicateClipCommand)
  manager.registerCommand('UpdateClip', UpdateClipCommand)
  manager.registerCommand('Trim', TrimCommand)
  manager.registerCommand('ChangePlaybackRate', ChangePlaybackRateCommand)

  // Effect commands
  manager.registerCommand('AddZoomBlock', AddZoomBlockCommand)
  manager.registerCommand('RemoveZoomBlock', RemoveZoomBlockCommand)
  manager.registerCommand('UpdateZoomBlock', UpdateZoomBlockCommand)
  manager.registerCommand('AddEffect', AddEffectCommand)
  manager.registerCommand('RemoveEffect', RemoveEffectCommand)
  manager.registerCommand('UpdateEffect', UpdateEffectCommand)

  // Clipboard commands
  manager.registerCommand('Copy', CopyCommand)
  manager.registerCommand('Cut', CutCommand)
  manager.registerCommand('Paste', PasteCommand)

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
