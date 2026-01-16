/**
 * Timeline Sync Module
 *
 * Provides unified timeline synchronization after clip operations.
 * Handles effects, webcam clips, and other linked timeline state.
 */

export { TimelineSyncService } from './timeline-sync-service'
export {
    syncKeystrokeEffects,
    createKeystrokeEffect,
} from './keystroke-sync'
export type { ClipChange, ClipState, SegmentMapping } from './types'
