/**
 * Effects Factory
 *
 * Centralized effect creation and management.
 * Filter/lookup/data-accessor methods are now in separate modules for KISS.
 *
 * This file handles:
 * - Effect creation (background, cursor, crop, plugin)
 * - Global effect initialization
 * - Project effect management (add/remove/update) - now delegates to EffectStore
 *
 * For filtering: import from './effect-filters'
 * For keystroke sync: import from './keystroke-sync-service'
 * For CRUD operations: import { EffectStore } from '@/lib/core/effects'
 */
import type { Effect, Recording, Clip, Project, BackgroundEffectData, CursorEffectData, CropEffectData, PluginEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import { PluginRegistry } from '@/lib/effects/config/plugin-registry'
import { getPluginDefaults, getDefaultZIndexForCategory } from '@/lib/effects/config/plugin-sdk'
import { DEFAULT_BACKGROUND_DATA, DEFAULT_CURSOR_DATA, getDefaultWallpaper } from '@/lib/constants/default-effects'
import { EffectStore, EffectQueries } from '@/lib/core/effects'

// Re-export from new modules for backwards compatibility
// Import for internal use
import { syncKeystrokeEffects } from './keystroke-sync-service'

export class EffectsFactory {
  // === CREATION METHODS ===

  static createDefaultBackgroundEffect(): Effect {
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
  }

  static createDefaultCursorEffect(): Effect {
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
  }

  static createCropEffect(options: {
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
  }

  static createPluginEffect(options: {
    pluginId: string
    startTime: number
    endTime: number
    params?: Record<string, unknown>
    position?: { x: number; y: number }
    zIndex?: number
  }): Effect | null {
    const plugin = PluginRegistry.get(options.pluginId)
    if (!plugin) {
      console.error(`[EffectsFactory] Plugin not found: ${options.pluginId}`)
      return null
    }
    if (plugin.kind === 'clip') {
      console.warn(`[EffectsFactory] Clip plugin "${options.pluginId}" cannot be added as an effect`)
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

  // === INITIALIZATION ===

  static createInitialEffectsForRecording(
    _recording: Recording,
    _existingGlobalEffects: Effect[] = []
  ): void {
    // NOTE: All effects now live in timeline.effects (the SSOT)
    // This method is kept for API compatibility but does nothing
  }

  static ensureGlobalEffects(project: Project): void {
    EffectStore.ensureArray(project)

    const effects = EffectStore.getAll(project)
    const hasBackground = effects.some(e => e.type === EffectType.Background)
    if (!hasBackground) {
      EffectStore.add(project, this.createDefaultBackgroundEffect())
    }

    const hasCursor = effects.some(e => e.type === EffectType.Cursor)
    if (!hasCursor) {
      EffectStore.add(project, this.createDefaultCursorEffect())
    }

    const hasKeystrokes = effects.some(e => e.type === EffectType.Keystroke)
    if (!hasKeystrokes) {
      syncKeystrokeEffects(project)
    }
  }

  // Delegate to extracted service
  static syncKeystrokeEffects(
    project: Project,
    metadataByRecordingId?: Map<string, import('@/types/project').RecordingMetadata>
  ): void {
    syncKeystrokeEffects(project, metadataByRecordingId)
  }

  // === PROJECT EFFECT MANAGEMENT ===
  // These methods now delegate to EffectStore for the SSOT

  static ensureEffectsArray(project: Project): void {
    EffectStore.ensureArray(project)
  }

  static addEffectToProject(project: Project, effect: Effect): void {
    EffectStore.add(project, effect)
  }

  static removeEffectFromProject(project: Project, effectId: string): boolean {
    return EffectStore.remove(project, effectId)
  }

  static updateEffectInProject(project: Project, effectId: string, updates: Partial<Effect>): boolean {
    return EffectStore.update(project, effectId, updates)
  }

  static getEffectsForClip(project: Project, clipId: string): Effect[] {
    // All effects now live in timeline.effects (the SSOT)
    return EffectQueries.byClip(project, clipId)
  }

  /**
   * Find an effect by ID in the project.
   * @deprecated Use EffectStore.find() directly for new code.
   */
  static findEffectInProject(project: Project, effectId: string): {
    effect: Effect
    scope: 'timeline'
  } | null {
    return EffectStore.find(project, effectId)
  }
}

