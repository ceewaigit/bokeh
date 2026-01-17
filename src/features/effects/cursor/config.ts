import type { CursorEffectData, CursorMotionPreset } from './types'
import { CursorStyle, CursorTheme } from './types'
import { CursorType } from './store/cursor-types'

// Cursor theme configuration
export interface CursorThemeConfig {
    id: CursorTheme
    name: string
    description: string
    /** Cursors available in this theme (others fall back to Default) */
    availableCursors: CursorType[]
}

// Available cursor themes
export const CURSOR_THEMES: Record<CursorTheme, CursorThemeConfig> = {
    [CursorTheme.Default]: {
        id: CursorTheme.Default,
        name: 'macOS',
        description: 'Apple-style cursors',
        availableCursors: Object.values(CursorType) as CursorType[]
    },
    [CursorTheme.Tahoe]: {
        id: CursorTheme.Tahoe,
        name: 'Tahoe',
        description: 'Tahoe cursor theme',
        availableCursors: [
            CursorType.ARROW,
            CursorType.IBEAM,
            CursorType.CROSSHAIR,
            CursorType.RESIZE_LEFT_RIGHT,
            CursorType.RESIZE_UP_DOWN,
            CursorType.POINTING_HAND,
            CursorType.OPEN_HAND,
            CursorType.OPERATION_NOT_ALLOWED
        ]
    },
    [CursorTheme.TahoeNoTail]: {
        id: CursorTheme.TahoeNoTail,
        name: 'Tahoe (No Tail)',
        description: 'Tahoe without tail',
        availableCursors: [
            CursorType.ARROW,
            CursorType.IBEAM,
            CursorType.CROSSHAIR,
            CursorType.RESIZE_LEFT_RIGHT,
            CursorType.RESIZE_UP_DOWN,
            CursorType.POINTING_HAND,
            CursorType.OPEN_HAND,
            CursorType.OPERATION_NOT_ALLOWED
        ]
    }
}

import { CURSOR_CONSTANTS } from './constants'

export const DEFAULT_CURSOR_DATA: CursorEffectData = {
    style: CursorStyle.MacOS,
    theme: CursorTheme.Default,
    size: CURSOR_CONSTANTS.DEFAULT_SIZE,
    color: '#ffffff',
    // Legacy values (kept for backwards compatibility, but cursorSmoothness takes precedence)
    speed: 0.01,
    smoothness: 0.25,
    glide: 0.15,
    // New unified smoothness: 0 = responsive/snappy, 1 = cinematic/buttery
    cursorSmoothness: 0.8,
    gliding: true,
    directionalTilt: true,
    directionalTiltMaxDeg: 16,
    motionBlur: false,
    motionBlurIntensity: 40,
    idleTimeout: 3000,
    clickEffects: true,
    clickEffectStyle: 'none',
    hideOnIdle: true,
    fadeOnIdle: true,
    motionPreset: 'cinematic',
    clickEffectAnimation: 'expand',
    clickEffectDurationMs: 480,
    clickEffectMaxRadius: 50,
    clickEffectLineWidth: 2,
    clickEffectColor: '#ffffff'
}

// Cursor motion presets - now using unified cursorSmoothness (0 = responsive, 1 = cinematic)
export const CURSOR_MOTION_PRESETS: Record<Exclude<CursorMotionPreset, 'custom'>, { cursorSmoothness: number }> = {
    cinematic: { cursorSmoothness: 1.0 },
    balanced: { cursorSmoothness: 0.5 },
    smooth: { cursorSmoothness: 1.0 }, // Alias for cinematic
    responsive: { cursorSmoothness: 0.0 }
}
