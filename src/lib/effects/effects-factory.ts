/**
 * Effects Factory
 *
 * Centralized effect creation and management.
 * Filter/lookup/data-accessor methods are now in separate modules for KISS.
 *
 * This file handles:
 * - Effect creation (background, cursor, crop, plugin)
 * - Global effect initialization
 * - Project effect management (add/remove/update)
 *
 * For filtering: import from './effect-filters'
 * For keystroke sync: import from './keystroke-sync-service'
 */
import type { Effect, Recording, Clip, Project, BackgroundEffectData, CursorEffectData, CropEffectData, PluginEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import { PluginRegistry } from '@/lib/effects/config/plugin-registry'
import { getPluginDefaults, getDefaultZIndexForCategory } from '@/lib/effects/config/plugin-sdk'
import { DEFAULT_BACKGROUND_DATA, DEFAULT_CURSOR_DATA, getDefaultWallpaper } from '@/lib/constants/default-effects'

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
    recording: Recording,
    _existingGlobalEffects: Effect[] = []
  ): void {
    if (!recording.effects) {
      recording.effects = []
    }
    // NOTE: Zoom effects are created on-demand via sidebar, not auto-created here
  }

  static ensureGlobalEffects(project: Project): void {
    if (!project.timeline.effects) {
      project.timeline.effects = []
    }

    const hasBackground = project.timeline.effects.some(e => e.type === EffectType.Background)
    if (!hasBackground) {
      project.timeline.effects.push(this.createDefaultBackgroundEffect())
    }

    const hasCursor = project.timeline.effects.some(e => e.type === EffectType.Cursor)
    if (!hasCursor) {
      project.timeline.effects.push(this.createDefaultCursorEffect())
    }

    const hasKeystrokes = project.timeline.effects.some(e => e.type === EffectType.Keystroke)
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

  static ensureEffectsArray(project: Project): void {
    if (!project.timeline.effects) {
      project.timeline.effects = []
    }
  }

  static addEffectToProject(project: Project, effect: Effect): void {
    this.ensureEffectsArray(project)
    project.timeline.effects!.push(effect)
    project.modifiedAt = new Date().toISOString()
  }

  static removeEffectFromProject(project: Project, effectId: string): boolean {
    const located = this.findEffectInProject(project, effectId)
    if (!located) return false

    if (located.scope === 'timeline') {
      const effects = project.timeline.effects || []
      const index = effects.findIndex(e => e.id === effectId)
      if (index !== -1) {
        effects.splice(index, 1)
        project.modifiedAt = new Date().toISOString()
        return true
      }
    } else if (located.scope === 'recording' && located.recording) {
      const effects = located.recording.effects || []
      const index = effects.findIndex(e => e.id === effectId)
      if (index !== -1) {
        effects.splice(index, 1)
        project.modifiedAt = new Date().toISOString()
        return true
      }
    }

    return false
  }

  static updateEffectInProject(project: Project, effectId: string, updates: Partial<Effect>): boolean {
    const located = this.findEffectInProject(project, effectId)
    if (!located) return false

    // Deep merge data object to preserve existing properties
    if (updates.data && located.effect.data) {
      Object.assign(located.effect, updates, {
        data: { ...located.effect.data, ...updates.data }
      })
    } else {
      Object.assign(located.effect, updates)
    }

    project.modifiedAt = new Date().toISOString()
    return true
  }

  static getEffectsForClip(project: Project, clipId: string): Effect[] {
    let clip: Clip | null = null
    for (const track of project.timeline.tracks) {
      clip = track.clips.find(c => c.id === clipId) || null
      if (clip) break
    }
    if (!clip) return []

    const recording = project.recordings.find(r => r.id === clip.recordingId)
    if (!recording || !recording.effects) return []

    return recording.effects.filter(effect =>
      effect.startTime < clip.sourceOut && effect.endTime > clip.sourceIn
    )
  }

  private static findEffectInProject(project: Project, effectId: string): {
    effect: Effect
    scope: 'timeline' | 'recording'
    recording?: Recording
  } | null {
    // Check timeline effects first (new architecture)
    if (project.timeline.effects) {
      const effect = project.timeline.effects.find(e => e.id === effectId)
      if (effect) {
        return { effect, scope: 'timeline' }
      }
    }

    // Then check recording-level effects
    for (const recording of project.recordings) {
      if (!recording.effects) continue
      const effect = recording.effects.find(e => e.id === effectId)
      if (effect) {
        return { effect, scope: 'recording', recording }
      }
    }

    return null
  }

}
