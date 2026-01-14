/**
 * Centralized animation constants for consistent motion throughout the app.
 * Using these ensures a cohesive feel across all interactive elements.
 */

/** Standard spring config for buttons and interactive elements */
export const springConfig = {
  type: "spring",
  stiffness: 400,
  damping: 28
} as const

/** Snappier spring for toolbar actions */
export const springSnappy = {
  type: "spring",
  stiffness: 500,
  damping: 30
} as const

/** Softer spring for larger UI elements */
export const springSoft = {
  type: "spring",
  stiffness: 300,
  damping: 25
} as const

/** Quick tween for tab transitions */
export const tweenTab = {
  type: "tween",
  duration: 0.12,
  ease: [0.25, 0.1, 0.25, 1]
} as const

/** Standard hover/tap scale values */
export const scaleInteraction = {
  hover: 1.02,
  tap: 0.97,
} as const
