import type { WebcamLayoutData } from '@/types/project'

export function getWebcamLayout(
  data: WebcamLayoutData,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number; size: number } {
  const size = (data.size / 100) * containerWidth
  const padding = data.padding ?? 0
  
  let x = (data.position.x / 100) * containerWidth
  let y = (data.position.y / 100) * containerHeight
  const anchor = data.position.anchor

  if (anchor.includes('left')) {
    x += padding
  } else if (anchor.includes('right')) {
    x -= size + padding
  } else {
    x -= size / 2
  }

  if (anchor.includes('top')) {
    y += padding
  } else if (anchor.includes('bottom')) {
    y -= size + padding
  } else {
    y -= size / 2
  }

  return { x, y, size }
}

export function getWebcamAnchorPoint(
  layout: { x: number; y: number; size: number },
  anchor: WebcamLayoutData['position']['anchor']
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
