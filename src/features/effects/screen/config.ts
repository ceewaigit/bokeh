import { EffectLayerType } from '@/features/effects/types'
import type { ScreenEffectData } from '@/types/project'
import { ScreenEffectPreset } from '@/types/project'

// Default screen effect data
export const DEFAULT_SCREEN_DATA: ScreenEffectData = {
    preset: ScreenEffectPreset.Subtle,
    introMs: 300,
    outroMs: 300
}

// Default screen effect presets
export const SCREEN_EFFECT_PRESETS: Record<string, { tiltX: number; tiltY: number; perspective: number }> = {
    [ScreenEffectPreset.Subtle]: { tiltX: -2, tiltY: 4, perspective: 1000 },
    [ScreenEffectPreset.Medium]: { tiltX: -4, tiltY: 8, perspective: 900 },
    [ScreenEffectPreset.Dramatic]: { tiltX: -8, tiltY: 14, perspective: 800 },
    [ScreenEffectPreset.Window]: { tiltX: -3, tiltY: 12, perspective: 700 },
    [ScreenEffectPreset.Cinematic]: { tiltX: -5, tiltY: 10, perspective: 850 },
    [ScreenEffectPreset.Hero]: { tiltX: -10, tiltY: 16, perspective: 760 },
    [ScreenEffectPreset.Isometric]: { tiltX: -25, tiltY: 25, perspective: 950 },
    [ScreenEffectPreset.Flat]: { tiltX: 0, tiltY: 0, perspective: 1200 },
    [ScreenEffectPreset.TiltLeft]: { tiltX: -6, tiltY: -10, perspective: 900 },
    [ScreenEffectPreset.TiltRight]: { tiltX: -6, tiltY: 10, perspective: 900 },
    [ScreenEffectPreset.TableView]: { tiltX: 45, tiltY: 0, perspective: 1000 },
    [ScreenEffectPreset.Showcase]: { tiltX: -6, tiltY: 12, perspective: 950 },
    [ScreenEffectPreset.FloatingCard]: { tiltX: -3, tiltY: 3, perspective: 1200 }
}

// Screen Track Configuration
export const screenTrackConfig = {
    label: 'Screen',
    order: 1,
    colorKey: 'screenBlock' as const,
    layerType: EffectLayerType.Screen,
    getBlockLabel: () => '3D'
}
