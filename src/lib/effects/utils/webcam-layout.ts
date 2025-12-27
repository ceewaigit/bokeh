import type { WebcamEffectData } from '@/types/project'

export function getWebcamLayout(
  data: WebcamEffectData,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number; size: number } {
  const size = (data.size / 100) * containerWidth
  let x = (data.position.x / 100) * containerWidth
  let y = (data.position.y / 100) * containerHeight
  const padding = data.padding ?? 0

  switch (data.position.anchor) {
    case 'top-left':
      x += padding
      y += padding
      break
    case 'top-center':
      x -= size / 2
      y += padding
      break
    case 'top-right':
      x -= size + padding
      y += padding
      break
    case 'center-left':
      x += padding
      y -= size / 2
      break
    case 'center':
      x -= size / 2
      y -= size / 2
      break
    case 'center-right':
      x -= size + padding
      y -= size / 2
      break
    case 'bottom-left':
      x += padding
      y -= size + padding
      break
    case 'bottom-center':
      x -= size / 2
      y -= size + padding
      break
    case 'bottom-right':
      x -= size + padding
      y -= size + padding
      break
  }

  return { x, y, size }
}
