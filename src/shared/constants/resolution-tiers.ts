/**
 * Resolution Tiers and Standard Dimensions
 *
 * Single source of truth for resolution presets used across the app:
 * - Export dialog resolution options
 * - COMMON_RESOLUTIONS for aspect ratio presets
 * - Proxy dimension calculations
 */

/**
 * Standard resolution tier with all related metadata.
 * The standardWidth is the 16:9 reference width for each named preset.
 */
export interface ResolutionTier {
  /** Resolution identifier key */
  key: string
  /** Display label (e.g., "5K", "4K", "1080p") */
  label: string
  /** Standard height in pixels */
  height: number
  /** Standard 16:9 width in pixels - used for validation */
  standardWidth: number
}

/**
 * Standard resolution tiers ordered from highest to lowest.
 * Used by export dialog to determine which named presets to show.
 */
export const RESOLUTION_TIERS: ResolutionTier[] = [
  { key: '6k', label: '6K', height: 3456, standardWidth: 6144 },
  { key: '5k', label: '5K', height: 2880, standardWidth: 5120 },
  { key: '4k', label: '4K', height: 2160, standardWidth: 3840 },
  { key: '1440p', label: '1440p', height: 1440, standardWidth: 2560 },
  { key: '1080p', label: '1080p', height: 1080, standardWidth: 1920 },
  { key: '720p', label: '720p', height: 720, standardWidth: 1280 },
  { key: '480p', label: '480p', height: 480, standardWidth: 854 },
]

/**
 * Get a resolution tier by its key.
 */
export function getResolutionTier(key: string): ResolutionTier | undefined {
  return RESOLUTION_TIERS.find(t => t.key === key)
}

/**
 * Result of computing available resolution options for a source.
 */
export interface ComputedResolutionOption {
  key: string
  label: string
  width: number
  height: number
}

/**
 * Compute available resolution options for a given source.
 * Returns named presets based on height (the "p" in 1080p refers to vertical lines).
 * Works for all aspect ratios - width is calculated to preserve source aspect ratio.
 *
 * @param sourceWidth - Source video width
 * @param sourceHeight - Source video height
 * @param excludeKeys - Optional keys to exclude (e.g., ['480p'] for export)
 */
export function getAvailableResolutionOptions(
  sourceWidth: number,
  sourceHeight: number,
  excludeKeys: string[] = []
): ComputedResolutionOption[] {
  const options: ComputedResolutionOption[] = []
  const aspect = sourceWidth / sourceHeight

  for (const tier of RESOLUTION_TIERS) {
    if (excludeKeys.includes(tier.key)) continue
    // Only show tiers smaller than source height (downscale options)
    if (sourceHeight <= tier.height) continue

    // Calculate dimensions preserving aspect ratio (ensure even numbers for encoding)
    const height = Math.max(2, Math.floor(tier.height / 2) * 2)
    const width = Math.max(2, Math.floor(Math.round(height * aspect) / 2) * 2)

    options.push({
      key: tier.key,
      label: tier.label,
      width,
      height,
    })
  }

  return options
}

/**
 * Maximum proxy dimensions to prevent hardware encoder failures.
 */
export const MAX_PROXY_WIDTH = 3840  // 4K UHD
export const MAX_PROXY_HEIGHT = 2160

/**
 * Standard proxy dimensions (generated during project load).
 */
export const PROXY_WIDTH = 2560
export const PROXY_HEIGHT = 1440

/**
 * Scrub proxy dimensions (low res for performance).
 */
export const SCRUB_WIDTH = 640
export const SCRUB_HEIGHT = 360

/**
 * Preview display constants for smart resolution capping.
 */
export const PREVIEW_DISPLAY_WIDTH = 640
export const PREVIEW_DISPLAY_HEIGHT = 360
export const RETINA_MULTIPLIER = 2
