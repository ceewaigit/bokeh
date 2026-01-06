import type { CSSProperties } from 'react'
import { OverlayAnchor, type BaseOverlayConfig } from '@/types/overlays'

export function getOverlayAnchorPosition(
  anchor: OverlayAnchor,
  containerWidth: number,
  containerHeight: number,
  margin = 0
): { x: number; y: number } {
  switch (anchor) {
    case OverlayAnchor.TopLeft:
      return { x: margin, y: margin }
    case OverlayAnchor.TopCenter:
      return { x: containerWidth / 2, y: margin }
    case OverlayAnchor.TopRight:
      return { x: containerWidth - margin, y: margin }
    case OverlayAnchor.CenterLeft:
      return { x: margin, y: containerHeight / 2 }
    case OverlayAnchor.Center:
      return { x: containerWidth / 2, y: containerHeight / 2 }
    case OverlayAnchor.CenterRight:
      return { x: containerWidth - margin, y: containerHeight / 2 }
    case OverlayAnchor.BottomLeft:
      return { x: margin, y: containerHeight - margin }
    case OverlayAnchor.BottomCenter:
      return { x: containerWidth / 2, y: containerHeight - margin }
    case OverlayAnchor.BottomRight:
      return { x: containerWidth - margin, y: containerHeight - margin }
    default:
      return { x: containerWidth / 2, y: containerHeight - margin }
  }
}

export function getOverlayAnchorStyle(
  anchor: OverlayAnchor,
  config?: Partial<BaseOverlayConfig>,
  margin = 0
): CSSProperties {
  const offsetX = config?.offsetX ?? 0
  const offsetY = config?.offsetY ?? 0
  const offsetTransform = (offsetX || offsetY)
    ? ` translate(${offsetX}px, ${offsetY}px)`
    : ''

  switch (anchor) {
    case OverlayAnchor.TopLeft:
      return { top: margin, left: margin, transform: `translate(0, 0)${offsetTransform}` }
    case OverlayAnchor.TopCenter:
      return { top: margin, left: '50%', transform: `translate(-50%, 0)${offsetTransform}` }
    case OverlayAnchor.TopRight:
      return { top: margin, right: margin, transform: `translate(0, 0)${offsetTransform}` }
    case OverlayAnchor.CenterLeft:
      return { top: '50%', left: margin, transform: `translate(0, -50%)${offsetTransform}` }
    case OverlayAnchor.Center:
      return { top: '50%', left: '50%', transform: `translate(-50%, -50%)${offsetTransform}` }
    case OverlayAnchor.CenterRight:
      return { top: '50%', right: margin, transform: `translate(0, -50%)${offsetTransform}` }
    case OverlayAnchor.BottomLeft:
      return { bottom: margin, left: margin, transform: `translate(0, 0)${offsetTransform}` }
    case OverlayAnchor.BottomCenter:
      return { bottom: margin, left: '50%', transform: `translate(-50%, 0)${offsetTransform}` }
    case OverlayAnchor.BottomRight:
      return { bottom: margin, right: margin, transform: `translate(0, 0)${offsetTransform}` }
    default:
      return { bottom: margin, left: '50%', transform: `translate(-50%, 0)${offsetTransform}` }
  }
}
