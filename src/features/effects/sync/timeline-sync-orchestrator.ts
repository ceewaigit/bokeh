/**
 * Timeline Sync Orchestrator
 *
 * Single entry point for synchronizing timeline state after any clip change.
 * Coordinates all sync operations through focused services.
 *
 * Uses a two-phase mutation pattern for effect synchronization:
 * 1. COLLECT PHASE: Sync handlers collect mutations into a batch (no array modifications)
 * 2. APPLY PHASE: EffectStore.applyBatch() applies all changes atomically
 *
 * This pattern ensures:
 * - Single source of truth (SSOT) - all mutations go through EffectStore
 * - O(n) performance instead of O(n*m) - single pass through effects
 * - No stale references - handlers can't modify array mid-iteration
 * - Atomic operations - undo/redo consistency guaranteed
 *
 * Handles four categories of synchronization:
 * 1. Clip-bound effects (Crop): Follow their clipId
 * 2. Time-based effects (Zoom/Screen/Annotation): Shift/compress with timeline changes
 * 3. Auto-managed effects (Keystroke): Regenerated from recording metadata
 * 4. Linked webcam clips: Stay aligned with video clips after operations
 */

import type { Project } from '@/types/project'
import type { ClipChange, EffectMutationBatch } from './types'
import { ClipBoundEffectSync } from './clip-bound-effect-sync'
import { TimeBasedEffectSync } from './time-based-effect-sync'
import { OrphanEffectCleanup } from './orphan-effect-cleanup'
import { WebcamSyncService } from './webcam'
import { syncKeystrokeEffects } from './keystroke-sync'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { EffectStore } from '@/features/effects/core/effects-store'

/**
 * Create an empty mutation batch for collecting effect changes.
 */
function createEmptyBatch(): EffectMutationBatch {
    return {
        toRemove: new Set<string>(),
        toUpdate: new Map(),
        toAdd: [],
    }
}

export const TimelineSyncOrchestrator = {
    /**
     * Main entry point - commit all sync operations after a clip change.
     * Called by TimelineCommand.mutate() after doMutate() completes.
     */
    commit(project: Project, change: ClipChange): void {
        // PHASE 1: Collect mutations (no array reassignment)
        const batch = createEmptyBatch()

        // 1. Handle clip-bound effects (Crop follows clipId)
        ClipBoundEffectSync.collectMutations(project, change, batch)

        // 2. Handle time-based effects (Zoom/Screen shift with content)
        TimeBasedEffectSync.collectMutations(project, change, batch)

        // 3. Sync linked webcam clips for video track changes
        // Note: WebcamSync operates on clips, not effects - runs separately
        WebcamSyncService.sync(project, change)

        // PHASE 2: Apply all effect mutations atomically
        if (batch.toRemove.size > 0 || batch.toUpdate.size > 0 || batch.toAdd.length > 0) {
            EffectStore.applyBatch(project, batch)
        }

        // PHASE 3: Regeneration (requires fresh state after batch apply)
        // 4. Regenerate keystroke effects
        syncKeystrokeEffects(project)

        // 5. Clean up any orphaned effects
        OrphanEffectCleanup.cleanup(project)

        // 6. Invalidate timeline caches
        // IMPORTANT: Always invalidate after clip changes to prevent stale data
        TimelineDataService.invalidateCache(project)
    },
}
