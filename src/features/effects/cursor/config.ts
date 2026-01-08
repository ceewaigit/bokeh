import type { CursorEffectData, CursorMotionPreset } from '@/types/project'
import { CursorStyle, CursorTheme } from '@/types/project'
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
    speed: 0.01,
    smoothness: 0.25,
    glide: 0.15,
    gliding: true,
    motionBlur: false,
    motionBlurIntensity: 40,
    idleTimeout: 3000,
    clickEffects: true,
    clickEffectStyle: 'none',
    hideOnIdle: true, // Default to hiding on idle for cleaner look
    fadeOnIdle: true,
    motionPreset: 'cinematic',
    clickEffectAnimation: 'expand',
    clickEffectDurationMs: 480,
    clickEffectMaxRadius: 50,
    clickEffectLineWidth: 2,
    clickEffectColor: '#ffffff'
}

// Cursor motion presets - maps preset name to speed/smoothness/glide values
export const CURSOR_MOTION_PRESETS: Record<Exclude<CursorMotionPreset, 'custom'>, { speed: number; smoothness: number; glide: number }> = {
    cinematic: { speed: 0.01, smoothness: 0.7, glide: 0.65 },
    balanced: { speed: 0.5, smoothness: 0.45, glide: 0.4 },
    smooth: { speed: 0.01, smoothness: 0.7, glide: 0.65 }, // Alias for cinematic if needed or duplicate
    responsive: { speed: 0.8, smoothness: 0.15, glide: 0.15 } // Gaming/Fast
}
