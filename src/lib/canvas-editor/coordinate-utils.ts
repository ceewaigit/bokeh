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
