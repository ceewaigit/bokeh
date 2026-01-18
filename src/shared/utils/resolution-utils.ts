/**
 * Resolution and Proxy Calculation Utilities
 *
 * Single source of truth for zoom/resolution calculations used by both
 * renderer (useVideoUrl) and main process (export handler).
 */

import type { Effect, ZoomEffectData } from '@/types/project';
import { EffectType } from '@/types/project';

// Import and re-export all resolution constants from the centralized source
import {
    PROXY_WIDTH,
    PROXY_HEIGHT,
    SCRUB_WIDTH,
    SCRUB_HEIGHT,
    PREVIEW_DISPLAY_WIDTH,
    PREVIEW_DISPLAY_HEIGHT,
    RETINA_MULTIPLIER,
    MAX_PROXY_WIDTH,
    MAX_PROXY_HEIGHT,
} from '@/shared/constants/resolution-tiers';

export {
    PROXY_WIDTH,
    PROXY_HEIGHT,
    SCRUB_WIDTH,
    SCRUB_HEIGHT,
    PREVIEW_DISPLAY_WIDTH,
    PREVIEW_DISPLAY_HEIGHT,
    RETINA_MULTIPLIER,
    MAX_PROXY_WIDTH,
    MAX_PROXY_HEIGHT,
};

/**
 * Calculate the maximum zoom scale used across all zoom effects.
 * Scans enabled zoom effects and returns the highest scale value.
 */
export function getMaxZoomScale(effects: Effect[]): number {
    let maxScale = 1;
    for (const effect of effects) {
        if (effect.type === EffectType.Zoom && effect.enabled !== false) {
            const data = effect.data as ZoomEffectData;
            const scale = data?.scale ?? 1;
            if (scale > maxScale) {
                maxScale = scale;
            }
        }
    }
    return maxScale;
}

/**
 * Determine if proxy resolution is sufficient for the target output.
 * Logic: proxyRes >= targetRes × maxZoom × retinaMultiplier
 */
export function isProxySufficientForTarget(
    targetWidth: number,
    targetHeight: number,
    maxZoomScale: number,
    proxyWidth: number = PROXY_WIDTH,
    proxyHeight: number = PROXY_HEIGHT
): boolean {
    const requiredWidth = targetWidth * maxZoomScale * RETINA_MULTIPLIER;
    const requiredHeight = targetHeight * maxZoomScale * RETINA_MULTIPLIER;
    return proxyWidth >= requiredWidth && proxyHeight >= requiredHeight;
}

/**
 * Determine if proxy resolution is sufficient for export output.
 * Export uses 1x pixels (no retina multiplier).
 */
export function isProxySufficientForExport(
    targetWidth: number,
    targetHeight: number,
    maxZoomScale: number,
    proxyWidth: number = PROXY_WIDTH,
    proxyHeight: number = PROXY_HEIGHT
): boolean {
    const requiredWidth = targetWidth * maxZoomScale;
    const requiredHeight = targetHeight * maxZoomScale;
    return proxyWidth >= requiredWidth && proxyHeight >= requiredHeight;
}

/**
 * Calculate optimal proxy dimensions for export.
 * Returns dimensions that cover output × zoom while staying within source bounds.
 */
export interface ProxyDimensionResult {
    width: number;
    height: number;
    needsProxy: boolean;
}

export function calculateProxyDimensions(opts: {
    outputWidth: number;
    outputHeight: number;
    sourceWidth: number;
    sourceHeight: number;
    maxZoomScale: number;
}): ProxyDimensionResult {
    const { outputWidth, outputHeight, sourceWidth, sourceHeight, maxZoomScale } = opts;

    // Calculate zoom-adjusted dimensions, capped at source and 4K limits
    const maxW = Math.min(outputWidth * maxZoomScale, sourceWidth, MAX_PROXY_WIDTH);
    const maxH = Math.min(outputHeight * maxZoomScale, sourceHeight, MAX_PROXY_HEIGHT);

    // FFmpeg requires even dimensions for yuv420p
    const width = Math.ceil(maxW / 2) * 2;
    const height = Math.ceil(maxH / 2) * 2;

    // Only create proxy if it would be meaningfully smaller than source (15%+ reduction)
    const needsProxy =
        width > 0 &&
        height > 0 &&
        (width < sourceWidth * 0.85 || height < sourceHeight * 0.85);

    return { width, height, needsProxy };
}

/**
 * Calculate whether source resolution is overkill for preview display.
 * Used to decide if proxy should be used even when not strictly required for quality.
 */
export function isSourceOverkillForPreview(
    sourceWidth: number,
    sourceHeight: number,
    maxZoomScale: number
): boolean {
    const maxUsefulWidth = PREVIEW_DISPLAY_WIDTH * RETINA_MULTIPLIER * maxZoomScale;
    const maxUsefulHeight = PREVIEW_DISPLAY_HEIGHT * RETINA_MULTIPLIER * maxZoomScale;
    // Source is overkill if it exceeds useful resolution by >20%
    return sourceWidth > maxUsefulWidth * 1.2 || sourceHeight > maxUsefulHeight * 1.2;
}
