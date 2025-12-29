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

export function getWebcamAnchorPoint(
  layout: { x: number; y: number; size: number },
  anchor: WebcamEffectData['position']['anchor']
): { x: number; y: number } {
  const { x, y, size } = layout;
  switch (anchor) {
    case 'top-left': return { x, y };
    case 'top-center': return { x: x + size / 2, y };
    case 'top-right': return { x: x + size, y };
    case 'center-left': return { x, y: y + size / 2 };
    case 'center': return { x: x + size / 2, y: y + size / 2 };
    case 'center-right': return { x: x + size, y: y + size / 2 };
    case 'bottom-left': return { x, y: y + size };
    case 'bottom-center': return { x: x + size / 2, y: y + size };
    case 'bottom-right': return { x: x + size, y: y + size };
    default: return { x: x + size / 2, y: y + size / 2 };
  }
}
