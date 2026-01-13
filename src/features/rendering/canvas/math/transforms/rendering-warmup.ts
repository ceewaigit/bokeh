/**
 * Rendering Pipeline Warm-up
 *
 * Pre-warms JIT compilation of expensive functions during project load.
 * This eliminates the "warm-up lag" where first few frames are slow until
 * V8/JavaScriptCore JIT-compiles hot code paths.
 *
 * IMPORTANT: We import the ACTUAL functions from zoom-transform.ts, not copies.
 * JIT compilation is per-function-instance, so warming up copies doesn't help.
 */

import {
    smoothStep,
    smootherStep,
    easeInOutCubic,
} from '../easing'

// Import the ACTUAL easing functions used during playback
import {
    easeInOutSine,
    easeOutExpo,
    easeInOutExpo,
    easeInOutSigmoid,
    easeOutQuint,
    easeSettleHybrid,
} from './zoom-transform'

/**
 * Pre-warm all easing functions used in the rendering pipeline.
 * Should be called during project load, after camera path calculation.
 *
 * Benchmark: ~2-5ms on modern hardware (one-time cost during load)
 */
export function warmUpRenderingPipeline(): void {
    // Use a volatile variable to prevent dead code elimination
    let sink = 0

    // 1000 iterations is sufficient for most JIT engines to optimize
    const ITERATIONS = 1000

    for (let i = 0; i < ITERATIONS; i++) {
        const t = i / (ITERATIONS - 1)

        // Expensive transcendental functions (primary warm-up targets)
        // These are the ACTUAL functions from zoom-transform.ts
        sink += easeInOutExpo(t)
        sink += easeInOutSigmoid(t)
        sink += easeInOutSigmoid(t, 8)  // Different k value
        sink += easeOutExpo(t)
        sink += easeInOutSine(t)
        sink += easeOutQuint(t)
        sink += easeSettleHybrid(t)

        // Standard easing functions (from easing.ts)
        sink += smoothStep(t)
        sink += smootherStep(t)
        sink += easeInOutCubic(t)

        // Math functions used in zoom/motion blur calculations
        sink += Math.sqrt(t * t + (1 - t) * (1 - t))
        sink += Math.atan2(t, 1 - t)
    }

    // Prevent optimizer from removing the entire loop
    if (sink === -Infinity) {
        console.log('Warm-up sink (never printed):', sink)
    }
}
