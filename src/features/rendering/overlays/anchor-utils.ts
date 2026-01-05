import type { CSSProperties } from 'react'
import type { BaseOverlayConfig, OverlayAnchor } from '@/types/overlays'

export function getOverlayAnchorPosition(
  anchor: OverlayAnchor,
  containerWidth: number,
  containerHeight: number,
  margin = 0
): { x: number; y: number } {
  switch (anchor) {
    case 'top-left':
      return { x: margin, y: margin }
    case 'top-center':
      return { x: containerWidth / 2, y: margin }
    case 'top-right':
      return { x: containerWidth - margin, y: margin }
    case 'center-left':
      return { x: margin, y: containerHeight / 2 }
    case 'center':
      return { x: containerWidth / 2, y: containerHeight / 2 }
    case 'center-right':
      return { x: containerWidth - margin, y: containerHeight / 2 }
    case 'bottom-left':
      return { x: margin, y: containerHeight - margin }
    case 'bottom-center':
      return { x: containerWidth / 2, y: containerHeight - margin }
    case 'bottom-right':
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
    case 'top-left':
      return { top: margin, left: margin, transform: `translate(0, 0)${offsetTransform}` }
    case 'top-center':
      return { top: margin, left: '50%', transform: `translate(-50%, 0)${offsetTransform}` }
    case 'top-right':
      return { top: margin, right: margin, transform: `translate(0, 0)${offsetTransform}` }
    case 'center-left':
      return { top: '50%', left: margin, transform: `translate(0, -50%)${offsetTransform}` }
    case 'center':
      return { top: '50%', left: '50%', transform: `translate(-50%, -50%)${offsetTransform}` }
    case 'center-right':
      return { top: '50%', right: margin, transform: `translate(0, -50%)${offsetTransform}` }
    case 'bottom-left':
      return { bottom: margin, left: margin, transform: `translate(0, 0)${offsetTransform}` }
    case 'bottom-center':
      return { bottom: margin, left: '50%', transform: `translate(-50%, 0)${offsetTransform}` }
    case 'bottom-right':
      return { bottom: margin, right: margin, transform: `translate(0, 0)${offsetTransform}` }
    default:
      return { bottom: margin, left: '50%', transform: `translate(-50%, 0)${offsetTransform}` }
  }
}
