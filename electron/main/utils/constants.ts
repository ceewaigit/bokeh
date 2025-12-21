/**
 * Shared constants for all tracking modules
 */

// Timing constants (in milliseconds)
export const TIMING = {
  // Mouse tracking
  MIN_MOUSE_INTERVAL: 8,
  MAX_MOUSE_INTERVAL: 1000,
  DEFAULT_MOUSE_INTERVAL: 8,
  MOUSE_HISTORY_SIZE: 5,
  CURSOR_STABILIZE_MS: 30,
  
  // Monitor overlay
  MONITOR_OVERLAY_DURATION: 2000,
  
  // Velocity smoothing
  VELOCITY_SMOOTHING_FACTOR: 0.2,
  MIN_TIME_DELTA: 1, // Prevent division by zero
} as const

// Display constants
export const DISPLAY = {
  DEFAULT_SCALE_FACTOR: 1,
} as const

// Button mappings
export const MOUSE_BUTTONS = {
  LEFT: 1,
  RIGHT: 2,
  MIDDLE: 3,
} as const

// Scroll wheel direction
export const SCROLL_DIRECTION = {
  UP: 3,
  DOWN: 1,
} as const