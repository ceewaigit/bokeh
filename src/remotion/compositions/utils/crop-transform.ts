/**
 * Crop transformation utilities for non-destructive video cropping
 * Calculates scale and translation to fill canvas with cropped region
 */

import type { CropEffectData } from '@/types/project';
import type { CropTransform } from '@/types';

/**
 * Default crop data representing full frame (no crop)
 */
export const DEFAULT_CROP_DATA: CropEffectData = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

/**
 * Check if crop data represents a full frame (effectively no crop)
 */
export function isFullFrameCrop(cropData: CropEffectData): boolean {
  // User-driven crop values are often fractional; treat near-full-frame crops as identity
  // to avoid subtle unintended zoom/offset when the UI is visually aligned to edges.
  const EPS = 1e-3;
  return (
    Math.abs(cropData.x) <= EPS &&
    Math.abs(cropData.y) <= EPS &&
    Math.abs(cropData.width - 1) <= EPS &&
    Math.abs(cropData.height - 1) <= EPS
  );
}

/**
 * Calculate crop transformation to fill canvas with cropped region.
 * Uses uniform scaling to preserve aspect ratio of cropped content.
 * Uses MIN scale to ensure the ENTIRE selected region is visible (may letterbox).
 * Includes clipPath to hide non-cropped areas.
 */
export function calculateCropTransform(
  cropData: CropEffectData | null | undefined,
  drawWidth: number,
  drawHeight: number
): CropTransform {
  if (!cropData || isFullFrameCrop(cropData)) {
    return { scale: 1, translateX: 0, translateY: 0, isActive: false };
  }

  const cropWidth = Math.max(0.01, Math.min(1, cropData.width));
  const cropHeight = Math.max(0.01, Math.min(1, cropData.height));
  const cropX = Math.max(0, Math.min(1 - cropWidth, cropData.x));
  const cropY = Math.max(0, Math.min(1 - cropHeight, cropData.y));

  // Use MIN scale so the ENTIRE cropped region fits (no clipping of selection)
  const scaleX = 1 / cropWidth;
  const scaleY = 1 / cropHeight;
  const scale = Math.min(scaleX, scaleY);

  // Move crop center to canvas center
  const cropCenterX = cropX + cropWidth / 2;
  const cropCenterY = cropY + cropHeight / 2;
  const translateX = (0.5 - cropCenterX) * drawWidth * scale;
  const translateY = (0.5 - cropCenterY) * drawHeight * scale;

  // Generate clip-path to mask non-cropped areas (in original content coordinates)
  // inset(top right bottom left) - percentages from each edge
  const clipTop = cropY * 100;
  const clipRight = (1 - cropX - cropWidth) * 100;
  const clipBottom = (1 - cropY - cropHeight) * 100;
  const clipLeft = cropX * 100;
  const clipPath = `inset(${clipTop.toFixed(2)}% ${clipRight.toFixed(2)}% ${clipBottom.toFixed(2)}% ${clipLeft.toFixed(2)}%)`;

  return { scale, translateX, translateY, isActive: true, clipPath };
}

/**
 * Generate CSS transform string for crop effect with GPU acceleration
 */
export function getCropTransformString(cropTransform: CropTransform): string {
  if (!cropTransform.isActive) {
    return '';
  }

  // Round to prevent sub-pixel jitter
  const translateX = Math.round(cropTransform.translateX * 100) / 100;
  const translateY = Math.round(cropTransform.translateY * 100) / 100;
  const scale = Math.round(cropTransform.scale * 1000) / 1000;

  // Use transform3d for GPU acceleration
  return `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${scale}, ${scale}, 1)`;
}

/**
 * Combine crop and zoom transforms into a single CSS transform string
 * Order: Crop transform first, then zoom transform
 */
export function combineCropAndZoomTransforms(
  cropTransformStr: string,
  zoomTransformStr: string
): string {
  if (!cropTransformStr && !zoomTransformStr) {
    return '';
  }
  if (!cropTransformStr) {
    return zoomTransformStr;
  }
  if (!zoomTransformStr) {
    return cropTransformStr;
  }
  // Crop is applied first (inner), zoom is applied second (outer)
  return `${zoomTransformStr} ${cropTransformStr}`;
}

/**
 * Validate and clamp crop data to valid bounds
 */
export function clampCropData(cropData: CropEffectData): CropEffectData {
  const width = Math.max(0.05, Math.min(1, cropData.width));
  const height = Math.max(0.05, Math.min(1, cropData.height));
  const x = Math.max(0, Math.min(1 - width, cropData.x));
  const y = Math.max(0, Math.min(1 - height, cropData.y));

  return { x, y, width, height };
}
