/**
 * Effect Sync Module
 * 
 * Provides unified effect synchronization after clip operations.
 */

export { EffectSyncService } from './effect-sync-service'
export { syncKeystrokeEffects, createKeystrokeEffect } from './keystroke-sync'
export type { ClipChange, ClipState, SegmentMapping } from './types'
