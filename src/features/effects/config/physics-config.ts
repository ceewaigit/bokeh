/**
 * Centralized Physics & Timing Configuration
 * Single source of truth for all effect-related constants
 * 
 * Organized by effect type/domain for easy discovery
 */

// =============================================================================
// CAMERA BEHAVIOR (zoom/pan camera following)
// =============================================================================
// =============================================================================
// CAMERA BEHAVIOR (zoom/pan camera following)
// =============================================================================
export const CAMERA_CONFIG = {
    /** Dead-zone size as ratio of visible window (0-1). Cursor can move within this without panning. */
    deadZoneRatio: 0.4,
    /** Velocity threshold (px/ms) below which we consider the mouse "stationary" */
    velocityThreshold: 0.15,
    /** Time in ms the mouse must be stationary to trigger a "dwell" lock */
    dwellTriggerMs: 150,
    /** Velocity threshold (px/ms) to release the dwell lock (hysteresis) */
    releaseThreshold: 0.8,
    /** Number of samples to take within the averaging window for smooth camera follow */
    cinematicSamples: 8,
    /** Time delta threshold in ms to consider a seek (skip vs normal playback) */
    seekThresholdMs: 100,
    /** Spring tension - higher = more responsive */
    springTension: 100,
    /** Spring friction - balanced for smooth catch-up without floatiness */
    springFriction: 22,
} as const



// =============================================================================
// CURSOR STOP DETECTION (prevents camera halt-shake)
// =============================================================================
export const CURSOR_STOP_CONFIG = {
    /** Velocity threshold (normalized units/sec) below which cursor is "stopped" */
    velocityThreshold: 0.002,
    /** Time in ms cursor must be below velocity threshold before freeze activates */
    dwellMs: 80,
    /** Minimum zoom scale for stop detection (no effect at 1x) */
    minZoom: 1.05,
    /** Velocity damping factor when frozen (0-1, lower = faster settling) */
    damping: 0.7,
    /** Distance threshold for snapping to target when frozen */
    snapThreshold: 0.0005,
} as const

// =============================================================================
// ZOOM DETECTION (auto-zoom block generation)
// =============================================================================
export const ZOOM_DETECTION_CONFIG = {
    /** Minimum time in cluster to trigger zoom (ms) */
    minClusterTime: 800,
    /** Maximum cluster size as fraction of screen (20%) */
    maxClusterSize: 0.2,
    /** Minimum events to form a cluster */
    minClusterEvents: 8,
    /** Time window to analyze for clusters (ms) */
    clusterTimeWindow: 1500,
    /** Distance to merge nearby clusters (as fraction of screen) */
    clusterMergeDistance: 0.15,
    /** Minimum zoom duration (ms) */
    minDuration: 1000,
    /** Maximum zoom duration (ms) */
    maxDuration: 10000,
    /** Threshold for significant movement (10% of screen) */
    movementThreshold: 0.1,
    /** Weight for velocity in clustering */
    velocityWeight: 0.3,
    /** Minimum density to consider a valid cluster */
    minDensity: 0.4,
    /** Minimum stability for zoom */
    minStability: 0.5,
} as const

// =============================================================================
// ACTION-BASED ZOOM (smart action triggering)
// =============================================================================
export const ACTION_ZOOM_CONFIG = {
    // Action point importance scores (0-1)
    /** Base importance for click actions */
    clickImportanceBase: 0.7,
    /** Bonus for click after pause (indicates deliberate action) */
    clickAfterPauseBonus: 0.2,
    /** Bonus for click in new screen area */
    clickNewAreaBonus: 0.1,
    /** Base importance for typing start */
    typingImportanceBase: 0.6,
    /** Bonus for first typing burst in recording */
    typingFirstBurstBonus: 0.2,
    /** Bonus for typing after click */
    typingAfterClickBonus: 0.1,
    /** Base importance for scroll stop */
    scrollStopImportanceBase: 0.4,
    /** Bonus for significant scroll distance */
    scrollDistanceBonus: 0.2,
    /** Base importance for mouse dwell (lowest priority) */
    dwellImportanceBase: 0.2,

    // Timing configuration
    /** Anticipation time - start zoom before action (ms) */
    anticipationMs: 300,
    /** Minimum hold time at full zoom (ms) - Bokeh uses long sustained zooms */
    minHoldMs: 3000,
    /** Window to group related actions into one zoom (ms) - merge nearby actions */
    actionClusterWindowMs: 4000,
    /** Minimum time gap between zoom blocks (ms) */
    minZoomGapMs: 5000,
    /** Maximum zooms per minute - allow meaningful clicks but not spam */
    maxZoomsPerMinute: 5,

    // Zoom scale mapping based on importance
    /** Maximum zoom scale for highest importance */
    maxZoomScale: 2.5,
    /** Minimum zoom scale for lowest importance */
    minZoomScale: 1.5,

    // Importance thresholds
    /** Minimum importance score to trigger a zoom - all clicks pass (base 0.7) */
    minImportanceThreshold: 0.4,
    /** Importance level for "high priority" actions */
    highImportanceThreshold: 0.8,
    /** Minimum importance to trigger 3D effect - very selective */
    min3DImportanceThreshold: 0.9,

    // Area detection
    /** Pause duration before click to consider "deliberate" (ms) */
    pauseBeforeClickMs: 500,
    /** Distance threshold to consider "new area" (fraction of screen) */
    newAreaThreshold: 0.15,
    /** Typing burst detection window (ms) */
    typingBurstWindowMs: 800,
    /** Minimum keys in burst to trigger zoom */
    minKeysInBurst: 3,
} as const

// =============================================================================
// CURSOR RENDERING
// =============================================================================
export const CURSOR_RENDER_CONFIG = {
    /** Duration for cursor fade out animation (ms) */
    fadeOutDuration: 300,
    /** Duration for cursor fade in animation (ms) */
    fadeInDuration: 180,
    /** Number of motion blur trails */
    motionBlurTrails: 3,
    /** Velocity threshold for motion detection */
    velocityThreshold: 2,
} as const

// =============================================================================
// ZOOM TRANSITION (easing and timing for zoom in/out)
// =============================================================================
export const ZOOM_TRANSITION_CONFIG = {
    /** Default intro duration - fast enough to feel responsive (ms) */
    defaultIntroMs: 450,
    /** Default outro duration - slower for deliberate, cinematic feel (ms) */
    defaultOutroMs: 800,
    /** Minimum transition duration (ms) */
    minTransitionMs: 200,
    /** Maximum transition duration before it feels sluggish (ms) */
    maxTransitionMs: 1500,
} as const

// =============================================================================
// CAMERA MOTION BLUR (cinematic pan blur during camera movement)
// Uses velocity-proportional scaling: slow = subtle, fast = dramatic
// =============================================================================
export const CAMERA_MOTION_BLUR_CONFIG = {
    /** Maximum blur radius in pixels */
    maxBlurRadius: 8,
    /** Velocity threshold to start applying blur (px/frame delta) - only blur on fast pans */
    velocityThreshold: 20,
    /** Blur intensity multiplier - scales with velocity for cinematic feel */
    intensityMultiplier: 0.08,
} as const

// =============================================================================
// KEYSTROKE RENDERING
// =============================================================================
export const KEYSTROKE_CONFIG = {
    /** Buffer timeout for keystroke grouping (ms) */
    bufferTimeout: 800,
    /** Default display duration for keystrokes (ms) */
    defaultDisplayDuration: 2000,
    /** Fade in animation duration (ms) */
    fadeInDuration: 120,
    /** Fade out animation duration (ms) */
    fadeOutDuration: 400,
} as const

// =============================================================================
// BACKGROUND/SHADOW EFFECTS
// =============================================================================
export const BACKGROUND_CONFIG = {
    /** Maximum blur radius for shadow effect */
    maxShadowBlur: 50,
    /** Divisor to convert shadow intensity (0-100) to opacity (0-1) */
    shadowIntensityToOpacityDivisor: 100,
    /** Divisor for shadow Y offset relative to blur */
    shadowOffsetDivisor: 4,
    /** Default center position for background images */
    defaultImagePosition: { x: 0.5, y: 0.5 },
    /** Fallback color when no background color specified */
    defaultBackgroundColor: '#000000',
} as const

// =============================================================================
// COMBINED EXPORT for convenient access
// =============================================================================
export const PHYSICS_CONFIG = {
    camera: CAMERA_CONFIG,
    cursorStop: CURSOR_STOP_CONFIG,
    zoomDetection: ZOOM_DETECTION_CONFIG,
    zoomTransition: ZOOM_TRANSITION_CONFIG,
    actionZoom: ACTION_ZOOM_CONFIG,
    cursorRender: CURSOR_RENDER_CONFIG,
    cameraMotionBlur: CAMERA_MOTION_BLUR_CONFIG,
    keystroke: KEYSTROKE_CONFIG,
    background: BACKGROUND_CONFIG,
} as const

// Type exports for consumers
export type CameraConfig = typeof CAMERA_CONFIG
export type CursorStopConfig = typeof CURSOR_STOP_CONFIG
export type ZoomDetectionConfig = typeof ZOOM_DETECTION_CONFIG
export type ZoomTransitionConfig = typeof ZOOM_TRANSITION_CONFIG
export type ActionZoomConfig = typeof ACTION_ZOOM_CONFIG
export type CursorRenderConfig = typeof CURSOR_RENDER_CONFIG
export type KeystrokeConfig = typeof KEYSTROKE_CONFIG
export type BackgroundConfig = typeof BACKGROUND_CONFIG
export type CameraMotionBlurConfig = typeof CAMERA_MOTION_BLUR_CONFIG
export type PhysicsConfig = typeof PHYSICS_CONFIG
