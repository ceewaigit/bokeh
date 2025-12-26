import { calculateVideoPosition } from '@/remotion/compositions/utils/layout/video-position'
import { calculateMockupPosition } from '@/lib/mockups/mockup-transform'
import { getActiveBackgroundEffect } from '@/lib/effects/effect-filters'
import type { BackgroundEffect, Effect, Recording } from '@/types/project'

type CameraVideoArea = {
  drawWidth: number
  drawHeight: number
  offsetX: number
  offsetY: number
}

function getCameraOutputParams(args: {
  canvasWidth: number
  canvasHeight: number
  videoArea: CameraVideoArea
  mockupPosition: ReturnType<typeof calculateMockupPosition> | null
}): { outputWidth: number; outputHeight: number; overscan?: { left: number; right: number; top: number; bottom: number } } {
  const { canvasWidth, canvasHeight, videoArea, mockupPosition } = args
  const outputWidth = mockupPosition?.screenWidth ?? canvasWidth
  const outputHeight = mockupPosition?.screenHeight ?? canvasHeight
  const outputOffsetX = mockupPosition?.screenX ?? 0
  const outputOffsetY = mockupPosition?.screenY ?? 0

  if (
    outputWidth <= 0 ||
    outputHeight <= 0 ||
    videoArea.drawWidth <= 0 ||
    videoArea.drawHeight <= 0
  ) {
    return { outputWidth, outputHeight }
  }

  const relativeOffsetX = videoArea.offsetX - outputOffsetX
  const relativeOffsetY = videoArea.offsetY - outputOffsetY
  const leftPx = relativeOffsetX
  const rightPx = outputWidth - relativeOffsetX - videoArea.drawWidth
  const topPx = relativeOffsetY
  const bottomPx = outputHeight - relativeOffsetY - videoArea.drawHeight

  return {
    outputWidth,
    outputHeight,
    overscan: {
      left: Math.max(0, leftPx / videoArea.drawWidth),
      right: Math.max(0, rightPx / videoArea.drawWidth),
      top: Math.max(0, topPx / videoArea.drawHeight),
      bottom: Math.max(0, bottomPx / videoArea.drawHeight),
    },
  }
}

export function getCameraOutputContext(args: {
  clipEffects: Effect[]
  timelineMs: number
  compositionWidth: number
  compositionHeight: number
  recording: Recording | null | undefined
  sourceVideoWidth?: number
  sourceVideoHeight?: number
}): {
  outputWidth: number
  outputHeight: number
  overscan?: { left: number; right: number; top: number; bottom: number }
  mockupScreenPosition?: { x: number; y: number; width: number; height: number }
  forceFollowCursor: boolean
} {
  const {
    clipEffects,
    timelineMs,
    compositionWidth,
    compositionHeight,
    recording,
    sourceVideoWidth,
    sourceVideoHeight,
  } = args

  const backgroundEffect = getActiveBackgroundEffect(clipEffects, timelineMs) as BackgroundEffect | undefined
  const backgroundData = backgroundEffect?.data ?? null
  const padding = backgroundData?.padding || 0

  const activeSourceWidth = recording?.width || sourceVideoWidth || compositionWidth
  const activeSourceHeight = recording?.height || sourceVideoHeight || compositionHeight

  const mockupData = backgroundData?.mockup
  const mockupEnabled = mockupData?.enabled ?? false
  const mockupPosition = mockupEnabled && mockupData
    ? calculateMockupPosition(
      compositionWidth,
      compositionHeight,
      mockupData,
      activeSourceWidth,
      activeSourceHeight,
      padding
    )
    : null

  const videoArea: CameraVideoArea = mockupEnabled && mockupPosition
    ? {
      drawWidth: mockupPosition.videoWidth,
      drawHeight: mockupPosition.videoHeight,
      offsetX: mockupPosition.videoX,
      offsetY: mockupPosition.videoY,
    }
    : (() => {
      const position = calculateVideoPosition(
        compositionWidth,
        compositionHeight,
        activeSourceWidth,
        activeSourceHeight,
        padding
      )
      return {
        drawWidth: position.drawWidth,
        drawHeight: position.drawHeight,
        offsetX: position.offsetX,
        offsetY: position.offsetY,
      }
    })()

  const { outputWidth, outputHeight, overscan } = getCameraOutputParams({
    canvasWidth: compositionWidth,
    canvasHeight: compositionHeight,
    videoArea,
    mockupPosition,
  })

  const mockupScreenPosition = mockupEnabled && mockupPosition
    ? { x: 0, y: 0, width: outputWidth, height: outputHeight }
    : undefined

  return {
    outputWidth,
    outputHeight,
    overscan,
    mockupScreenPosition,
    forceFollowCursor: Boolean(mockupEnabled && mockupPosition),
  }
}
