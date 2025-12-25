/**
 * Core Camera Module - Single Source of Truth
 * 
 * Provides camera follow, zoom, and movement algorithms.
 * Used by both preview and export rendering paths.
 */

// Zoom blocks
export { parseZoomBlocks, getZoomBlockAtTime } from './zoom-blocks'
export type { ParsedZoomBlock } from './zoom-blocks'

// Dead zone and follow
export {
    getAdaptiveDeadZoneRatio,
    getHalfWindows,
    calculateFollowTargetNormalized,
} from './dead-zone'
export type { OutputOverscan } from './dead-zone'

// Visibility
export {
    clampCenterToContentBounds,
    projectCenterToKeepCursorVisible,
} from './visibility'

// Cursor velocity
export {
    calculateCursorVelocity,
    getExponentiallySmoothedCursorNorm,
} from './cursor-velocity'
export type { CursorVelocityResult } from './cursor-velocity'

// Smoothing
export {
    getMotionClusters,
    getCinematicMousePosition,
    normalizeSmoothingAmount,
    calculateAttractor,
} from './smoothing'
export type { Cluster } from './smoothing'
