export const CURSOR_CONSTANTS = {
  // The base resolution the cursor is designed for (1080p)
  REFERENCE_WIDTH: 1920,

  // Default scale/size multiplier (1.5x = 48px, professional size)
  DEFAULT_SIZE: 1.5,

  // Base dimensions of the cursor image source
  BASE_SIZE: 32,

  // Constraints (max 3x = 96px to prevent unprofessional oversized cursors)
  MIN_SIZE: 0.5,
  MAX_SIZE: 3,

  // Step for UI sliders
  SIZE_STEP: 0.1,
} as const;
