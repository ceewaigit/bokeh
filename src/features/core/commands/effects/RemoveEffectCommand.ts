/**
 * RemoveEffectCommand - Remove an effect from the project.
 *
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 *
 * Special handling for keystroke effects:
 * - Global keystroke style effect: Disabled instead of removed (so it doesn't "reappear")
 * - Auto-generated keystroke blocks: Suppression state is persisted so they don't come back on re-sync
 *
 * All business logic is now in mutate() - Immer captures all mutations automatically,
 * eliminating the need for manual originalEffect and suppressedKeystrokeClusterKey tracking.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { EffectStore } from '@/features/effects/core/effects-store'
import { EffectCreation } from '@/features/effects/core/creation'
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'
import { markProjectModified } from '@/features/core/stores/store-utils'

export class RemoveEffectCommand extends PatchedCommand<{ effectId: string }> {
    private effectId: string

    constructor(
        context: CommandContext,
        effectId: string
    ) {
        super(context, {
            name: 'RemoveEffect',
            description: `Remove effect ${effectId}`,
            category: 'effects'
        })
        this.effectId = effectId
    }

    canExecute(): boolean {
        const project = this.context.getProject()
        if (!project) return false
        return EffectStore.exists(project, this.effectId)
    }

    protected mutate(draft: WritableDraft<ProjectStore>): void {
        if (!draft.currentProject) {
            throw new Error('No active project')
        }

        const located = EffectStore.find(draft.currentProject, this.effectId)
        if (!located) {
            throw new Error('Effect not found')
        }

        const effect = located.effect

        // Special case: Global keystroke style effect - disable instead of removing
        // so it doesn't "reappear" when effects are regenerated
        if (effect.type === 'keystroke' && effect.id === KEYSTROKE_STYLE_EFFECT_ID) {
            EffectStore.update(draft.currentProject, this.effectId, { enabled: false })
            markProjectModified(draft)
            this.setResult({ success: true, data: { effectId: this.effectId } })
            return
        }

        // Special case: Auto-generated keystroke block - persist suppression intent
        // so it doesn't come back on re-sync
        if (effect.type === 'keystroke' && typeof effect.id === 'string' && effect.id.startsWith('keystroke|')) {
            const parsed = parseManagedKeystrokeEffectId(effect.id)
            if (parsed) {
                const key = `${parsed.recordingId}::${parsed.clusterIndex}`

                // Ensure global keystroke style effect exists (used as persistence home for tombstones)
                if (!EffectStore.exists(draft.currentProject, KEYSTROKE_STYLE_EFFECT_ID)) {
                    EffectStore.add(draft.currentProject, EffectCreation.createDefaultKeystrokeStyleEffect())
                }

                // Add to suppressed clusters list
                const styleEffect = EffectStore.get(draft.currentProject, KEYSTROKE_STYLE_EFFECT_ID)
                const current = (styleEffect?.data as any)?.suppressedClusters
                const next = new Set<string>(Array.isArray(current) ? current.filter((v: unknown) => typeof v === 'string') : [])
                next.add(key)
                EffectStore.update(draft.currentProject, KEYSTROKE_STYLE_EFFECT_ID, {
                    data: { suppressedClusters: Array.from(next) } as any
                })
            }
        }

        // Remove the effect - Immer patches will capture for undo
        EffectStore.remove(draft.currentProject, this.effectId)
        markProjectModified(draft)

        this.setResult({ success: true, data: { effectId: this.effectId } })
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
