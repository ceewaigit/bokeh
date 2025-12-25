/**
 * Coordinate Conversions - Functions to convert between coordinate spaces
 */

import type { SourcePoint, NormalizedPoint, SourceDimensions } from './types'
import { sourcePoint, normalizedPoint } from './types'
import { clamp01 } from '../math'

/**
 * Convert source pixel coordinates to normalized [0, 1] coordinates.
 * 
 * @param source - Point in source pixel space
 * @param dimensions - Source dimensions (width, height)
 * @returns Point in normalized space [0, 1]
 */
export function sourceToNormalized(
    source: SourcePoint,
    dimensions: SourceDimensions
): NormalizedPoint {
    if (dimensions.width <= 0 || dimensions.height <= 0) {
        return normalizedPoint(0.5, 0.5)
    }

    return normalizedPoint(
        source.x / dimensions.width,
        source.y / dimensions.height
    )
}

/**
 * Convert source pixel coordinates to normalized [0, 1] coordinates, clamped.
 * 
 * @param source - Point in source pixel space
 * @param dimensions - Source dimensions (width, height)
 * @returns Point in normalized space [0, 1], clamped to valid range
 */
export function sourceToNormalizedClamped(
    source: SourcePoint,
    dimensions: SourceDimensions
): NormalizedPoint {
    if (dimensions.width <= 0 || dimensions.height <= 0) {
        return normalizedPoint(0.5, 0.5)
    }

    return normalizedPoint(
        clamp01(source.x / dimensions.width),
        clamp01(source.y / dimensions.height)
    )
}

/**
 * Convert normalized [0, 1] coordinates to source pixel coordinates.
 * 
 * @param normalized - Point in normalized space [0, 1]
 * @param dimensions - Source dimensions (width, height)
 * @returns Point in source pixel space
 */
export function normalizedToSource(
    normalized: NormalizedPoint,
    dimensions: SourceDimensions
): SourcePoint {
    return sourcePoint(
        normalized.x * dimensions.width,
        normalized.y * dimensions.height
    )
}

/**
 * Convert raw (unbranded) coordinates to normalized space.
 * Convenience function for migrating existing code.
 * 
 * @param x - X coordinate in source pixels
 * @param y - Y coordinate in source pixels
 * @param width - Source width in pixels
 * @param height - Source height in pixels
 * @returns Point in normalized space [0, 1]
 */
export function rawToNormalized(
    x: number,
    y: number,
    width: number,
    height: number
): NormalizedPoint {
    if (width <= 0 || height <= 0) {
        return normalizedPoint(0.5, 0.5)
    }

    return normalizedPoint(x / width, y / height)
}

/**
 * Convert raw (unbranded) normalized coordinates to source pixels.
 * Convenience function for migrating existing code.
 * 
 * @param normX - Normalized X coordinate [0, 1]
 * @param normY - Normalized Y coordinate [0, 1]
 * @param width - Source width in pixels
 * @param height - Source height in pixels
 * @returns Point in source pixel space
 */
export function normalizedToRaw(
    normX: number,
    normY: number,
    width: number,
    height: number
): { x: number; y: number } {
    return {
        x: normX * width,
        y: normY * height
    }
}
