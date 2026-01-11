export type ContinuousCornerOptions = {
  ratio?: number
  min?: number
  max?: number
}

export function getContinuousCornerRadius(
  heightPx: number,
  { ratio = 0.32, min = 6, max = 14 }: ContinuousCornerOptions = {}
): number {
  const safeHeight = Math.max(0, heightPx)
  const radius = Math.round(safeHeight * ratio)
  return Math.max(min, Math.min(max, radius))
}

// 100% smooth corner approximation using three cubic Béziers (Apple-style "continuous" corners)
const SQUIRCLE_BEZIER_DATA: ReadonlyArray<
  Readonly<[Readonly<[number, number]>, Readonly<[number, number]>, Readonly<[number, number]>]>
> = [
  [[0.3, 0], [0.473, 0], [0.619, 0.039]],
  [[0.804, 0.088], [0.912, 0.196], [0.961, 0.381]],
  [[1, 0.527], [1, 0.7], [1, 1]],
]

type SquircleCorner = 'topRight' | 'bottomRight' | 'bottomLeft' | 'topLeft'

function rotateNormalizedPoint(
  [x, y]: Readonly<[number, number]>,
  corner: SquircleCorner
): [number, number] {
  // Base bezier data defines a corner from the top edge to the right edge (top-right).
  // Each corner below maps the normalized points so the curve ends on the correct edge.
  switch (corner) {
    case 'topRight':
      return [x, y]
    case 'bottomRight':
      return [-y, x]
    case 'bottomLeft':
      return [-x, -y]
    case 'topLeft':
      return [y, -x]
    default:
      return [x, y]
  }
}

function drawSquircleCorner(ctx: CanvasRenderingContext2D, startX: number, startY: number, radius: number, corner: SquircleCorner): void {
  if (radius <= 0) return
  for (const [cp1, cp2, end] of SQUIRCLE_BEZIER_DATA) {
    const [x1, y1] = rotateNormalizedPoint(cp1, corner)
    const [x2, y2] = rotateNormalizedPoint(cp2, corner)
    const [x3, y3] = rotateNormalizedPoint(end, corner)
    ctx.bezierCurveTo(
      startX + x1 * radius,
      startY + y1 * radius,
      startX + x2 * radius,
      startY + y2 * radius,
      startX + x3 * radius,
      startY + y3 * radius
    )
  }
}

export function drawSquircleRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius:
    | number
    | {
        topLeft?: number
        topRight?: number
        bottomRight?: number
        bottomLeft?: number
      }
): void {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  if (w === 0 || h === 0) return

  const raw = typeof cornerRadius === 'number' ? { topLeft: cornerRadius, topRight: cornerRadius, bottomRight: cornerRadius, bottomLeft: cornerRadius } : cornerRadius
  const topLeft = Math.max(0, Math.min(raw.topLeft ?? 0, w / 2, h / 2))
  const topRight = Math.max(0, Math.min(raw.topRight ?? 0, w / 2, h / 2))
  const bottomRight = Math.max(0, Math.min(raw.bottomRight ?? 0, w / 2, h / 2))
  const bottomLeft = Math.max(0, Math.min(raw.bottomLeft ?? 0, w / 2, h / 2))

  if (topLeft === 0 && topRight === 0 && bottomRight === 0 && bottomLeft === 0) {
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.closePath()
    return
  }

  // Start at top-right corner start and go clockwise (matches edge expectations).
  ctx.beginPath()

  // Top-right corner
  ctx.moveTo(x + w - topRight, y)
  if (topRight > 0) drawSquircleCorner(ctx, x + w - topRight, y, topRight, 'topRight')
  else ctx.lineTo(x + w, y)

  // Bottom-right corner
  ctx.lineTo(x + w, y + h - bottomRight)
  if (bottomRight > 0) drawSquircleCorner(ctx, x + w, y + h - bottomRight, bottomRight, 'bottomRight')
  else ctx.lineTo(x + w, y + h)

  // Bottom-left corner
  ctx.lineTo(x + bottomLeft, y + h)
  if (bottomLeft > 0) drawSquircleCorner(ctx, x + bottomLeft, y + h, bottomLeft, 'bottomLeft')
  else ctx.lineTo(x, y + h)

  // Top-left corner
  ctx.lineTo(x, y + topLeft)
  if (topLeft > 0) drawSquircleCorner(ctx, x, y + topLeft, topLeft, 'topLeft')
  else ctx.lineTo(x, y)

  ctx.closePath()
}
