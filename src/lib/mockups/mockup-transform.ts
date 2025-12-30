/**
 * Mockup position and transform calculations.
 *
 * Calculates the positioning of device mockups and video content
 * within the canvas, handling aspect ratio fitting and video fit modes.
 */

import type { DeviceMockupData } from '@/types/project'
import { DeviceModel } from '@/types/project'
import { resolveMockupMetadata } from '@/lib/mockups/mockup-metadata'
import { DEVICE_MOCKUPS } from '@/lib/constants/device-mockups'

/**
 * Result of mockup position calculations.
 * All positions are in canvas coordinate space.
 */
export interface MockupPositionResult {
  // Mockup frame position and size (relative to canvas)
  mockupX: number
  mockupY: number
  mockupWidth: number
  mockupHeight: number

  // Screen region within the mockup (where video is placed)
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  screenCornerRadius: number

  // Video position within the screen region
  videoX: number
  videoY: number
  videoWidth: number
  videoHeight: number

  // Scale factor applied to the mockup
  mockupScale: number
}

/**
 * Calculate the position of a device mockup and video within the canvas.
 *
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param mockupData - Device mockup configuration
 * @param sourceVideoWidth - Original video width
 * @param sourceVideoHeight - Original video height
 * @param padding - Padding around the mockup
 * @returns Position calculations for mockup and video
 */
export function calculateMockupPosition(
  canvasWidth: number,
  canvasHeight: number,
  mockupData: DeviceMockupData,
  sourceVideoWidth: number,
  sourceVideoHeight: number,
  padding: number = 60
): MockupPositionResult | null {
  // Get mockup metadata
  const metadata = resolveMockupMetadata(mockupData)
  if (!metadata) {
    return null
  }

  // Available space after padding
  const availableWidth = canvasWidth - padding * 2
  const availableHeight = canvasHeight - padding * 2

  // Calculate scale to fit mockup within available space
  const mockupAspect = metadata.dimensions.width / metadata.dimensions.height
  const availableAspect = availableWidth / availableHeight

  let mockupScale: number
  if (mockupAspect > availableAspect) {
    // Mockup is wider than available space - fit to width
    mockupScale = availableWidth / metadata.dimensions.width
  } else {
    // Mockup is taller than available space - fit to height
    mockupScale = availableHeight / metadata.dimensions.height
  }

  // Calculate scaled mockup dimensions
  const rawMockupWidth = metadata.dimensions.width * mockupScale
  const rawMockupHeight = metadata.dimensions.height * mockupScale

  // Center mockup in canvas
  const rawMockupX = (canvasWidth - rawMockupWidth) / 2
  const rawMockupY = (canvasHeight - rawMockupHeight) / 2

  const mockupWidth = Math.round(rawMockupWidth)
  const mockupHeight = Math.round(rawMockupHeight)
  const mockupX = Math.round(rawMockupX)
  const mockupY = Math.round(rawMockupY)

  // Calculate screen region (scaled) with consistent edge rounding.
  const screenLeft = mockupX + Math.round(metadata.screenRegion.x * mockupScale)
  const screenTop = mockupY + Math.round(metadata.screenRegion.y * mockupScale)
  const screenRight = mockupX + Math.round((metadata.screenRegion.x + metadata.screenRegion.width) * mockupScale)
  const screenBottom = mockupY + Math.round((metadata.screenRegion.y + metadata.screenRegion.height) * mockupScale)
  const screenX = screenLeft
  const screenY = screenTop
  const screenWidth = Math.max(0, screenRight - screenLeft)
  const screenHeight = Math.max(0, screenBottom - screenTop)
  const screenCornerRadius = Math.round(metadata.screenRegion.cornerRadius * mockupScale)

  // Calculate video position within screen based on fit mode
  const videoPosition = calculateVideoFit(
    screenWidth,
    screenHeight,
    sourceVideoWidth,
    sourceVideoHeight
  )

  return {
    mockupX,
    mockupY,
    mockupWidth,
    mockupHeight,
    screenX,
    screenY,
    screenWidth,
    screenHeight,
    screenCornerRadius,
    videoX: screenX + Math.round(videoPosition.x),
    videoY: screenY + Math.round(videoPosition.y),
    videoWidth: Math.round(videoPosition.width),
    videoHeight: Math.round(videoPosition.height),
    mockupScale
  }
}

/**
 * Calculate how the video fits within the screen region.
 */
function calculateVideoFit(
  screenWidth: number,
  screenHeight: number,
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number; width: number; height: number } {
  const screenAspect = screenWidth / screenHeight
  const videoAspect = videoWidth / videoHeight

  // Default to fill to avoid letterbox/pillarbox inside mockups.
  let width: number
  let height: number
  if (videoAspect > screenAspect) {
    // Video is wider - fit to height, crop width
    height = screenHeight
    width = screenHeight * videoAspect
  } else {
    // Video is taller - fit to width, crop height
    width = screenWidth
    height = screenWidth / videoAspect
  }
  return {
    x: (screenWidth - width) / 2,
    y: (screenHeight - height) / 2,
    width,
    height
  }
}

/**
 * Calculate the position of video without mockup (direct aspect ratio fitting).
 *
 * @param canvasWidth - Canvas width
 * @param canvasHeight - Canvas height
 * @param videoWidth - Source video width
 * @param videoHeight - Source video height
 * @param padding - Padding around the video
 * @returns Video position in canvas coordinates
 */
export function calculateVideoPosition(
  canvasWidth: number,
  canvasHeight: number,
  videoWidth: number,
  videoHeight: number,
  padding: number = 60
): { x: number; y: number; width: number; height: number } {
  const availableWidth = canvasWidth - padding * 2
  const availableHeight = canvasHeight - padding * 2

  const videoAspect = videoWidth / videoHeight
  const availableAspect = availableWidth / availableHeight

  let drawWidth: number
  let drawHeight: number

  if (videoAspect > availableAspect) {
    // Video is wider - fit to width
    drawWidth = availableWidth
    drawHeight = availableWidth / videoAspect
  } else {
    // Video is taller - fit to height
    drawHeight = availableHeight
    drawWidth = availableHeight * videoAspect
  }

  const x = (canvasWidth - drawWidth) / 2
  const y = (canvasHeight - drawHeight) / 2

  return { x, y, width: drawWidth, height: drawHeight }
}

/**
 * Convert a position from video coordinates to canvas coordinates.
 * Used for positioning cursor and other overlays correctly when mockup is enabled.
 *
 * @param videoX - X position in video coordinates (0 to videoWidth)
 * @param videoY - Y position in video coordinates (0 to videoHeight)
 * @param mockupPosition - Current mockup position result
 * @param videoWidth - Original video width
 * @param videoHeight - Original video height
 * @returns Position in canvas coordinates
 */
export function videoToCanvasCoordinates(
  videoX: number,
  videoY: number,
  mockupPosition: MockupPositionResult,
  videoWidth: number,
  videoHeight: number
): { x: number; y: number } {
  // Normalize to 0-1 range
  const normalizedX = videoX / videoWidth
  const normalizedY = videoY / videoHeight

  // Map to canvas coordinates within the video area
  const canvasX = mockupPosition.videoX + normalizedX * mockupPosition.videoWidth
  const canvasY = mockupPosition.videoY + normalizedY * mockupPosition.videoHeight

  return { x: canvasX, y: canvasY }
}

/**
 * Convert canvas coordinates back to video coordinates.
 *
 * @param canvasX - X position in canvas coordinates
 * @param canvasY - Y position in canvas coordinates
 * @param mockupPosition - Current mockup position result
 * @param videoWidth - Original video width
 * @param videoHeight - Original video height
 * @returns Position in video coordinates
 */
export function canvasToVideoCoordinates(
  canvasX: number,
  canvasY: number,
  mockupPosition: MockupPositionResult,
  videoWidth: number,
  videoHeight: number
): { x: number; y: number } {
  // Normalize to 0-1 within the video area
  const normalizedX = (canvasX - mockupPosition.videoX) / mockupPosition.videoWidth
  const normalizedY = (canvasY - mockupPosition.videoY) / mockupPosition.videoHeight

  // Map to video coordinates
  const videoX = normalizedX * videoWidth
  const videoY = normalizedY * videoHeight

  return { x: videoX, y: videoY }
}

/**
 * Get the mockup SVG path for a device model.
 */
export function getMockupSvgPath(model: DeviceModel): string | undefined {
  return DEVICE_MOCKUPS[model]?.svgPath
}

/**
 * Check if a point is within the mockup screen region.
 */
export function isPointInScreen(
  x: number,
  y: number,
  mockupPosition: MockupPositionResult
): boolean {
  return (
    x >= mockupPosition.screenX &&
    x <= mockupPosition.screenX + mockupPosition.screenWidth &&
    y >= mockupPosition.screenY &&
    y <= mockupPosition.screenY + mockupPosition.screenHeight
  )
}
