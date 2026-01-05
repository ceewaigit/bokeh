export enum OverlayAnchor {
  TopLeft = 'top-left',
  TopCenter = 'top-center',
  TopRight = 'top-right',
  CenterLeft = 'center-left',
  Center = 'center',
  CenterRight = 'center-right',
  BottomLeft = 'bottom-left',
  BottomCenter = 'bottom-center',
  BottomRight = 'bottom-right',
}

export interface BaseOverlayConfig {
  anchor: OverlayAnchor
  offsetX?: number
  offsetY?: number
  zIndex?: number
  priority?: number
}
