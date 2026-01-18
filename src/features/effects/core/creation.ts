/**
 * Effect Creation Service
 *
 * Centralized factory functions for creating various effect types.
 * Purely focused on object creation, not state management.
 */

import type { Effect, BackgroundEffectData, CursorEffectData, CropEffectData, PluginEffectData, KeystrokeEffectData, AnnotationData } from '@/types/project'
import { EffectType, AnnotationType } from '@/types/project'
import { PluginRegistry } from '@/features/effects/config/plugin-registry'
import { getPluginDefaults, getDefaultZIndexForCategory } from '@/features/effects/config/plugin-sdk'
import { getDefaultWallpaper } from '@/features/effects/background/utils'
import { DEFAULT_CURSOR_DATA } from '@/features/effects/cursor/config'
import { DEFAULT_BACKGROUND_DATA } from '@/features/effects/background/config'
import { DEFAULT_KEYSTROKE_DATA, KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'
import { getAnnotationConfig, isTopLeftAnchor } from '@/features/effects/annotation/registry'

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
        wallpaper: defaultWallpaper,
      } as BackgroundEffectData,
      enabled: true,
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
      enabled: true,
    }
  },

  createDefaultKeystrokeStyleEffect(): Effect {
    return {
      id: KEYSTROKE_STYLE_EFFECT_ID,
      type: EffectType.Keystroke,
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      data: {
        ...DEFAULT_KEYSTROKE_DATA,
      } as KeystrokeEffectData,
      enabled: true,
    }
  },

  createCropEffect(options: { clipId: string; startTime: number; endTime: number; cropData?: Partial<CropEffectData> }): Effect {
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
        y: plugin.positioning.defaultY ?? 50,
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
        zIndex: options.zIndex ?? defaultZIndex,
      } as PluginEffectData,
      enabled: true,
    }
  },

  createAnnotationEffect(
    type: AnnotationType,
    options: {
      startTime: number
      position?: { x: number; y: number }
      endPosition?: { x: number; y: number }
    }
  ): Effect {
    const config = getAnnotationConfig(type)
    const position = options.position ?? { x: 50, y: 50 }

    // Adjust position for top-left anchored elements (Highlight, Redaction, Blur)
    // so the center lands at the specified position
    let finalPosition = position
    if (isTopLeftAnchor(type) && config.defaultSize.width && config.defaultSize.height) {
      finalPosition = {
        x: position.x - config.defaultSize.width / 2,
        y: position.y - config.defaultSize.height / 2,
      }
    }

    return {
      id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: EffectType.Annotation,
      startTime: options.startTime,
      endTime: options.startTime + 3000,
      enabled: true,
      data: {
        type,
        position: finalPosition,
        content: config.defaultContent,
        endPosition: type === AnnotationType.Arrow
          ? (options.endPosition ?? { x: position.x + 10, y: position.y })
          : undefined,
        width: config.defaultSize.width,
        height: config.defaultSize.height,
        style: { ...config.defaultStyle },
        introFadeMs: config.defaultIntroFadeMs,
        outroFadeMs: config.defaultOutroFadeMs,
      } as AnnotationData,
    }
  },
}
