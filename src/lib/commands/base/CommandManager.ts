import { Command, CommandResult, CommandMetadata, CompositeCommand } from './Command'
import { CommandContext } from './CommandContext'

export interface CommandHistoryEntry {
  command: Command
  metadata: CommandMetadata
  result?: CommandResult
  timestamp: number
  undone: boolean
}

export class CommandManager {
  private static instance: CommandManager | null = null
  private context: CommandContext
  private history: CommandHistoryEntry[] = []
  private maxHistorySize: number = 100
  private isExecuting: boolean = false
  private executionChain: Promise<void> = Promise.resolve()
  private commandRegistry: Map<string, typeof Command> = new Map()
  private shortcuts: Map<string, string> = new Map()
  private groupingEnabled: boolean = false
  private currentGroupId: string | null = null
  private pendingGroup: Command[] = []

  constructor(context: CommandContext, maxHistorySize: number = 100) {
    this.context = context
    this.maxHistorySize = maxHistorySize
  }

  static getInstance(context?: CommandContext): CommandManager {
    if (!CommandManager.instance) {
      if (!context) {
        throw new Error('CommandManager requires context on first initialization')
      }
      CommandManager.instance = new CommandManager(context)
    }
    return CommandManager.instance
  }

  public registerCommand(name: string, commandClass: typeof Command): void {
    this.commandRegistry.set(name, commandClass)
  }

  public registerShortcut(shortcut: string, commandName: string): void {
    this.shortcuts.set(shortcut, commandName)
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.executionChain.then(fn, fn)
    this.executionChain = run.then(() => undefined, () => undefined)
    return run
  }

  public async execute<T = any>(command: Command<T>): Promise<CommandResult<T>> {
    return this.enqueue(async () => {
      if (this.isExecuting) {
        return {
          success: false,
          error: 'Another command is currently executing'
        }
      }

      try {
        this.isExecuting = true
        // Standard undo stack behavior: once you execute a new command,
        // you can no longer redo commands that were previously undone.
        this.history = this.history.filter(entry => !entry.undone)

        // If grouping is enabled, add to pending group
        if (this.groupingEnabled) {
          this.pendingGroup.push(command)
          command.metadata.groupId = this.currentGroupId || undefined
        }

        const result = await command.execute()

        if (result.success) {
          // Add to history
          const entry: CommandHistoryEntry = {
            command,
            metadata: command.getMetadata(),
            result,
            timestamp: Date.now(),
            undone: false
          }

          this.history.push(entry)
          
          // Trim history if needed
          if (this.history.length > this.maxHistorySize) {
            this.history.shift()
          }
        }

        return result
      } finally {
        this.isExecuting = false
      }
    })
  }

  public async undo(): Promise<CommandResult> {
    if (this.isExecuting) {
      return {
        success: false,
        error: 'Another command is currently executing'
      }
    }

    const lastEntry = this.getLastUndoableEntry()
    if (!lastEntry) {
      return {
        success: false,
        error: 'No commands to undo'
      }
    }

    try {
      this.isExecuting = true
      
      // Handle grouped commands
      if (lastEntry.metadata.groupId) {
        const groupEntries = this.getGroupEntries(lastEntry.metadata.groupId)
        const results: CommandResult[] = []
        // Undo in reverse order
        for (let i = groupEntries.length - 1; i >= 0; i--) {
          const entry = groupEntries[i]
          const result = await entry.command.undo()
          results.push(result)
          entry.undone = true
          if (!result.success) {
            return {
              success: false,
              error: `Failed to undo grouped command: ${result.error}`
            }
          }
        }
        return {
          success: true,
          data: results
        }
      } else {
        const result = await lastEntry.command.undo()
        lastEntry.undone = true
        return result
      }
    } finally {
      this.isExecuting = false
    }
  }

  public async redo(): Promise<CommandResult> {
    if (this.isExecuting) {
      return {
        success: false,
        error: 'Another command is currently executing'
      }
    }

    const lastUndoneEntry = this.getLastUndoneEntry()
    if (!lastUndoneEntry) {
      return {
        success: false,
        error: 'No commands to redo'
      }
    }

    try {
      this.isExecuting = true
      
      // Handle grouped commands
      if (lastUndoneEntry.metadata.groupId) {
        const groupEntries = this.getGroupEntries(lastUndoneEntry.metadata.groupId, true)
        const results: CommandResult[] = []
        for (const entry of groupEntries) {
          const result = await entry.command.redo()
          results.push(result)
          entry.undone = false
          if (!result.success) {
            return {
              success: false,
              error: `Failed to redo grouped command: ${result.error}`
            }
          }
        }
        return {
          success: true,
          data: results
        }
      } else {
        const result = await lastUndoneEntry.command.redo()
        lastUndoneEntry.undone = false
        return result
      }
    } finally {
      this.isExecuting = false
    }
  }

  public beginGroup(groupId?: string): void {
    this.groupingEnabled = true
    this.currentGroupId = groupId || `group-${Date.now()}`
    this.pendingGroup = []
  }

  public async endGroup(): Promise<CommandResult> {
    if (!this.groupingEnabled) {
      return {
        success: false,
        error: 'No group to end'
      }
    }

    this.groupingEnabled = false
    const groupId = this.currentGroupId
    this.currentGroupId = null

    if (this.pendingGroup.length === 0) {
      return {
        success: true,
        data: []
      }
    }

    // Create composite command for the group
    const compositeCommand = new CompositeCommand(
      this.pendingGroup,
      {
        name: `Group ${groupId}`,
        description: `${this.pendingGroup.length} grouped commands`,
        groupId: groupId || undefined
      }
    )

    this.pendingGroup = []
    
    return {
      success: true,
      data: compositeCommand
    }
  }

  public canUndo(): boolean {
    return this.getLastUndoableEntry() !== null
  }

  public canRedo(): boolean {
    return this.getLastUndoneEntry() !== null
  }

  public getUndoDescription(): string | null {
    const entry = this.getLastUndoableEntry()
    return entry ? (entry.metadata.description || entry.metadata.name) : null
  }

  public getRedoDescription(): string | null {
    const entry = this.getLastUndoneEntry()
    return entry ? (entry.metadata.description || entry.metadata.name) : null
  }

  private getLastUndoableEntry(): CommandHistoryEntry | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (!this.history[i].undone) {
        return this.history[i]
      }
    }
    return null
  }

  private getLastUndoneEntry(): CommandHistoryEntry | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].undone) return this.history[i]
    }
    return null
  }

  private getGroupEntries(groupId: string, undone: boolean = false): CommandHistoryEntry[] {
    return this.history.filter(entry => 
      entry.metadata.groupId === groupId && entry.undone === undone
    )
  }

  public clearHistory(): void {
    this.history = []
  }

  public getHistory(): CommandHistoryEntry[] {
    return [...this.history]
  }

  public getContext(): CommandContext {
    return this.context
  }

  public setContext(context: CommandContext): void {
    this.context = context
  }

  public createCommand(name: string, ...args: any[]): Command | null {
    const CommandClass = this.commandRegistry.get(name)
    if (!CommandClass) return null
    
    // Use type assertion to handle the abstract class issue
    const ConcreteClass = CommandClass as any
    return new ConcreteClass(this.context, ...args)
  }

  public async executeByName(name: string, ...args: any[]): Promise<CommandResult> {
    const command = this.createCommand(name, ...args)
    if (!command) {
      return {
        success: false,
        error: `Command "${name}" not found in registry`
      }
    }
    
    return this.execute(command)
  }

  public getCommandForShortcut(shortcut: string): string | undefined {
    return this.shortcuts.get(shortcut)
  }
}
