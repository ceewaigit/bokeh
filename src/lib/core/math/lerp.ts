/**
 * Linear interpolation utilities - SSOT for all lerp operations
 */

/**
 * Linear interpolation between two values.
 * @param a Start value
 * @param b End value
 * @param t Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

/**
 * Inverse linear interpolation - finds the t value for a given value between a and b.
 * @param a Start value
 * @param b End value
 * @param value The value to find the interpolation factor for
 * @returns The interpolation factor t (can be outside 0-1 if value is outside [a, b])
 */
export function inverseLerp(a: number, b: number, value: number): number {
    if (a === b) return 0
    return (value - a) / (b - a)
}

/**
 * Remaps a value from one range to another.
 * @param value The value to remap
 * @param inMin Input range minimum
 * @param inMax Input range maximum
 * @param outMin Output range minimum
 * @param outMax Output range maximum
 * @returns The remapped value
 */
export function remap(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
): number {
    const t = inverseLerp(inMin, inMax, value)
    return lerp(outMin, outMax, t)
}
