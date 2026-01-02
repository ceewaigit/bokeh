/**
 * Core Coordinates Module - Single Source of Truth
 * 
 * Provides branded types and utilities for coordinate space management.
 * Prevents mixing source pixel coordinates with normalized coordinates at compile time.
 */

// Types
export type { SourcePoint, NormalizedPoint, SourceDimensions } from './types'
export { sourcePoint, normalizedPoint, rawPoint } from './types'

// Conversions
export {
    sourceToNormalized,
    sourceToNormalizedClamped,
    normalizedToSource,
    rawToNormalized,
    normalizedToRaw,
} from './conversions'

// Dimensions
export { getSourceDimensions, getSourceDimensionsStatic } from './dimensions'

// Overlay utilities (normalized 0-100% helpers)
export * from './overlay-utils'
