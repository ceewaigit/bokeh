/**
 * Effect Selectors
 *
 * Centralized selectors for effect-related state.
 * These provide a clean API for components to access effects
 * without directly importing EffectStore.
 *
 * Usage:
 *   const backgroundEffect = useBackgroundEffect()
 *   const cursorEffect = useCursorEffect()
 *   const zoomEffects = useZoomEffects()
 */

import { useMemo } from 'react'
import { useProjectStore } from '../project-store'
import { EffectStore } from '@/features/effects/core/effects-store'
import { EffectType } from '@/types/project'
import type { Effect, BackgroundEffect, CursorEffect, KeystrokeEffect, ZoomEffect, ScreenEffect, CropEffect, AnnotationEffect, PluginEffect } from '@/types/project'
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'

// =============================================================================
// SINGLE GLOBAL EFFECTS (only one instance per project)
// =============================================================================

/**
 * Get the background effect (only one per project).
 */
export function useBackgroundEffect(): BackgroundEffect | null {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return null
    const effects = EffectStore.getAll(project)
    return (effects.find(e => e.type === EffectType.Background) as BackgroundEffect) ?? null
  }, [project])
}

/**
 * Get the cursor effect (only one per project).
 */
export function useCursorEffect(): CursorEffect | null {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return null
    const effects = EffectStore.getAll(project)
    return (effects.find(e => e.type === EffectType.Cursor) as CursorEffect) ?? null
  }, [project])
}

/**
 * Get the keystroke style effect (global styling, only one per project).
 */
export function useKeystrokeStyleEffect(): KeystrokeEffect | null {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return null
    const effects = EffectStore.getAll(project)
    return (effects.find(e => e.id === KEYSTROKE_STYLE_EFFECT_ID) as KeystrokeEffect) ?? null
  }, [project])
}

// =============================================================================
// MULTIPLE EFFECTS (can have many instances)
// =============================================================================

/**
 * Get all zoom effects.
 */
export function useZoomEffects(): ZoomEffect[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    const effects = EffectStore.getAll(project)
    return effects.filter(e => e.type === EffectType.Zoom) as ZoomEffect[]
  }, [project])
}

/**
 * Get all screen effects.
 */
export function useScreenEffects(): ScreenEffect[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    const effects = EffectStore.getAll(project)
    return effects.filter(e => e.type === EffectType.Screen) as ScreenEffect[]
  }, [project])
}

/**
 * Get all crop effects.
 */
export function useCropEffects(): CropEffect[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    const effects = EffectStore.getAll(project)
    return effects.filter(e => e.type === EffectType.Crop) as CropEffect[]
  }, [project])
}

/**
 * Get all annotation effects.
 */
export function useAnnotationEffects(): AnnotationEffect[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    const effects = EffectStore.getAll(project)
    return effects.filter(e => e.type === EffectType.Annotation) as AnnotationEffect[]
  }, [project])
}

/**
 * Get all plugin effects.
 */
export function usePluginEffects(): PluginEffect[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    const effects = EffectStore.getAll(project)
    return effects.filter(e => e.type === EffectType.Plugin) as PluginEffect[]
  }, [project])
}

/**
 * Get all keystroke effects (individual keystrokes, NOT the style effect).
 */
export function useKeystrokeEffects(): KeystrokeEffect[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return []
    const effects = EffectStore.getAll(project)
    return effects.filter(e =>
      e.type === EffectType.Keystroke && e.id !== KEYSTROKE_STYLE_EFFECT_ID
    ) as KeystrokeEffect[]
  }, [project])
}

// =============================================================================
// BY ID / FILTERED
// =============================================================================

/**
 * Get an effect by ID.
 */
export function useEffectById(effectId: string | null): Effect | null {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project || !effectId) return null
    return EffectStore.get(project, effectId)
  }, [project, effectId])
}

/**
 * Get effects for a specific clip.
 */
export function useEffectsForClip(clipId: string | null): Effect[] {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project || !clipId) return []
    const effects = EffectStore.getAll(project)
    return effects.filter(e => e.clipId === clipId)
  }, [project, clipId])
}

/**
 * Get enabled zoom effects only.
 */
export function useEnabledZoomEffects(): ZoomEffect[] {
  const zoomEffects = useZoomEffects()
  return useMemo(() => zoomEffects.filter(e => e.enabled), [zoomEffects])
}

/**
 * Get enabled crop effects only.
 */
export function useEnabledCropEffects(): CropEffect[] {
  const cropEffects = useCropEffects()
  return useMemo(() => cropEffects.filter(e => e.enabled), [cropEffects])
}

// =============================================================================
// COUNTS & EXISTS
// =============================================================================

/**
 * Check if any zoom effects exist.
 */
export function useHasZoomEffects(): boolean {
  const zoomEffects = useZoomEffects()
  return zoomEffects.length > 0
}

/**
 * Check if any annotation effects exist.
 */
export function useHasAnnotationEffects(): boolean {
  const annotationEffects = useAnnotationEffects()
  return annotationEffects.length > 0
}

/**
 * Get the count of effects by type.
 */
export function useEffectCount(type: EffectType): number {
  const project = useProjectStore((s) => s.currentProject)

  return useMemo(() => {
    if (!project) return 0
    const effects = EffectStore.getAll(project)
    return effects.filter(e => e.type === type).length
  }, [project, type])
}
