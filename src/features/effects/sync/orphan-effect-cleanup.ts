/**
 * Orphan Effect Cleanup
 *
 * Removes effects bound to clips that no longer exist.
 * Uses EffectStore.removeMany() for SSOT compliance.
 */

import type { Project } from '@/types/project'
import { EffectType } from '@/types/project'
import { EffectStore } from '@/features/effects/core/effects-store'

// Effect types that are global and should not be removed
const GLOBAL_EFFECT_TYPES = new Set([
    EffectType.Background,
    EffectType.Cursor,
])

export const OrphanEffectCleanup = {
    /**
     * Remove effects bound to clips that no longer exist.
     * Uses EffectStore.removeMany() for SSOT compliance.
     */
    cleanup(project: Project): void {
        const allClipIds = new Set(
            project.timeline.tracks.flatMap(t => t.clips.map(c => c.id))
        )

        const effects = EffectStore.getAll(project)
        if (effects.length === 0) return

        // Collect IDs of orphaned effects
        const orphanedIds: string[] = []

        for (const effect of effects) {
            // Keep global effects
            if (GLOBAL_EFFECT_TYPES.has(effect.type)) continue

            // Keep effects not bound to a clip
            if (!effect.clipId) continue

            // Remove if bound clip no longer exists
            if (!allClipIds.has(effect.clipId)) {
                orphanedIds.push(effect.id)
            }
        }

        // Remove orphaned effects through EffectStore for SSOT
        if (orphanedIds.length > 0) {
            EffectStore.removeMany(project, orphanedIds)
        }
    },
}
