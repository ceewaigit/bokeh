import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { Effect } from '@/types/project'
import { EffectStore } from '@/features/effects/core/store'

export class UpdateEffectCommand extends Command {
    private originalData: Partial<Effect> | null = null

    constructor(
        private context: CommandContext,
        private effectId: string,
        private updates: Partial<Effect>
    ) {
        super({ name: 'UpdateEffect' })
    }

    canExecute(): boolean {
        return !!this.context.getProject()
    }

    async doExecute(): Promise<CommandResult> {
        const project = this.context.getProject()
        if (!project) return { success: false, error: 'No active project' }

        // Use EffectStore to find the effect (searches both timeline and legacy recording.effects)
        const located = EffectStore.find(project, this.effectId)
        if (!located) {
            return { success: false, error: 'Effect not found' }
        }

        const effect = located.effect

        // Capture only the properties that are being updated
        this.originalData = {}
        for (const key in this.updates) {
            if (Object.prototype.hasOwnProperty.call(this.updates, key)) {
                                // @ts-expect-error - Partial<Effect> index signature mismatch
                this.originalData[key] = effect[key]
            }
        }

        // Capture only the data keys being updated (avoid deep-cloning large effect payloads).
        if (this.updates.data && effect.data) {
            const prevData = effect.data as Record<string, unknown>
            const nextData = this.updates.data as Record<string, unknown>
            const originalDataForKeys: Record<string, unknown> = {}

            for (const dataKey of Object.keys(nextData)) {
                const prevValue = prevData[dataKey]
                if (prevValue && typeof prevValue === 'object') {
                    // Best-effort deep clone for nested values (keep undo correct without cloning unrelated huge blobs).
                    // `structuredClone` is available in modern runtimes; fall back to JSON for plain objects.
                    try {
                        originalDataForKeys[dataKey] = typeof structuredClone === 'function'
                            ? structuredClone(prevValue)
                            : JSON.parse(JSON.stringify(prevValue))
                    } catch {
                        originalDataForKeys[dataKey] = prevValue
                    }
                } else {
                    originalDataForKeys[dataKey] = prevValue
                }
            }

            this.originalData.data = originalDataForKeys as any
        }

        this.context.getStore().updateEffect(this.effectId, this.updates)
        return { success: true }
    }

    async doUndo(): Promise<CommandResult> {
        if (this.originalData) {
            this.context.getStore().updateEffect(this.effectId, this.originalData)
            return { success: true }
        }
        return { success: false, error: 'No original data to restore' }
    }
}
