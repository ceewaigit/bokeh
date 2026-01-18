import { applyCssTransformToPoint, applyInverseCssTransformToPoint } from '@/features/rendering/canvas/math/transforms/transform-point'
import type { FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'
import type { VideoRect } from '@/features/rendering/canvas/math/coordinates'

export type Point = { x: number; y: number }
export type { VideoRect }

export function getVideoRectFromSnapshot(snapshot: FrameSnapshot): VideoRect {
  if (snapshot.mockup.enabled && snapshot.mockup.position) {
    const { videoX, videoY, videoWidth, videoHeight } = snapshot.mockup.position
    return {
      x: videoX,
      y: videoY,
      width: videoWidth,
      height: videoHeight
    }
  }

  return {
    x: snapshot.layout.offsetX,
    y: snapshot.layout.offsetY,
    width: snapshot.layout.drawWidth,
    height: snapshot.layout.drawHeight
  }
}

/**
 * Visible video content rect (inside the stable frame).
 *
 * When the active clip aspect ratio differs from the project frame, the clip is rendered using
 * `object-fit: contain` (letterbox/pillarbox). In that case, the actual visible pixels occupy
 * a centered sub-rect of the frame.
 */
export function getVideoContentRectFromSnapshot(snapshot: FrameSnapshot): VideoRect {
  const frameRect = getVideoRectFromSnapshot(snapshot)

  // In mockup mode, selection/hit-testing should use the mockup screen rect from getVideoRectFromSnapshot.
  // (If the clip is letterboxed inside the screen, treat the screen as the interactive region.)
  if (snapshot.mockup.enabled) return frameRect

  const sourceWidth = snapshot.layout.activeSourceWidth
  const sourceHeight = snapshot.layout.activeSourceHeight
  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) return frameRect

  const scale = Math.min(frameRect.width / sourceWidth, frameRect.height / sourceHeight)
  if (!Number.isFinite(scale) || scale <= 0) return frameRect

  const contentWidth = sourceWidth * scale
  const contentHeight = sourceHeight * scale

  // If aspect matches, avoid tiny floating point offsets.
  if (Math.abs(contentWidth - frameRect.width) < 0.0001 && Math.abs(contentHeight - frameRect.height) < 0.0001) {
    return frameRect
  }

  return {
    x: frameRect.x + (frameRect.width - contentWidth) / 2,
    y: frameRect.y + (frameRect.height - contentHeight) / 2,
    width: contentWidth,
    height: contentHeight,
  }
}

/**
 * Map a point in preview container coordinates (0,0 at container top-left)
 * into untransformed video-local coordinates (0,0 at video rect top-left),
 * by inverting the renderer's combined transform around the video rect center.
 */
export function containerPointToVideoPoint(containerPoint: Point, snapshot: FrameSnapshot): Point {
  const videoRect = getVideoRectFromSnapshot(snapshot)

  const relativeX = containerPoint.x - videoRect.x
  const relativeY = containerPoint.y - videoRect.y

  const originX = videoRect.width / 2
  const originY = videoRect.height / 2

  const transform = snapshot.transforms?.combined ?? ''
  return applyInverseCssTransformToPoint(relativeX, relativeY, originX, originY, transform)
}

/**
 * Map an untransformed video-local point into preview container coordinates.
 */
export function videoPointToContainerPoint(videoPoint: Point, snapshot: FrameSnapshot): Point {
  const videoRect = getVideoRectFromSnapshot(snapshot)

  const originX = videoRect.width / 2
  const originY = videoRect.height / 2

  const transform = snapshot.transforms?.combined ?? ''
  const transformed = applyCssTransformToPoint(videoPoint.x, videoPoint.y, originX, originY, transform)

  return {
    x: transformed.x + videoRect.x,
    y: transformed.y + videoRect.y
  }
}

export function videoDeltaToPercentDelta(videoDelta: Point, snapshot: FrameSnapshot): Point {
  const videoRect = getVideoRectFromSnapshot(snapshot)

  return {
    x: (videoDelta.x / videoRect.width) * 100,
    y: (videoDelta.y / videoRect.height) * 100
  }
}

export function percentToVideoPoint(percentPoint: Point, snapshot: FrameSnapshot): Point {
  const videoRect = getVideoRectFromSnapshot(snapshot)

  return {
    x: (percentPoint.x / 100) * videoRect.width,
    y: (percentPoint.y / 100) * videoRect.height
  }
}
