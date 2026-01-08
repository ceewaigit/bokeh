import { useCallback } from 'react';
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext';
import { applyCssTransformToPoint } from '@/features/rendering/canvas/math/transforms/transform-point';

export interface MappedPoint {
  /** X coordinate in composition pixels */
  x: number;
  /** Y coordinate in composition pixels */
  y: number;
  /** Whether the point is within the visible video area (0-1 range) */
  isVisible: boolean;
}

export interface MappingOptions {
  /** Whether to clamp the point to the [0, 1] range before mapping */
  clampToScreen?: boolean;
  /** Whether to apply composition transforms (Zoom/Pan/3D) */
  applyTransform?: boolean;
}

/**
 * Hook to map coordinates between different spaces.
 * 
 * DESIGN PRINCIPLE:
 * This is the SINGLE SOURCE OF TRUTH for mapping coordinates in the renderer.
 * Use this to convert normalized [0, 1] or percent [0, 100] coordinates
 * into composition pixels that perfectly align with the video element.
 */
export function useCoordinateMapping() {
  const videoPosition = useVideoPosition();

  const {
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
    mockupEnabled,
    mockupPosition,
    contentTransform,
  } = videoPosition;

  /**
   * Internal mapper that works with [0, 1] values.
   */
  const mapNormalized = useCallback((
    nx: number,
    ny: number,
    options: MappingOptions = {}
  ): MappedPoint => {
    const { clampToScreen = false, applyTransform = true } = options;

    // 1. Optional clamping
    const finalNx = clampToScreen ? Math.max(0, Math.min(1, nx)) : nx;
    const finalNy = clampToScreen ? Math.max(0, Math.min(1, ny)) : ny;

    // 2. Map to video content area
    // Offset calculation accounts for mockup shifts
    const screenOffsetX = mockupEnabled && mockupPosition ? mockupPosition.screenX : 0;
    const screenOffsetY = mockupEnabled && mockupPosition ? mockupPosition.screenY : 0;

    const baseOffsetX = mockupEnabled ? (offsetX - screenOffsetX) : offsetX;
    const baseOffsetY = mockupEnabled ? (offsetY - screenOffsetY) : offsetY;

    let px = baseOffsetX + (finalNx * drawWidth);
    let py = baseOffsetY + (finalNy * drawHeight);

    // 3. Apply composition transforms (Zoom/Pan/3D)
    if (applyTransform && contentTransform) {
      const originX = offsetX + drawWidth / 2;
      const originY = offsetY + drawHeight / 2;

      const transformed = applyCssTransformToPoint(
        px,
        py,
        originX,
        originY,
        contentTransform
      );
      px = transformed.x;
      py = transformed.y;
    }

    return {
      x: px,
      y: py,
      isVisible: finalNx >= 0 && finalNx <= 1 && finalNy >= 0 && finalNy <= 1
    };
  }, [offsetX, offsetY, drawWidth, drawHeight, mockupEnabled, mockupPosition, contentTransform]);

  /**
   * Map a normalized point {x: [0-1], y: [0-1]} to composition pixels.
   */
  const mapNormalizedPoint = useCallback((
    normalized: { x: number; y: number },
    options?: MappingOptions
  ) => mapNormalized(normalized.x, normalized.y, options), [mapNormalized]);

  /**
   * Map a percentage point {x: [0-100], y: [0-100]} to composition pixels.
   */
  const mapPercentPoint = useCallback((
    percent: { x: number; y: number },
    options?: MappingOptions
  ) => mapNormalized(percent.x / 100, percent.y / 100, options), [mapNormalized]);

  return {
    mapNormalizedPoint,
    mapPercentPoint,
    videoPosition
  };
}
