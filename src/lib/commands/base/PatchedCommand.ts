/**
 * PatchedCommand - Command base class with automatic undo/redo via Immer patches.
 *
 * Commands extending PatchedCommand get automatic state restoration by
 * performing mutations within a store transaction.
 *
 * Usage:
 *   export class MyCommand extends PatchedCommand<MyResult> {
 *     protected mutate(draft: WritableDraft<ProjectStore>): void {
 *       // Direct mutation on draft state
 *       draft.someOperation()
 *     }
 *   }
 */

import { enablePatches, Patch, applyPatches, WritableDraft } from 'immer'
import { Command, CommandResult, CommandMetadata } from './Command'
import { CommandContext } from './CommandContext'
import type { ProjectStore } from '@/stores/project-store'

// Enable Immer patches globally
enablePatches()

export abstract class PatchedCommand<TResult = any> extends Command<TResult> {
    protected context: CommandContext
    protected inversePatches: Patch[] = []
    protected forwardPatches: Patch[] = []

    constructor(
        context: CommandContext,
        metadata: Partial<CommandMetadata> = {}
    ) {
        super(metadata)
        this.context = context
    }

    /**
     * Subclasses must implement mutate() to perform state changes.
     * This runs inside a store transaction to capture patches.
     */
    protected abstract mutate(draft: WritableDraft<ProjectStore>): void

    /**
     * Helper to set the command result from within mutate()
     */
    protected setResult(result: CommandResult<TResult>) {
        this.result = result
    }

    /**
     * Execute with automatic patch capture via store transaction.
     */
    public async execute(): Promise<CommandResult<TResult>> {
        const canExec = await Promise.resolve(this.canExecute())
        if (!canExec) {
            return {
                success: false,
                error: `Command "${this.metadata.name}" cannot be executed in current state`
            }
        }

        const store = this.context.getStore()

        try {
            const { patches, inversePatches } = store.transaction((draft) => {
                this.mutate(draft)
            })
            
            this.forwardPatches = patches
            this.inversePatches = inversePatches
            this.executed = true
            
            // If mutate didn't set result, assume success
            if (!this.result) {
                 this.result = { success: true } as CommandResult<TResult>
            }
            
            return this.result
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error : String(error)
            }
        }
    }

    /**
     * Undo by applying inverse patches via store transaction.
     */
    doUndo(): CommandResult<TResult> {
        if (this.inversePatches.length === 0) {
            return {
                success: false,
                error: 'No inverse patches captured - cannot undo'
            }
        }

        const store = this.context.getStore()

        try {
            store.transaction(draft => {
                applyPatches(draft, this.inversePatches)
            })
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: `Failed to apply inverse patches: ${error}`
            }
        }
    }

    /**
     * Redo by applying forward patches via store transaction.
     */
    async doRedo(): Promise<CommandResult<TResult>> {
        if (this.forwardPatches.length === 0) {
            // Should not happen if executed successfully
            return {
                success: false,
                error: 'No forward patches captured - cannot redo'
            }
        }

        const store = this.context.getStore()

        try {
            store.transaction(draft => {
                applyPatches(draft, this.forwardPatches)
            })
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: `Failed to apply forward patches: ${error}`
            }
        }
    }

    /**
     * Satisfy abstract base class, but unused by PatchedCommand's execute override.
     */
    doExecute(): CommandResult<TResult> {
        throw new Error('doExecute should not be called on PatchedCommand. Use mutate() instead.')
    }
}