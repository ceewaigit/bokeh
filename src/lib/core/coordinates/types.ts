/**
 * Coordinate Types - Branded types for compile-time coordinate space safety
 * 
 * This module provides branded types to prevent mixing coordinate spaces:
 * - SourcePoint: Pixel coordinates in source video space (e.g., 1920x1080)
 * - NormalizedPoint: Coordinates normalized to [0, 1] range
 * 
 * Usage:
 *   const source = { x: 960, y: 540 } as SourcePoint
 *   const normalized = sourceToNormalized(source, dims)
 *   // TypeScript will error if you pass SourcePoint where NormalizedPoint is expected
 */

declare const SourceBrand: unique symbol
declare const NormalizedBrand: unique symbol

/**
 * Point in source video pixel space.
 * Coordinates are in actual pixels (e.g., x: 0-1920, y: 0-1080).
 */
export type SourcePoint = {
    readonly x: number
    readonly y: number
    readonly [SourceBrand]: never
}

/**
 * Point in normalized coordinate space.
 * Coordinates are in range [0, 1] where (0,0) is top-left and (1,1) is bottom-right.
 */
export type NormalizedPoint = {
    readonly x: number
    readonly y: number
    readonly [NormalizedBrand]: never
}

/**
 * Source dimensions in pixels.
 */
export interface SourceDimensions {
    readonly width: number
    readonly height: number
}

/**
 * Create a SourcePoint from raw coordinates.
 * This is the proper way to construct a SourcePoint with type safety.
 */
export function sourcePoint(x: number, y: number): SourcePoint {
    return { x, y } as unknown as SourcePoint
}

/**
 * Create a NormalizedPoint from raw coordinates.
 * This is the proper way to construct a NormalizedPoint with type safety.
 */
export function normalizedPoint(x: number, y: number): NormalizedPoint {
    return { x, y } as unknown as NormalizedPoint
}

/**
 * Extract raw coordinates from a branded point.
 * Use this when you need to pass coordinates to APIs that don't use branded types.
 */
export function rawPoint(point: SourcePoint | NormalizedPoint): { x: number; y: number } {
    return { x: point.x, y: point.y }
}
