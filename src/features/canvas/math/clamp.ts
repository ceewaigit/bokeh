/**
 * Clamping utilities - SSOT for all clamping operations
 */

/**
 * Clamps a number between min and max values.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

/**
 * Clamps a number between 0 and 1.
 */
export function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value))
}
