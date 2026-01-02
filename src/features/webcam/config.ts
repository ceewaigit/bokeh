import { DEFAULT_CROP_DATA } from '@/features/canvas/math/transforms/crop-transform'
import { getZoomTransformString } from '@/features/canvas/math/transforms/zoom-transform'
import type { WebcamEffectData } from '@/types/project'

// Default webcam effect data - Apple-quality PiP styling
export const DEFAULT_WEBCAM_DATA: WebcamEffectData = {
    // Position anchored to bottom-right, padding controls edge distance
    position: {
        x: 100,
        y: 100,
        anchor: 'bottom-right'
    },
    size: 18, // 18% of canvas width - compact but visible
    padding: 24, // Edge padding in pixels

    // Squircle shape for clean, modern Apple-esque look
    shape: 'squircle',
    cornerRadius: 40, // Larger radius for smoother squircle

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
    mirror: true,

    // Full opacity
    opacity: 1.0,

    // Reduce opacity when zoomed in
    reduceOpacityOnZoom: false,

    // No crop by default (full frame)
    sourceCrop: DEFAULT_CROP_DATA
}

// Webcam shape presets for quick selection
export const WEBCAM_SHAPE_PRESETS = {
    circle: { shape: 'circle' as const, cornerRadius: 0 },
    'rounded-rect': { shape: 'rounded-rect' as const, cornerRadius: 16 },
    squircle: { shape: 'squircle' as const, cornerRadius: 32 },
    rectangle: { shape: 'rectangle' as const, cornerRadius: 0 }
}

// Webcam position presets (percentage-based)
export const WEBCAM_POSITION_PRESETS = {
    'top-left': { x: 6, y: 6, anchor: 'top-left' as const },
    'top-center': { x: 50, y: 6, anchor: 'top-center' as const },
    'top-right': { x: 94, y: 6, anchor: 'top-right' as const },
    'center-left': { x: 6, y: 50, anchor: 'center-left' as const },
    'center': { x: 50, y: 50, anchor: 'center' as const },
    'center-right': { x: 94, y: 50, anchor: 'center-right' as const },
    'bottom-left': { x: 6, y: 94, anchor: 'bottom-left' as const },
    'bottom-center': { x: 50, y: 94, anchor: 'bottom-center' as const },
    'bottom-right': { x: 94, y: 94, anchor: 'bottom-right' as const }
}
