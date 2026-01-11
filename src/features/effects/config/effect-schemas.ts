/**
 * Effect Schemas - Single source of truth for effect parameters
 * 
 * Each schema defines:
 * - Default values
 * - Slider/input constraints (min, max, step)
 * - UI metadata (labels, descriptions)
 * 
 * Sidebars can render controls dynamically from these schemas.
 * Community plugins will use the same format via definePlugin().
 */

import { EffectType } from '@/features/effects/types'
import { CursorStyle, KeystrokePosition, BackgroundType, ScreenEffectPreset } from '@/types/project'
import { ZOOM_TRANSITION_CONFIG } from '@/shared/config/physics-config'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type ParamType = 'number' | 'boolean' | 'string' | 'enum' | 'color' | 'color[]'

export interface NumberParam {
    type: 'number'
    default: number
    label: string
    description?: string
    min?: number
    max?: number
    step?: number
    unit?: string
}

export interface BooleanParam {
    type: 'boolean'
    default: boolean
    label: string
    description?: string
}

export interface StringParam {
    type: 'string'
    default: string
    label: string
    description?: string
    placeholder?: string
    maxLength?: number
}

export interface EnumParam<T = string> {
    type: 'enum'
    default: T
    label: string
    description?: string
    options: { value: T; label: string }[]
}

export interface ColorParam {
    type: 'color'
    default: string
    label: string
    description?: string
}

export type ParamDef = NumberParam | BooleanParam | StringParam | EnumParam | ColorParam

export interface EffectSchema {
    type: EffectType | string
    displayName: string
    icon: string
    category: 'transition' | 'transform' | 'visual' | 'overlay' | 'foreground' | 'underlay' | 'background'
    params: Record<string, ParamDef>
}

// =============================================================================
// EFFECT SCHEMAS
// =============================================================================

export const ZOOM_SCHEMA: EffectSchema = {
    type: EffectType.Zoom,
    displayName: 'Zoom',
    icon: 'ZoomIn',
    category: 'transform',
    params: {
        scale: { type: 'number', default: 2.0, label: 'Scale', min: 1, max: 7, step: 0.1, unit: 'x' },
        introMs: { type: 'number', default: ZOOM_TRANSITION_CONFIG.defaultIntroMs, label: 'Ease In', min: 0, max: 2000, step: 50, unit: 'ms' },
        outroMs: { type: 'number', default: ZOOM_TRANSITION_CONFIG.defaultOutroMs, label: 'Ease Out', min: 0, max: 2000, step: 50, unit: 'ms' },
        mouseIdlePx: { type: 'number', default: 3, label: 'Idle Threshold', min: 1, max: 20, step: 1, unit: 'px', description: 'Minimum movement to trigger pan' },
    }
}

export const CURSOR_SCHEMA: EffectSchema = {
    type: EffectType.Cursor,
    displayName: 'Cursor',
    icon: 'MousePointer',
    category: 'visual',
    params: {
        style: {
            type: 'enum',
            default: CursorStyle.MacOS,
            label: 'Style',
            options: [
                { value: CursorStyle.MacOS, label: 'macOS' },
                { value: CursorStyle.Default, label: 'Default' },
                { value: CursorStyle.Custom, label: 'Custom' },
            ]
        },
        size: { type: 'number', default: 4.0, label: 'Size', min: 0.5, max: 8, step: 0.1, unit: 'x' },
        speed: { type: 'number', default: 0.03, label: 'Speed', min: 0.01, max: 1, step: 0.01, description: 'Responsiveness (lower = more glide)' },
        smoothness: { type: 'number', default: 0.95, label: 'Smoothness', min: 0.1, max: 1, step: 0.05 },
        glide: { type: 'number', default: 0.9, label: 'Glide', min: 0, max: 1, step: 0.05, description: 'Extra inertia for cursor movement' },
        smoothingJumpThreshold: { type: 'number', default: 0.9, label: 'Continuity', min: 0.4, max: 1.6, step: 0.05, description: 'Higher keeps fast motion continuous before snapping' },
        idleTimeout: { type: 'number', default: 3000, label: 'Idle Timeout', min: 1000, max: 10000, step: 500, unit: 'ms' },
        clickEffects: { type: 'boolean', default: true, label: 'Click Animation', description: 'Pulse/ripple on mouse clicks' },
        motionBlur: { type: 'boolean', default: true, label: 'Motion Blur', description: 'Blur on fast movements' },
        motionBlurIntensity: { type: 'number', default: 40, label: 'Motion Blur Intensity', min: 0, max: 100, step: 5, unit: '%' },
        directionalTilt: { type: 'boolean', default: true, label: 'Directional Tilt', description: 'Slightly rotate in direction of travel' },
        directionalTiltMaxDeg: { type: 'number', default: 10, label: 'Tilt Amount', min: 0, max: 15, step: 1, unit: '°' },
        hideOnIdle: { type: 'boolean', default: true, label: 'Hide When Idle', description: 'Hide cursor after timeout' },
        fadeOnIdle: { type: 'boolean', default: true, label: 'Fade In/Out', description: 'Fade instead of instant hide' },
        gliding: { type: 'boolean', default: true, label: 'Smooth Movement', description: 'Interpolate cursor motion' },
    }
}

export const KEYSTROKE_SCHEMA: EffectSchema = {
    type: EffectType.Keystroke,
    displayName: 'Keystroke',
    icon: 'Keyboard',
    category: 'overlay',
    params: {
        stylePreset: {
            type: 'enum',
            default: 'glass',
            label: 'Style',
            options: [
                { value: 'glass', label: 'Glass' },
                { value: 'minimal', label: 'Minimal' },
                { value: 'outline', label: 'Outline' },
                { value: 'terminal', label: 'Terminal' },
                { value: 'default', label: 'Solid' },
            ]
        },
        position: {
            type: 'enum',
            default: KeystrokePosition.BottomCenter,
            label: 'Position',
            options: [
                { value: KeystrokePosition.BottomCenter, label: 'Bottom' },
                { value: KeystrokePosition.TopCenter, label: 'Top' },
                { value: KeystrokePosition.BottomRight, label: 'Right' },
            ]
        },
        fontSize: { type: 'number', default: 14, label: 'Size', min: 10, max: 28, step: 1, unit: 'px' },
        displayDuration: { type: 'number', default: 2000, label: 'Duration', min: 500, max: 5000, step: 100, unit: 'ms' },
        borderRadius: { type: 'number', default: 15, label: 'Corner Radius', min: 0, max: 24, step: 1, unit: 'px' },
        padding: { type: 'number', default: 8, label: 'Padding', min: 4, max: 20, step: 1, unit: 'px' },
        scale: { type: 'number', default: 1.0, label: 'Scale', min: 0.5, max: 2, step: 0.1, unit: 'x' },
        fadeOutDuration: { type: 'number', default: 400, label: 'Fade Out', min: 100, max: 1000, step: 50, unit: 'ms' },
        showModifierSymbols: { type: 'boolean', default: true, label: 'Use Symbols', description: 'Show ⌘⌥⌃ instead of Cmd+Alt+Ctrl' },
    }
}

export const SCREEN_SCHEMA: EffectSchema = {
    type: EffectType.Screen,
    displayName: '3D Screen',
    icon: 'Monitor',
    category: 'transform',
    params: {
        preset: {
            type: 'enum',
            default: ScreenEffectPreset.Subtle,
            label: 'Preset',
            options: [
                { value: ScreenEffectPreset.Subtle, label: 'Subtle' },
                { value: ScreenEffectPreset.Medium, label: 'Medium' },
                { value: ScreenEffectPreset.Dramatic, label: 'Dramatic' },
                { value: ScreenEffectPreset.Window, label: 'Window' },
                { value: ScreenEffectPreset.Cinematic, label: 'Cinematic' },
                { value: ScreenEffectPreset.Hero, label: 'Hero' },
                { value: ScreenEffectPreset.Isometric, label: 'Isometric' },
                { value: ScreenEffectPreset.Flat, label: 'Flat' },
                { value: ScreenEffectPreset.TiltLeft, label: 'Tilt Left' },
                { value: ScreenEffectPreset.TiltRight, label: 'Tilt Right' },
            ]
        },
        introMs: { type: 'number', default: 300, label: 'Ease In', min: 0, max: 1000, step: 50, unit: 'ms' },
        outroMs: { type: 'number', default: 300, label: 'Ease Out', min: 0, max: 1000, step: 50, unit: 'ms' },
    }
}

export const BACKGROUND_SCHEMA: EffectSchema = {
    type: EffectType.Background,
    displayName: 'Background',
    icon: 'Palette',
    category: 'background',
    params: {
        type: {
            type: 'enum',
            default: BackgroundType.Wallpaper,
            label: 'Type',
            options: [
                { value: BackgroundType.Wallpaper, label: 'Wallpaper' },
                { value: BackgroundType.Gradient, label: 'Gradient' },
                { value: BackgroundType.Color, label: 'Solid Color' },
                { value: BackgroundType.Image, label: 'Image' },
                { value: BackgroundType.Parallax, label: 'Parallax' },
            ]
        },
        padding: { type: 'number', default: 60, label: 'Padding', min: 0, max: 200, step: 5, unit: 'px' },
        cornerRadius: { type: 'number', default: 15, label: 'Corner Radius', min: 0, max: 50, step: 1, unit: 'px' },
        shadowIntensity: { type: 'number', default: 85, label: 'Shadow', min: 0, max: 100, step: 5, unit: '%' },
        blur: { type: 'number', default: 0, label: 'Blur', min: 0, max: 50, step: 1, unit: 'px' },
        parallaxIntensity: { type: 'number', default: 50, label: 'Movement', min: 0, max: 100, step: 5, unit: '%' },
    }
}

// =============================================================================
// SCHEMA REGISTRY
// =============================================================================

export const EFFECT_SCHEMAS: Record<string, EffectSchema> = {
    [EffectType.Zoom]: ZOOM_SCHEMA,
    [EffectType.Cursor]: CURSOR_SCHEMA,
    [EffectType.Keystroke]: KEYSTROKE_SCHEMA,
    [EffectType.Screen]: SCREEN_SCHEMA,
    [EffectType.Background]: BACKGROUND_SCHEMA,
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get default values for an effect type from its schema
 */
export function getEffectDefaults(type: EffectType | string): Record<string, any> {
    const schema = EFFECT_SCHEMAS[type]
    if (!schema) return {}
    return Object.fromEntries(
        Object.entries(schema.params).map(([key, param]) => [key, param.default])
    )
}

/**
 * Get schema for an effect type
 */
export function getEffectSchema(type: EffectType | string): EffectSchema | undefined {
    return EFFECT_SCHEMAS[type]
}

/**
 * Get param constraints for a specific parameter
 */
export function getParamConstraints(type: EffectType | string, paramKey: string): ParamDef | undefined {
    return EFFECT_SCHEMAS[type]?.params[paramKey]
}
