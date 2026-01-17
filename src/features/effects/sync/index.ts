/**
 * Timeline Sync Module
 *
 * Provides unified timeline synchronization after clip operations.
 * Handles effects, webcam clips, and other linked timeline state.
 */

// Main orchestrator
export { TimelineSyncOrchestrator } from './timeline-sync-orchestrator'

// Focused sync services
export { ClipBoundEffectSync } from './clip-bound-effect-sync'
export { TimeBasedEffectSync } from './time-based-effect-sync'
export { OrphanEffectCleanup } from './orphan-effect-cleanup'
export { WebcamSyncService } from './webcam'

// Keystroke sync
export {
    syncKeystrokeEffects,
    createKeystrokeEffect,
} from './keystroke-sync'

// ClipChange utilities
export { ClipChangeBuilder } from './clip-change-builder'
export type { ClipChange, ClipState, SegmentMapping } from './types'
