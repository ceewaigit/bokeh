/**
 * Core Math Utilities - Single Source of Truth
 * 
 * All math utilities used across the codebase should be imported from here.
 * This eliminates duplicate definitions and ensures consistent behavior.
 */

// Clamping
export { clamp, clamp01 } from './clamp'

// Interpolation
export { lerp, inverseLerp, remap } from './lerp'

// Easing
export {
    smoothStep,
    smootherStep,
    easeOutCubic,
    easeInOutCubic,
    easeOutQuad,
    easeInOutQuad,
} from './easing'

// Binary search
export { binarySearchLE, binarySearchGE, binarySearchEvents } from './search'
