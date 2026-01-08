import { DEFAULT_CROP_DATA } from '@/features/rendering/canvas/math/transforms/crop-transform'
import type { WebcamLayoutData, WebcamShape, WebcamAnchor } from './types'
import { OverlayAnchor } from '@/types/overlays'

// Default webcam effect data - Apple-quality PiP styling
export const DEFAULT_WEBCAM_DATA: WebcamLayoutData = {
    // Position anchored to bottom-left, padding controls edge distance
    position: {
        x: 0,
        y: 100,
        anchor: OverlayAnchor.BottomLeft as any
    },
    size: 18, // 18% of canvas width - compact but visible
    padding: 12, // Edge padding in pixels

    // Rounded rectangle shape for clean, modern look
    shape: 'rounded-rect',
    cornerRadius: 16, // Default radius for rounded-rect

    // No border by default for cleaner appearance
    borderEnabled: false,
    borderWidth: 3,
    borderColor: '#ffffff',

    // Soft shadow for depth
    shadowEnabled: true,
    shadowColor: 'rgba(0, 0, 0, 0.25)',
    shadowBlur: 24,
    shadowOffsetX: 0,
    shadowOffsetY: 8,

    // No background blur by default
    backgroundBlur: false,
    backgroundBlurAmount: 10,

    // No animations by default - cleaner experience
    animations: {
        entry: {
            type: 'none',
            durationMs: 0
        },
        exit: {
            type: 'none',
            durationMs: 0
        },
        pip: {
            type: 'none'
        }
    },

    // Mirror by default (natural for webcam)
    mirror: false,

    // Full opacity
    opacity: 1.0,

    // Reduce opacity when zoomed in
    reduceOpacityOnZoom: false,

    // How much to resist camera zoom (1 = full HUD behavior, 0 = scales with content)
    zoomInfluence: 1,

    // No crop by default (full frame)
    sourceCrop: DEFAULT_CROP_DATA
}

// Webcam shape presets for quick selection
export const WEBCAM_SHAPE_PRESETS: Record<WebcamShape, { shape: WebcamShape, cornerRadius: number }> = {
    circle: { shape: 'circle', cornerRadius: 0 },
    'rounded-rect': { shape: 'rounded-rect', cornerRadius: 16 },
    squircle: { shape: 'squircle', cornerRadius: 32 },
    rectangle: { shape: 'rectangle', cornerRadius: 0 }
}

// Webcam position presets (percentage-based)
export const WEBCAM_POSITION_PRESETS: Record<string, { x: number; y: number; anchor: WebcamAnchor }> = {
    [OverlayAnchor.TopLeft]: { x: 0, y: 0, anchor: OverlayAnchor.TopLeft as any },
    [OverlayAnchor.TopCenter]: { x: 50, y: 0, anchor: OverlayAnchor.TopCenter as any },
    [OverlayAnchor.TopRight]: { x: 100, y: 0, anchor: OverlayAnchor.TopRight as any },
    [OverlayAnchor.CenterLeft]: { x: 0, y: 50, anchor: OverlayAnchor.CenterLeft as any },
    [OverlayAnchor.Center]: { x: 50, y: 50, anchor: OverlayAnchor.Center as any },
    [OverlayAnchor.CenterRight]: { x: 100, y: 50, anchor: OverlayAnchor.CenterRight as any },
    [OverlayAnchor.BottomLeft]: { x: 0, y: 100, anchor: OverlayAnchor.BottomLeft as any },
    [OverlayAnchor.BottomCenter]: { x: 50, y: 100, anchor: OverlayAnchor.BottomCenter as any },
    [OverlayAnchor.BottomRight]: { x: 100, y: 100, anchor: OverlayAnchor.BottomRight as any }
}
