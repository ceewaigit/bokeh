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
