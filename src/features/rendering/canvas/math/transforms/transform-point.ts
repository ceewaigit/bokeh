export function applyCssTransformToPoint(
  x: number,
  y: number,
  originX: number,
  originY: number,
  transform: string
): { x: number; y: number } {
  const trimmed = transform.trim();
  if (!trimmed) return { x, y };

  if (typeof DOMMatrixReadOnly === 'undefined' || typeof DOMPoint === 'undefined') {
    return { x, y };
  }

  try {
    const matrix = new DOMMatrixReadOnly(trimmed);
    const toOrigin = new DOMMatrixReadOnly().translate(originX, originY, 0);
    const fromOrigin = new DOMMatrixReadOnly().translate(-originX, -originY, 0);
    const combined = toOrigin.multiply(matrix).multiply(fromOrigin);

    const p = new DOMPoint(x, y, 0, 1).matrixTransform(combined);
    if (p.w && p.w !== 1) {
      return { x: p.x / p.w, y: p.y / p.w };
    }
    return { x: p.x, y: p.y };
  } catch {
    return { x, y };
  }
}

export function applyInverseCssTransformToPoint(
  x: number,
  y: number,
  originX: number,
  originY: number,
  transform: string
): { x: number; y: number } {
  const trimmed = transform.trim();
  if (!trimmed) return { x, y };

  if (typeof DOMMatrixReadOnly === 'undefined' || typeof DOMPoint === 'undefined') {
    return { x, y };
  }

  try {
    const matrix = new DOMMatrixReadOnly(trimmed);
    // Note: Some transforms serialize to a long-but-noop string, e.g.
    // `translate3d(0px, 0px, 0) scale3d(1, 1, 1)`. These are effectively identity and
    // should not spam logs or trigger slow-path debugging during high-frequency pointer moves.

    const toOrigin = new DOMMatrixReadOnly().translate(originX, originY, 0);
    const fromOrigin = new DOMMatrixReadOnly().translate(-originX, -originY, 0);
    // Forward matrix: translate(origin) * matrix * translate(-origin)
    const combined = toOrigin.multiply(matrix).multiply(fromOrigin);

    const inverse = combined.inverse();

    const p = new DOMPoint(x, y, 0, 1).matrixTransform(inverse);
    if (p.w && p.w !== 1) {
      return { x: p.x / p.w, y: p.y / p.w };
    }
    return { x: p.x, y: p.y };
  } catch {
    return { x, y };
  }
}
