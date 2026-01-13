import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { Effect } from '@/types/project'
import { EffectStore } from '@/features/effects/core/effects-store'
import { EffectCreation } from '@/features/effects/core/creation'
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'

export class RemoveEffectCommand extends Command {
    private originalEffect: Effect | null = null
    private suppressedKeystrokeClusterKey: string | null = null

    constructor(
        private context: CommandContext,
        private effectId: string
    ) {
        super({ name: 'RemoveEffect' })
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

        this.originalEffect = JSON.parse(JSON.stringify(located.effect))

        // Prevent removing the global keystroke style effect; disable instead so it doesn't "reappear".
        if (located.effect.type === 'keystroke' && located.effect.id === KEYSTROKE_STYLE_EFFECT_ID) {
            this.context.getStore().updateEffect(this.effectId, { enabled: false })
            return { success: true }
        }

        // If user deletes an auto-generated keystroke block, persist that intent so it doesn't come back on re-sync.
        if (located.effect.type === 'keystroke' && typeof located.effect.id === 'string' && located.effect.id.startsWith('keystroke|')) {
            const parsed = parseManagedKeystrokeEffectId(located.effect.id)
            if (parsed) {
                const key = `${parsed.recordingId}::${parsed.clusterIndex}`
                this.suppressedKeystrokeClusterKey = key

                // Ensure global keystroke style effect exists (used as persistence home for tombstones).
                if (!EffectStore.exists(project, KEYSTROKE_STYLE_EFFECT_ID)) {
                    EffectStore.add(project, EffectCreation.createDefaultKeystrokeStyleEffect())
                }

                const styleEffect = EffectStore.get(project, KEYSTROKE_STYLE_EFFECT_ID)
                const current = (styleEffect?.data as any)?.suppressedClusters
                const next = new Set<string>(Array.isArray(current) ? current.filter((v: unknown) => typeof v === 'string') : [])
                next.add(key)
                this.context.getStore().updateEffect(KEYSTROKE_STYLE_EFFECT_ID, { data: { suppressedClusters: Array.from(next) } as any })
            }
        }

        this.context.getStore().removeEffect(this.effectId)

        return { success: true }
    }

    async doUndo(): Promise<CommandResult> {
        const project = this.context.getProject()
        if (!project) return { success: false, error: 'No active project' }

        if (this.suppressedKeystrokeClusterKey) {
            const styleEffect = EffectStore.get(project, KEYSTROKE_STYLE_EFFECT_ID)
            const current = (styleEffect?.data as any)?.suppressedClusters
            const next = Array.isArray(current)
                ? current.filter((v: unknown) => typeof v === 'string' && v !== this.suppressedKeystrokeClusterKey)
                : []
            this.context.getStore().updateEffect(KEYSTROKE_STYLE_EFFECT_ID, { data: { suppressedClusters: next } as any })
            this.suppressedKeystrokeClusterKey = null
        }

        if (this.originalEffect) {
            // If the effect was disabled instead of removed (global style), restore its enabled flag.
            if (this.originalEffect.type === 'keystroke' && this.originalEffect.id === KEYSTROKE_STYLE_EFFECT_ID) {
                this.context.getStore().updateEffect(this.originalEffect.id, { enabled: this.originalEffect.enabled })
                return { success: true }
            }

            this.context.getStore().addEffect(this.originalEffect)
            return { success: true }
        }
        return { success: false, error: 'No original effect to restore' }
    }
}

function parseManagedKeystrokeEffectId(id: string): { recordingId: string; clusterIndex: number; rangeIndex: number } | null {
    // Format: keystroke|<recordingId>|<clusterIndex>|<rangeIndex>
    const parts = id.split('|')
    if (parts.length !== 4) return null
    if (parts[0] !== 'keystroke') return null
    const recordingId = parts[1]
    const clusterIndex = Number(parts[2])
    const rangeIndex = Number(parts[3])
    if (!recordingId) return null
    if (!Number.isInteger(clusterIndex) || clusterIndex < 0) return null
    if (!Number.isInteger(rangeIndex) || rangeIndex < 0) return null
    return { recordingId, clusterIndex, rangeIndex }
}
