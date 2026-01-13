export const CURSOR_CONSTANTS = {
  // The base resolution the cursor is designed for (1080p)
  REFERENCE_WIDTH: 1920,

  // Default scale/size multiplier (5x = 160px for high visibility)
  DEFAULT_SIZE: 5,

  // Base dimensions of the cursor image source
  BASE_SIZE: 32,

  // Constraints (max 6x = 192px)
  MIN_SIZE: 0.5,
  MAX_SIZE: 6,

  // Step for UI sliders
  SIZE_STEP: 0.1,
} as const;
