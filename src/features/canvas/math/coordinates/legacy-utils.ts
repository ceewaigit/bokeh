/**
 * Coordinate utilities for canvas overlay editor
 *
 * All positions use normalized 0-100% coordinates relative to the video canvas.
 * This matches the existing PluginEffectData.position system.
 */

export interface PositionData {
  x: number      // 0-100% from left (center anchor)
  y: number      // 0-100% from top (center anchor)
  width?: number // Optional width in pixels or percent
  height?: number // Optional height in pixels or percent
}

export interface VideoRect {
  x: number      // Canvas offset X (pixels)
  y: number      // Canvas offset Y (pixels)
  width: number  // Video draw width (pixels)
  height: number // Video draw height (pixels)
}

/**
 * Camera transform for zoom/pan effects
 */
export interface CameraTransform {
  scale: number
  panX: number
  panY: number
}

/**
 * Apply camera transform to a percent position to get screen position.
 * The camera transform is applied around the video rect center.
 */
export function applyCameraTransformToPoint(
  percentX: number,
  percentY: number,
  videoRect: VideoRect,
  cameraTransform: CameraTransform
): { x: number; y: number } {
  // 1. Convert percent to untransformed pixels
  const rawX = videoRect.x + (percentX / 100) * videoRect.width
  const rawY = videoRect.y + (percentY / 100) * videoRect.height

  // 2. Apply camera transform (scale from center, then pan)
  const centerX = videoRect.x + videoRect.width / 2
  const centerY = videoRect.y + videoRect.height / 2

  return {
    x: centerX + (rawX - centerX) * cameraTransform.scale + cameraTransform.panX,
    y: centerY + (rawY - centerY) * cameraTransform.scale + cameraTransform.panY
  }
}

/**
 * Inverse camera transform - converts screen coordinates back to source coordinates.
 * Used for hit-testing: convert mouse position to annotation-space coordinates.
 */
export function inverseCameraTransformPoint(
  screenX: number,
  screenY: number,
  videoRect: VideoRect,
  cameraTransform: CameraTransform
): { x: number; y: number } {
  const centerX = videoRect.x + videoRect.width / 2
  const centerY = videoRect.y + videoRect.height / 2

  // Reverse: subtract pan, then inverse scale
  const unscaledX = (screenX - cameraTransform.panX - centerX) / cameraTransform.scale + centerX
  const unscaledY = (screenY - cameraTransform.panY - centerY) / cameraTransform.scale + centerY

  return { x: unscaledX, y: unscaledY }
}

/**
 * Convert percent position (0-100) to canvas pixel coordinates
 * The position uses center anchor (element is centered at x,y)
 */
export function percentToPixels(
  percentX: number,
  percentY: number,
  videoRect: VideoRect
): { x: number; y: number } {
  return {
    x: videoRect.x + (percentX / 100) * videoRect.width,
    y: videoRect.y + (percentY / 100) * videoRect.height,
  }
}

/**
 * Convert canvas pixel coordinates to percent position (0-100)
 */
export function pixelsToPercent(
  pixelX: number,
  pixelY: number,
  videoRect: VideoRect
): { x: number; y: number } {
  return {
    x: ((pixelX - videoRect.x) / videoRect.width) * 100,
    y: ((pixelY - videoRect.y) / videoRect.height) * 100,
  }
}

/**
 * Convert a pixel delta to percent delta
 */
export function deltaToPercent(
  deltaX: number,
  deltaY: number,
  videoRect: VideoRect
): { x: number; y: number } {
  return {
    x: (deltaX / videoRect.width) * 100,
    y: (deltaY / videoRect.height) * 100,
  }
}

/**
 * Clamp position to valid range (0-100 for x/y)
 */
export function clampPosition(position: PositionData): PositionData {
  return {
    x: Math.max(0, Math.min(100, position.x)),
    y: Math.max(0, Math.min(100, position.y)),
    width: position.width,
    height: position.height,
  }
}

/**
 * Check if a point (in canvas pixels) is within a rect
 */
export function isPointInRect(
  pointX: number,
  pointY: number,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    pointX >= rect.x &&
    pointX <= rect.x + rect.width &&
    pointY >= rect.y &&
    pointY <= rect.y + rect.height
  )
}

/**
 * Check if a point is inside a rotated rectangle.
 * Uses inverse rotation to transform the point into the rectangle's local space.
 *
 * @param pointX - Point X in canvas pixels
 * @param pointY - Point Y in canvas pixels
 * @param rect - Rectangle bounds (x, y are top-left corner)
 * @param rotationDeg - Rotation in degrees (clockwise positive)
 * @param anchorX - Rotation anchor X (defaults to rect center)
 * @param anchorY - Rotation anchor Y (defaults to rect center)
 */
export function isPointInRotatedRect(
  pointX: number,
  pointY: number,
  rect: { x: number; y: number; width: number; height: number },
  rotationDeg: number,
  anchorX?: number,
  anchorY?: number
): boolean {
  // No rotation - use simple AABB test
  if (rotationDeg === 0 || Math.abs(rotationDeg) < 0.01) {
    return isPointInRect(pointX, pointY, rect)
  }

  // Default anchor to rect center
  const ax = anchorX ?? (rect.x + rect.width / 2)
  const ay = anchorY ?? (rect.y + rect.height / 2)

  // Rotate point inversely around anchor to get local coordinates
  const rad = -rotationDeg * (Math.PI / 180)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  const dx = pointX - ax
  const dy = pointY - ay

  const localX = cos * dx - sin * dy + ax
  const localY = sin * dx + cos * dy + ay

  // Test against unrotated rect
  return isPointInRect(localX, localY, rect)
}

/**
 * Rotate a point around an anchor by given degrees
 */
export function rotatePointAroundAnchor(
  pointX: number,
  pointY: number,
  anchorX: number,
  anchorY: number,
  rotationDeg: number
): { x: number; y: number } {
  if (rotationDeg === 0 || Math.abs(rotationDeg) < 0.01) {
    return { x: pointX, y: pointY }
  }

  const rad = rotationDeg * (Math.PI / 180)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  const dx = pointX - anchorX
  const dy = pointY - anchorY

  return {
    x: cos * dx - sin * dy + anchorX,
    y: sin * dx + cos * dy + anchorY,
  }
}

/**
 * Get element bounds in canvas pixels from percent position
 * Assumes center anchor positioning (element centered at x,y)
 */
export function getElementBounds(
  position: PositionData,
  elementWidth: number,
  elementHeight: number,
  videoRect: VideoRect
): { x: number; y: number; width: number; height: number } {
  const center = percentToPixels(position.x, position.y, videoRect)
  return {
    x: center.x - elementWidth / 2,
    y: center.y - elementHeight / 2,
    width: elementWidth,
    height: elementHeight,
  }
}

/**
 * Apply nudge offset to position (for arrow key movement)
 * @param nudgePercent - Amount to nudge (e.g., 1 for 1%, 10 for Shift+Arrow)
 */
export function nudgePosition(
  position: PositionData,
  direction: 'up' | 'down' | 'left' | 'right',
  nudgePercent: number = 1
): PositionData {
  const newPosition = { ...position }

  switch (direction) {
    case 'up':
      newPosition.y -= nudgePercent
      break
    case 'down':
      newPosition.y += nudgePercent
      break
    case 'left':
      newPosition.x -= nudgePercent
      break
    case 'right':
      newPosition.x += nudgePercent
      break
  }

  return clampPosition(newPosition)
}

const MIN_HIGHLIGHT_SIZE = 4

export const clampPercent = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

export const clampPoint = (point: { x: number; y: number }, min = 0, max = 100) => ({
  x: clampPercent(point.x, min, max),
  y: clampPercent(point.y, min, max),
})

export const clampHighlightBox = (
  position: { x: number; y: number },
  width: number,
  height: number
) => {
  const maxX = 100 - MIN_HIGHLIGHT_SIZE
  const maxY = 100 - MIN_HIGHLIGHT_SIZE
  const clampedPosition = {
    x: clampPercent(position.x, 0, maxX),
    y: clampPercent(position.y, 0, maxY),
  }
  const clampedWidth = Math.max(MIN_HIGHLIGHT_SIZE, Math.min(width, 100 - clampedPosition.x))
  const clampedHeight = Math.max(MIN_HIGHLIGHT_SIZE, Math.min(height, 100 - clampedPosition.y))
  return {
    x: clampedPosition.x,
    y: clampedPosition.y,
    width: clampedWidth,
    height: clampedHeight,
  }
}
