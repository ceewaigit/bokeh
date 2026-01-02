import { Command, CommandResult } from './Command'
import { CommandContext, DefaultCommandContext } from './CommandContext'
import { CommandManager } from './CommandManager'
import { registerAllCommands } from '../index'
import type { ProjectStore } from '@/features/stores/slices/types'

type StoreAccessor = { getState: () => ProjectStore }

// Type for command constructors that take context as first argument
type CommandConstructor<T extends Command = Command> = new (
  context: CommandContext,
  ...args: any[]
) => T

/**
 * CommandExecutor - Singleton service for executing commands with automatic context management.
 *
 * Instead of creating fresh contexts in every handler:
 *   const context = new DefaultCommandContext(useProjectStore)
 *   const command = new SplitClipCommand(context, clipId, time)
 *   await manager.execute(command)
 *
 * Use:
 *   await CommandExecutor.getInstance().execute(SplitClipCommand, clipId, time)
 */
export class CommandExecutor {
  private static instance: CommandExecutor | null = null
  private manager: CommandManager
  private storeAccessor: StoreAccessor

  private constructor(storeAccessor: StoreAccessor) {
    this.storeAccessor = storeAccessor
    const context = new DefaultCommandContext(storeAccessor)
    this.manager = CommandManager.getInstance(context)
    registerAllCommands(this.manager)
  }

  /**
   * Initialize the CommandExecutor singleton. Must be called once at app startup.
   * @param storeAccessor - The Zustand store accessor (e.g., useProjectStore)
   */
  static initialize(storeAccessor: StoreAccessor): CommandExecutor {
    if (!CommandExecutor.instance) {
      CommandExecutor.instance = new CommandExecutor(storeAccessor)
    }
    return CommandExecutor.instance
  }

  /**
   * Get the CommandExecutor instance. Throws if not initialized.
   */
  static getInstance(): CommandExecutor {
    if (!CommandExecutor.instance) {
      throw new Error('CommandExecutor not initialized. Call CommandExecutor.initialize() first.')
    }
    return CommandExecutor.instance
  }

  /**
   * Check if CommandExecutor has been initialized.
   */
  static isInitialized(): boolean {
    return CommandExecutor.instance !== null
  }

  /**
   * Execute a command with automatic context creation.
   * The context is created fresh for each execution to ensure latest store state.
   *
   * @param CommandClass - The command class to instantiate
   * @param args - Arguments to pass to the command constructor (after context)
   * @returns Promise with command result
   *
   * @example
   * await executor.execute(SplitClipCommand, clipId, splitTime)
   * await executor.execute(CopyCommand)
   */
  async execute<T = any>(
    CommandClass: CommandConstructor<Command<T>>,
    ...args: any[]
  ): Promise<CommandResult<T>> {
    // Create fresh context to read latest store state
    const context = new DefaultCommandContext(this.storeAccessor)
    const command = new CommandClass(context, ...args)
    return this.manager.execute(command)
  }

  /**
   * Undo the last command.
   */
  async undo(): Promise<CommandResult> {
    return this.manager.undo()
  }

  /**
   * Redo the last undone command.
   */
  async redo(): Promise<CommandResult> {
    return this.manager.redo()
  }

  /**
   * Check if there are commands to undo.
   */
  canUndo(): boolean {
    return this.manager.canUndo()
  }

  /**
   * Check if there are commands to redo.
   */
  canRedo(): boolean {
    return this.manager.canRedo()
  }

  /**
   * Get description of the command that would be undone.
   */
  getUndoDescription(): string | null {
    return this.manager.getUndoDescription()
  }

  /**
   * Get description of the command that would be redone.
   */
  getRedoDescription(): string | null {
    return this.manager.getRedoDescription()
  }

  /**
   * Begin a command group. All commands executed until endGroup() are grouped for undo/redo.
   */
  beginGroup(groupId?: string): void {
    this.manager.beginGroup(groupId)
  }

  /**
   * End a command group.
   */
  async endGroup(): Promise<CommandResult> {
    return this.manager.endGroup()
  }

  /**
   * Execute a command by name using the command registry.
   * Creates fresh context before execution.
   *
   * @param name - The registered command name
   * @param args - Arguments to pass to the command constructor (after context)
   */
  async executeByName(name: string, ...args: any[]): Promise<CommandResult> {
    // Update manager's context before creating command
    const context = new DefaultCommandContext(this.storeAccessor)
    this.manager.setContext(context)
    return this.manager.executeByName(name, ...args)
  }

  /**
   * Get the underlying CommandManager (for advanced use cases).
   */
  getManager(): CommandManager {
    return this.manager
  }

  /**
   * Clear all command history.
   */
  clearHistory(): void {
    this.manager.clearHistory()
  }
}
