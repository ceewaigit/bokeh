export interface CommandMetadata {
  id: string
  name: string
  description?: string
  category?: string
  timestamp?: number
  groupId?: string
}

export interface CommandResult<T = any> {
  success: boolean
  data?: T
  error?: Error | string
}

export abstract class Command<TResult = any> {
  public readonly metadata: CommandMetadata
  protected executed: boolean = false
  protected result?: CommandResult<TResult>

  constructor(metadata: Partial<CommandMetadata> = {}) {
    this.metadata = {
      id: metadata.id || `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: metadata.name || this.constructor.name,
      description: metadata.description,
      category: metadata.category,
      timestamp: Date.now(),
      groupId: metadata.groupId
    }
  }

  abstract canExecute(): boolean | Promise<boolean>

  abstract doExecute(): CommandResult<TResult> | Promise<CommandResult<TResult>>

  abstract doUndo(): CommandResult<TResult> | Promise<CommandResult<TResult>>

  doRedo?(): CommandResult<TResult> | Promise<CommandResult<TResult>>

  public async execute(): Promise<CommandResult<TResult>> {
    const canExecute = await Promise.resolve(this.canExecute())
    
    if (!canExecute) {
      return {
        success: false,
        error: `Command "${this.metadata.name}" cannot be executed in current state`
      }
    }

    try {
      this.result = await Promise.resolve(this.doExecute())
      this.executed = true
      return this.result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : String(error)
      }
    }
  }

  public async undo(): Promise<CommandResult<TResult>> {
    if (!this.executed) {
      return {
        success: false,
        error: `Command "${this.metadata.name}" has not been executed`
      }
    }

    try {
      const result = await Promise.resolve(this.doUndo())
      this.executed = false
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : String(error)
      }
    }
  }

  public async redo(): Promise<CommandResult<TResult>> {
    if (this.executed) {
      return {
        success: false,
        error: `Command "${this.metadata.name}" is already executed`
      }
    }

    try {
      const result = this.doRedo 
        ? await Promise.resolve(this.doRedo())
        : await Promise.resolve(this.doExecute())
      
      this.executed = true
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : String(error)
      }
    }
  }

  public getMetadata(): CommandMetadata {
    return { ...this.metadata }
  }

  public isExecuted(): boolean {
    return this.executed
  }

  public getResult(): CommandResult<TResult> | undefined {
    return this.result
  }
}

export class CompositeCommand<TResult = any> extends Command<TResult> {
  protected commands: Command[] = []

  constructor(
    commands: Command[],
    metadata: Partial<CommandMetadata> = {}
  ) {
    super(metadata)
    this.commands = commands
  }

  async canExecute(): Promise<boolean> {
    const results = await Promise.all(
      this.commands.map(cmd => cmd.canExecute())
    )
    return results.every(Boolean)
  }

  async doExecute(): Promise<CommandResult<TResult>> {
    const results: CommandResult[] = []
    
    for (const command of this.commands) {
      const result = await command.execute()
      results.push(result)
      
      if (!result.success) {
        // Rollback executed commands on failure
        for (let i = results.length - 2; i >= 0; i--) {
          if (results[i].success) {
            await this.commands[i].undo()
          }
        }
        
        return {
          success: false,
          error: `Failed at command ${this.commands.indexOf(command)}: ${result.error}`
        }
      }
    }

    return {
      success: true,
      data: results as any
    }
  }

  async doUndo(): Promise<CommandResult<TResult>> {
    const results: CommandResult[] = []
    
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      const result = await this.commands[i].undo()
      results.push(result)
      
      if (!result.success) {
        return {
          success: false,
          error: `Failed to undo command ${i}: ${result.error}`
        }
      }
    }

    return {
      success: true,
      data: results as any
    }
  }

  async doRedo(): Promise<CommandResult<TResult>> {
    return this.doExecute()
  }

  public addCommand(command: Command): void {
    this.commands.push(command)
  }

  public getCommands(): Command[] {
    return [...this.commands]
  }
}