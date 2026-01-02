/**
 * Effects Factory (Facade)
 *
 * Centralized entry point for effect operations.
 * Delegates actual implementation to focused modules:
 * - Creation -> EffectCreation
 * - Initialization -> EffectInitialization
 * - State Management -> EffectStore (SSOT)
 *
 * @deprecated Prefer importing directly from specialized modules in new code to reduce coupling.
 */
import type { Effect, Project, Recording, CropEffectData } from '@/types/project'
import { EffectStore } from '@/features/effects/core/store'
import { EffectCreation } from './core/creation'
import { EffectInitialization } from './core/initialization'

// Re-export specific services if needed, or just use the facade methods below
export { EffectCreation, EffectInitialization }

export class EffectsFactory {
  // === CREATION METHODS (Delegated to EffectCreation) ===

  static createDefaultBackgroundEffect(): Effect {
    return EffectCreation.createDefaultBackgroundEffect()
  }

  static createDefaultCursorEffect(): Effect {
    return EffectCreation.createDefaultCursorEffect()
  }

  static createDefaultWebcamEffect(): Effect {
    return EffectCreation.createDefaultWebcamEffect()
  }

  static createCropEffect(options: {
    clipId: string
    startTime: number
    endTime: number
    cropData?: Partial<CropEffectData>
  }): Effect {
    return EffectCreation.createCropEffect(options)
  }

  static createPluginEffect(options: {
    pluginId: string
    startTime: number
    endTime: number
    params?: Record<string, unknown>
    position?: { x: number; y: number }
    zIndex?: number
  }): Effect | null {
    return EffectCreation.createPluginEffect(options)
  }

  // === INITIALIZATION (Delegated to EffectInitialization) ===

  static createInitialEffectsForRecording(
    _recording: Recording,
    _existingGlobalEffects: Effect[] = []
  ): void {
    EffectInitialization.createInitialEffectsForRecording()
  }

  static ensureGlobalEffects(project: Project): void {
    EffectInitialization.ensureGlobalEffects(project)
  }

  static syncKeystrokeEffects(
    project: Project,
    metadataByRecordingId?: Map<string, import('@/types/project').RecordingMetadata>
  ): void {
    EffectInitialization.syncKeystrokeEffects(project, metadataByRecordingId)
  }

  // === PROJECT EFFECT MANAGEMENT (Delegated to EffectStore [SSOT]) ===

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
    return EffectStore.getAll(project).filter(e => e.clipId === clipId)
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
