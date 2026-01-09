// Overlay sizing/positioning is designed against a 1080p reference canvas (1920px wide).
// Keep all overlays visually consistent across output resolutions by scaling from this baseline.

export const OVERLAY_REFERENCE_WIDTH_PX = 1920

// Default inset from canvas edges at 1080p. Kept intentionally small to feel "attached"
// to the edge without being cramped.
export const OVERLAY_SAFE_MARGIN_PX = 20

export function getOverlayDisplayScale(compositionWidthPx: number): number {
  if (!Number.isFinite(compositionWidthPx) || compositionWidthPx <= 0) return 1
  return compositionWidthPx / OVERLAY_REFERENCE_WIDTH_PX
}

export function getOverlaySafeMarginPx(displayScale: number): number {
  if (!Number.isFinite(displayScale) || displayScale <= 0) return OVERLAY_SAFE_MARGIN_PX
  return OVERLAY_SAFE_MARGIN_PX * displayScale
}

