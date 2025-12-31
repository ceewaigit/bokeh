/**
 * PatchedCommand - Command base class with automatic undo/redo via Immer patches.
 *
 * Instead of manually tracking state like:
 *   this.originalClip = JSON.parse(JSON.stringify(clip))
 *
 * Commands extending PatchedCommand get automatic state restoration by
 * capturing Immer patches during execution.
 *
 * Usage:
 *   export class MyCommand extends PatchedCommand<MyResult> {
 *     doExecute(): CommandResult<MyResult> {
 *       const store = this.context.getStore()
 *       store.someOperation() // State changes are automatically tracked
 *       return { success: true, data: { ... } }
 *     }
 *     // doUndo() is inherited and uses inverse patches automatically!
 *   }
 */

import { produce, enablePatches, Patch, applyPatches } from 'immer'
import { Command, CommandResult, CommandMetadata } from './Command'
import { CommandContext } from './CommandContext'
import type { Project } from '@/types/project'

// Enable Immer patches globally
enablePatches()

/**
 * Patch Store - Captures patches during command execution.
 * 
 * The store's immer middleware mutates state in place, but we need to capture
 * the patches for undo/redo. This singleton captures patches by wrapping
 * the project state before and after execution.
 */
export class PatchStore {
    private static instance: PatchStore | null = null
    private capturedPatches: Patch[] = []
    private capturedInversePatches: Patch[] = []
    private isCapturing: boolean = false

    static getInstance(): PatchStore {
        if (!PatchStore.instance) {
            PatchStore.instance = new PatchStore()
        }
        return PatchStore.instance
    }

    startCapture(): void {
        this.capturedPatches = []
        this.capturedInversePatches = []
        this.isCapturing = true
    }

    stopCapture(): { patches: Patch[]; inversePatches: Patch[] } {
        this.isCapturing = false
        return {
            patches: [...this.capturedPatches],
            inversePatches: [...this.capturedInversePatches]
        }
    }

    /**
     * Capture patches by computing the diff between two project states.
     * This is called after command execution completes.
     */
    captureFromDiff(before: Project | null, after: Project | null): void {
        if (!this.isCapturing || !before || !after) return

        // Use Immer's produce to compute patches between states
        produce(
            before,
            draft => {
                // Deep copy after state into draft
                Object.assign(draft, JSON.parse(JSON.stringify(after)))
            },
            (patches, inversePatches) => {
                this.capturedPatches.push(...patches)
                this.capturedInversePatches.push(...inversePatches)
            }
        )
    }

    isCurrentlyCapturing(): boolean {
        return this.isCapturing
    }
}

/**
 * PatchedCommand - Base class for commands with automatic undo/redo.
 *
 * Subclasses implement doExecute() to perform state changes.
 * doUndo() uses captured inverse patches for perfect state restoration.
 */
export abstract class PatchedCommand<TResult = any> extends Command<TResult> {
    protected context: CommandContext
    protected inversePatches: Patch[] = []
    protected forwardPatches: Patch[] = []
    private beforeState: Project | null = null

    constructor(
        context: CommandContext,
        metadata: Partial<CommandMetadata> = {}
    ) {
        super(metadata)
        this.context = context
    }

    /**
     * Execute with automatic patch capture.
     * Subclasses should NOT override this - override doExecute() instead.
     */
    public async execute(): Promise<CommandResult<TResult>> {
        const canExec = await Promise.resolve(this.canExecute())
        if (!canExec) {
            return {
                success: false,
                error: `Command "${this.metadata.name}" cannot be executed in current state`
            }
        }

        const patchStore = PatchStore.getInstance()

        try {
            // Capture state before execution
            this.beforeState = this.context.getProject()
                ? JSON.parse(JSON.stringify(this.context.getProject()))
                : null

            patchStore.startCapture()

            // Execute the command's logic
            this.result = await Promise.resolve(this.doExecute())

            // Capture state after execution
            const afterState = this.context.getProject()
            patchStore.captureFromDiff(this.beforeState, afterState)

            const { patches, inversePatches } = patchStore.stopCapture()
            this.forwardPatches = patches
            this.inversePatches = inversePatches

            this.executed = true
            return this.result
        } catch (error) {
            patchStore.stopCapture()
            return {
                success: false,
                error: error instanceof Error ? error : String(error)
            }
        }
    }

    /**
     * Undo by applying inverse patches.
     * This provides byte-for-byte perfect state restoration.
     */
    doUndo(): CommandResult<TResult> {
        if (this.inversePatches.length === 0) {
            return {
                success: false,
                error: 'No inverse patches captured - cannot undo'
            }
        }

        const project = this.context.getProject()
        if (!project) {
            return {
                success: false,
                error: 'No active project'
            }
        }

        try {
            // Apply inverse patches to restore previous state
            const restoredState = applyPatches(project, this.inversePatches)

            // Update the store with restored state
            const store = this.context.getStore()
            store.setProject(restoredState)

            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: `Failed to apply inverse patches: ${error}`
            }
        }
    }

    /**
     * Redo by applying forward patches.
     */
    async doRedo(): Promise<CommandResult<TResult>> {
        if (this.forwardPatches.length === 0) {
            // Fallback to re-execution if no forward patches
            return await Promise.resolve(this.doExecute())
        }

        const project = this.context.getProject()
        if (!project) {
            return {
                success: false,
                error: 'No active project'
            }
        }

        try {
            const newState = applyPatches(project, this.forwardPatches)
            const store = this.context.getStore()
            store.setProject(newState)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: `Failed to apply forward patches: ${error}`
            }
        }
    }

    /**
     * Subclasses must implement canExecute().
     */
    abstract canExecute(): boolean | Promise<boolean>

    /**
     * Subclasses must implement doExecute() with their specific logic.
     * State changes made via store methods are automatically tracked.
     */
    abstract doExecute(): CommandResult<TResult> | Promise<CommandResult<TResult>>
}
