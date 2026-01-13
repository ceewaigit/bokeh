/**
 * Proxy Service Constants
 *
 * Shared constants for proxy generation decisions.
 * Used by both renderer and main process proxy services.
 */

/**
 * Minimum video width to trigger proxy generation.
 * Videos larger than 1440p (2560px) will be proxied for better playback performance.
 */
export const MIN_WIDTH_FOR_PREVIEW_PROXY = 2560
