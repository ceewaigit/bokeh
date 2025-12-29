/**
 * Effect Creation Service
 * 
 * Centralized factory functions for creating various effect types.
 * Purely focused on object creation, not state management.
 */

import type { Effect, BackgroundEffectData, CursorEffectData, CropEffectData, PluginEffectData, WebcamEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import { PluginRegistry } from '@/lib/effects/config/plugin-registry'
import { getPluginDefaults, getDefaultZIndexForCategory } from '@/lib/effects/config/plugin-sdk'
import { DEFAULT_BACKGROUND_DATA, DEFAULT_CURSOR_DATA, DEFAULT_WEBCAM_DATA, getDefaultWallpaper } from '@/lib/constants/default-effects'

export const EffectCreation = {
    createDefaultBackgroundEffect(): Effect {
        const defaultWallpaper = getDefaultWallpaper()
        return {
            id: `background-global`,
            type: EffectType.Background,
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER,
            data: {
                ...DEFAULT_BACKGROUND_DATA,
                wallpaper: defaultWallpaper
            } as BackgroundEffectData,
            enabled: true
        }
    },

    createDefaultCursorEffect(): Effect {
        return {
            id: `cursor-global`,
            type: EffectType.Cursor,
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER,
            data: {
                ...DEFAULT_CURSOR_DATA,
            } as CursorEffectData,
            enabled: true
        }
    },

    createDefaultWebcamEffect(): Effect {
        return {
            id: `webcam-global`,
            type: EffectType.Webcam,
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER,
            data: {
                ...DEFAULT_WEBCAM_DATA,
            } as WebcamEffectData,
            enabled: true
        }
    },

    createDefaultCinematicScrollEffect(): Effect {
        return {
            id: `anno-scroll-cinematic-global`,
            type: EffectType.Annotation,
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER,
            data: {
                kind: 'scrollCinematic',
                smoothing: 48,
            },
            enabled: true,
        }
    },

    createCropEffect(options: {
        clipId: string
        startTime: number
        endTime: number
        cropData?: Partial<CropEffectData>
    }): Effect {
        return {
            id: `crop-${options.clipId}-${Date.now()}`,
            type: EffectType.Crop,
            startTime: options.startTime,
            endTime: options.endTime,
            clipId: options.clipId,
            data: {
                x: options.cropData?.x ?? 0,
                y: options.cropData?.y ?? 0,
                width: options.cropData?.width ?? 1,
                height: options.cropData?.height ?? 1,
            } as CropEffectData,
            enabled: true,
        }
    },

    createPluginEffect(options: {
        pluginId: string
        startTime: number
        endTime: number
        params?: Record<string, unknown>
        position?: { x: number; y: number }
        zIndex?: number
    }): Effect | null {
        const plugin = PluginRegistry.get(options.pluginId)
        if (!plugin) {
            console.error(`[EffectCreation] Plugin not found: ${options.pluginId}`)
            return null
        }
        if (plugin.kind === 'clip') {
            console.warn(`[EffectCreation] Clip plugin "${options.pluginId}" cannot be added as an effect`)
            return null
        }

        const defaults = getPluginDefaults(plugin)
        const defaultZIndex = getDefaultZIndexForCategory(plugin.category)

        let position = options.position
        if (!position && plugin.positioning?.enabled) {
            position = {
                x: plugin.positioning.defaultX ?? 50,
                y: plugin.positioning.defaultY ?? 50
            }
        }

        return {
            id: `plugin-${options.pluginId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: EffectType.Plugin,
            startTime: options.startTime,
            endTime: options.endTime,
            data: {
                pluginId: options.pluginId,
                params: { ...defaults, ...options.params },
                position,
                zIndex: options.zIndex ?? defaultZIndex
            } as PluginEffectData,
            enabled: true
        }
    }
}
