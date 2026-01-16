/**
 * Effect Selectors
 *
 * Lightweight selectors for effect-related state.
 * For most use cases, prefer useTimelineEffects() or useEffectsByType()
 * from timeline-selectors.ts - those provide the grouped data.
 *
 * This file only contains selectors that are actually used.
 */

import { useMemo } from 'react'
import { useProjectStore, type ProjectStore } from '../project-store'
import { EffectType } from '@/types/project'
import type { Effect, AnnotationEffect } from '@/types/project'

// PERF: Narrow selector to only trigger on effects array changes, not any project change
// CRITICAL: Use constant empty array to avoid infinite loop in useSyncExternalStore
const EMPTY_EFFECTS: Effect[] = []
const selectEffects = (s: ProjectStore): Effect[] =>
  s.currentProject?.timeline?.effects ?? EMPTY_EFFECTS

/**
 * Get all annotation effects.
 * Used by timeline-annotation-track.tsx
 */
export function useAnnotationEffects(): AnnotationEffect[] {
  // PERF: Only re-run when effects array changes, not on any project change
  const effects = useProjectStore(selectEffects)

  return useMemo(() => {
    return effects.filter(e => e.type === EffectType.Annotation) as AnnotationEffect[]
  }, [effects])
}

/**
 * Get an effect by ID.
 */
export function useEffectById(effectId: string | null): Effect | null {
  // PERF: Only re-run when effects array changes
  const effects = useProjectStore(selectEffects)

  return useMemo(() => {
    if (!effectId) return null
    return effects.find(e => e.id === effectId) ?? null
  }, [effects, effectId])
}

/**
 * Get effects for a specific clip.
 */
export function useEffectsForClip(clipId: string | null): Effect[] {
  // PERF: Only re-run when effects array changes
  const effects = useProjectStore(selectEffects)

  return useMemo(() => {
    if (!clipId) return []
    return effects.filter(e => e.clipId === clipId)
  }, [effects, clipId])
}
