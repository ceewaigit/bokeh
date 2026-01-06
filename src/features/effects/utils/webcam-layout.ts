import type { WebcamLayoutData } from '@/types/project'
import { OverlayAnchor } from '@/types/overlays'

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
    case OverlayAnchor.TopLeft: return { x, y };
    case OverlayAnchor.TopCenter: return { x: x + size / 2, y };
    case OverlayAnchor.TopRight: return { x: x + size, y };
    case OverlayAnchor.CenterLeft: return { x, y: y + size / 2 };
    case OverlayAnchor.Center: return { x: x + size / 2, y: y + size / 2 };
    case OverlayAnchor.CenterRight: return { x: x + size, y: y + size / 2 };
    case OverlayAnchor.BottomLeft: return { x, y: y + size };
    case OverlayAnchor.BottomCenter: return { x: x + size / 2, y: y + size };
    case OverlayAnchor.BottomRight: return { x: x + size, y: y + size };
    default: return { x: x + size / 2, y: y + size / 2 };
  }
}
