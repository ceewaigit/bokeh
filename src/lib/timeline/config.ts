/**
 * Centralized configuration for timeline constants
 */
export const TimelineConfig = {
  // Layout dimensions
  RULER_HEIGHT: 24,
  SPEED_UP_BAR_SPACE: 40, // Extra space for speed-up suggestion bars (increased to 40 to clear ruler + shadows)
  TRACK_LABEL_WIDTH: 42,
  TRACK_PADDING: 4,
  MIN_CLIP_WIDTH: 1,
  MAX_TRACK_HEIGHT: 120,

  // Fixed track heights (enables scrolling when content exceeds viewport)
  MIN_VIDEO_TRACK_HEIGHT: 120,
  MIN_AUDIO_TRACK_HEIGHT: 80,
  MIN_EFFECT_TRACK_HEIGHT: 50,

  // Snapping behavior
  SNAP_THRESHOLD_MS: 200,
  SNAP_THRESHOLD_PX: 15,
  SNAP_INTERVAL_MS: 100,

  // Clip positioning
  DEFAULT_CLIP_GAP_MS: 0,
  AUTO_POSITION_GAP_MS: 100,

  // Zoom settings
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 10,
  DEFAULT_ZOOM: 0.5,
  ZOOM_STEP: 0.1,

  // Playback
  DEFAULT_FPS: 30,
  PLAYBACK_UPDATE_INTERVAL_MS: 33,

  // Effects defaults
  ZOOM_EFFECT_DEFAULT_SCALE: 2.0,
  ZOOM_EFFECT_DEFAULT_INTRO_MS: 500,
  ZOOM_EFFECT_DEFAULT_OUTRO_MS: 500,
  ZOOM_EFFECT_MIN_DURATION_MS: 100,
  ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX: 8,
  ZOOM_EFFECT_COMPACT_THRESHOLD_PX: 50,

  // Timeline visibility
  BASE_VISIBLE_DURATION_MS: 10000,
  TIMELINE_EXTRA_PADDING_PERCENT: 0.3,

  // Keyboard shortcuts
  SHORTCUTS: {
    PLAY_PAUSE: ' ',
    SPLIT: 's',
    DELETE: ['Delete', 'Backspace'],
    COPY: ['Meta+c', 'Control+c'],
    PASTE: ['Meta+v', 'Control+v'],
    CUT: ['Meta+x', 'Control+x'],
    DUPLICATE: ['Meta+d', 'Control+d'],
    SELECT_ALL: ['Meta+a', 'Control+a'],
    DESELECT: 'Escape',
    UNDO: ['Meta+z', 'Control+z'],
    REDO: ['Meta+Shift+z', 'Control+Shift+z'],
    SAVE: ['Meta+s', 'Control+s']
  },

  // Animation durations
  ANIMATION: {
    CLIP_SNAP_BACK_MS: 200,
    ZOOM_TRANSITION_MS: 300,
    PANEL_SLIDE_MS: 250
  },

  // Color opacity values
  OPACITY: {
    CLIP_DRAGGING: 0.6,
    CLIP_INVALID: 0.5,
    CLIP_NORMAL: 1.0,
    EFFECT_BLOCK_SELECTED: 0.95,
    EFFECT_BLOCK_NORMAL: 0.85,
    EFFECT_BLOCK_DRAGGING: 0.7
  }
} as const

// Type for the config
export type TimelineConfigType = typeof TimelineConfig

// Helper to get config values with optional overrides
export function getTimelineConfig<K extends keyof TimelineConfigType>(
  key: K,
  override?: TimelineConfigType[K]
): TimelineConfigType[K] {
  return override !== undefined ? override : TimelineConfig[key]
}

/**
 * Calculate the inner height of a clip (usable area inside padding).
 * This is a commonly repeated calculation: trackHeight - TRACK_PADDING * 2
 *
 * @param trackHeight - The total track height
 * @returns The height available for clip content, clamped to minimum 0
 */
export function getClipInnerHeight(trackHeight: number): number {
  return Math.max(0, trackHeight - TimelineConfig.TRACK_PADDING * 2)
}
