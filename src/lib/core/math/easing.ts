/**
 * Easing functions - SSOT for all animation easing
 * 
 * All functions expect t in range [0, 1] and return values in [0, 1].
 * Input is NOT clamped - caller is responsible for clamping if needed.
 */

import { clamp01 } from './clamp'

/**
 * Smooth step interpolation (3rd order polynomial).
 * Provides smooth acceleration and deceleration.
 */
export function smoothStep(t: number): number {
    const x = clamp01(t)
    return x * x * (3 - 2 * x)
}

/**
 * Smoother step interpolation (5th order polynomial).
 * Ultra-smooth with zero first and second derivatives at endpoints.
 * Preferred for camera and zoom transitions.
 */
export function smootherStep(t: number): number {
    const x = clamp01(t)
    return x * x * x * (x * (x * 6 - 15) + 10)
}

/**
 * Ease out cubic - fast start, slow end.
 */
export function easeOutCubic(t: number): number {
    const x = clamp01(t)
    return 1 - Math.pow(1 - x, 3)
}

/**
 * Ease in out cubic - slow start and end.
 */
export function easeInOutCubic(t: number): number {
    const x = clamp01(t)
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/**
 * Ease out quad - gentle deceleration.
 */
export function easeOutQuad(t: number): number {
    const x = clamp01(t)
    return 1 - (1 - x) * (1 - x)
}

/**
 * Ease in out quad - symmetric gentle easing.
 */
export function easeInOutQuad(t: number): number {
    const x = clamp01(t)
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
}
