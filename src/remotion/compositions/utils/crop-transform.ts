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
 * Calculate the crop transformation to fill canvas with cropped region
 *
 * The transform scales up the video and translates it so that the cropped
 * region fills the entire draw area (auto-fill behavior).
 *
 * @param cropData - Normalized crop region (0-1 coordinates)
 * @param drawWidth - Width of the video draw area in pixels
 * @param drawHeight - Height of the video draw area in pixels
 * @returns CropTransform with scale and translation values
 */
export function calculateCropTransform(
  cropData: CropEffectData | null | undefined,
  drawWidth: number,
  drawHeight: number
): CropTransform {
  // If no crop or full frame, return identity transform
  if (!cropData || isFullFrameCrop(cropData)) {
    return {
      scale: 1,
      translateX: 0,
      translateY: 0,
      isActive: false,
    };
  }

  // Ensure valid crop dimensions (prevent division by zero)
  const cropWidth = Math.max(0.01, Math.min(1, cropData.width));
  const cropHeight = Math.max(0.01, Math.min(1, cropData.height));
  const cropX = Math.max(0, Math.min(1 - cropWidth, cropData.x));
  const cropY = Math.max(0, Math.min(1 - cropHeight, cropData.y));

  // Calculate scale to fill canvas with cropped region
  // We use the larger scale factor to ensure the cropped area fills the canvas
  const scaleX = 1 / cropWidth;
  const scaleY = 1 / cropHeight;
  const scale = Math.max(scaleX, scaleY);

  // Calculate translation to position the cropped region at the canvas center
  // The crop region's center should align with the canvas center
  const cropCenterX = cropX + cropWidth / 2;
  const cropCenterY = cropY + cropHeight / 2;

  // Translation moves the crop center to the canvas center
  // Since scale is applied from the center (transformOrigin: 50% 50%),
  // we need to account for the scaled position
  const translateX = (0.5 - cropCenterX) * drawWidth * scale;
  const translateY = (0.5 - cropCenterY) * drawHeight * scale;

  return {
    scale,
    translateX,
    translateY,
    isActive: true,
  };
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
