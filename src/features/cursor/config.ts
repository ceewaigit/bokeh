import type { CursorEffectData, CursorMotionPreset } from '@/types/project'
import { CursorStyle } from '@/types/project'

export const DEFAULT_CURSOR_DATA: CursorEffectData = {
    style: CursorStyle.MacOS,
    size: 1,
    color: '#ffffff',
    speed: 0.25,
    smoothness: 0.25,
    glide: 0.15,
    gliding: true,
    motionBlur: false,
    motionBlurIntensity: 40,
    idleTimeout: 3000,
    clickEffects: true,
    clickEffectStyle: 'ripple',
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
    cinematic: { speed: 0.25, smoothness: 0.7, glide: 0.65 },
    balanced: { speed: 0.5, smoothness: 0.45, glide: 0.4 },
    smooth: { speed: 0.25, smoothness: 0.7, glide: 0.65 }, // Alias for cinematic if needed or duplicate
    responsive: { speed: 0.8, smoothness: 0.15, glide: 0.15 } // Gaming/Fast
}
