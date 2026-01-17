/**
 * Effect Store - Internal implementation for effect CRUD operations
 *
 * ⚠️  INTERNAL MODULE - Do not import directly in components!
 *
 * For components/hooks, use:
 * - Read: `useEffectsContext()` from RenderingTimelineContext for pre-computed effect lookups
 * - Write: `useProjectStore.getState().addEffect()` or Command pattern
 *
 * This module provides pure functions for effect operations.
 * All effects live on project.timeline.effects[] as the single source of truth.
 *
 * Used internally by:
 * - Store actions (timeline-slice.ts)
 * - Commands (effects/*.ts)
 * - Initialization services
 */

import type { Effect, Project } from '@/types/project'
import { EffectType } from '@/types/project'
import type { EffectMutationBatch } from '@/features/effects/sync/types'
import { findNearestAvailableStart } from '@/features/ui/timeline/utils/nearest-gap'
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'
import { markModified } from '@/features/core/stores/store-utils'

export const NON_OVERLAPPING_EFFECT_TYPES: ReadonlySet<EffectType> = new Set([
  EffectType.Plugin,
  EffectType.Zoom,
  EffectType.Screen,
  EffectType.Keystroke,
  // NOTE: Webcam removed - now handled via clip.layout
])

function isKeystrokeStyleEffect(effect: Pick<Effect, 'type' | 'id'>): boolean {
  return effect.type === EffectType.Keystroke && effect.id === KEYSTROKE_STYLE_EFFECT_ID
}

export function isValidEffectTiming(effect: Effect): boolean {
  if (!Number.isFinite(effect.startTime) || !Number.isFinite(effect.endTime)) return false
  return effect.endTime > effect.startTime
}

function findNearestNonOverlappingPosition(
  effect: Effect,
  sameTypeEffects: Effect[],
  effectId?: string
): { startTime: number; endTime: number } {
  const duration = effect.endTime - effect.startTime
  const occupied = sameTypeEffects.filter(e => e.id !== effectId).map(e => ({ startTime: e.startTime, endTime: e.endTime }))
  const startTime = findNearestAvailableStart(effect.startTime, duration, occupied)
  return { startTime, endTime: startTime + duration }
}

export const EffectStore = {
  getAll(project: Project): Effect[] {
    return project.timeline.effects ?? []
  },

  add(project: Project, effect: Effect): void {
    const existing = project.timeline.effects ?? []

    if (!isValidEffectTiming(effect)) {
      console.error(`[EffectStore] Refusing to add effect ${effect.id} with invalid timing`, {
        startTime: effect.startTime,
        endTime: effect.endTime,
      })
      return
    }

    const enforceNonOverlap = NON_OVERLAPPING_EFFECT_TYPES.has(effect.type) && !isKeystrokeStyleEffect(effect)
    if (enforceNonOverlap) {
      const sameTypeEffects = existing.filter(e => e.type === effect.type && !isKeystrokeStyleEffect(e))
      const { startTime, endTime } = findNearestNonOverlappingPosition(effect, sameTypeEffects)
      effect.startTime = startTime
      effect.endTime = endTime
    }

    project.timeline.effects = [...existing, effect]
    markModified(project)
  },

  addMany(project: Project, effects: Effect[]): void {
    const existing = project.timeline.effects ?? []
    const validEffects = effects.filter(isValidEffectTiming)
    if (validEffects.length !== effects.length) {
      console.error('[EffectStore] Skipped effects with invalid timing during addMany')
    }
    project.timeline.effects = [...existing, ...validEffects]
    markModified(project)
  },

  remove(project: Project, effectId: string): boolean {
    const effects = project.timeline.effects ?? []
    const nextEffects = effects.filter(e => e.id !== effectId)
    if (nextEffects.length !== effects.length) {
      project.timeline.effects = nextEffects
      markModified(project)
      return true
    }
    return false
  },

  update(project: Project, effectId: string, updates: Partial<Effect>, force: boolean = false): boolean {
    const effects = project.timeline.effects ?? []
    const index = effects.findIndex(e => e.id === effectId)
    if (index === -1) return false
    const effect = effects[index]

    const nextStartTime = updates.startTime ?? effect.startTime
    const nextEndTime = updates.endTime ?? effect.endTime
    if (!Number.isFinite(nextStartTime) || !Number.isFinite(nextEndTime) || nextEndTime <= nextStartTime) {
      console.error(`[EffectStore] Refusing to update effect ${effectId} with invalid timing`, {
        startTime: nextStartTime,
        endTime: nextEndTime,
      })
      return false
    }

    const isTimeUpdate = updates.startTime !== undefined || updates.endTime !== undefined
    // Only check overlap if NOT forced
    if (isTimeUpdate && NON_OVERLAPPING_EFFECT_TYPES.has(effect.type) && !force && !isKeystrokeStyleEffect(effect)) {
      const tempEffect = { ...effect, startTime: nextStartTime, endTime: nextEndTime }
      const sameTypeEffects = effects.filter(e => e.type === effect.type && !isKeystrokeStyleEffect(e))
      const { startTime, endTime } = findNearestNonOverlappingPosition(tempEffect, sameTypeEffects, effectId)
      updates = { ...updates, startTime, endTime }
    }

    const nextEffect: Effect =
      updates.data && effect.data
        ? ({ ...effect, ...updates, data: { ...effect.data, ...(updates.data as typeof effect.data) } } as Effect)
        : ({ ...effect, ...updates } as Effect)

    const nextEffects = effects.slice()
    nextEffects[index] = nextEffect
    project.timeline.effects = nextEffects
    markModified(project)
    return true
  },

  get(project: Project, effectId: string): Effect | null {
    const effects = project.timeline.effects ?? []
    return effects.find(e => e.id === effectId) ?? null
  },

  find(project: Project, effectId: string): { effect: Effect; scope: 'timeline' } | null {
    const effect = this.get(project, effectId)
    return effect ? { effect, scope: 'timeline' } : null
  },

  exists(project: Project, effectId: string): boolean {
    return this.get(project, effectId) !== null
  },

  ensureArray(project: Project): void {
    if (!project.timeline.effects) project.timeline.effects = []
  },

  /**
   * Remove multiple effects by ID in a single operation.
   * More efficient than calling remove() multiple times.
   */
  removeMany(project: Project, ids: string[]): number {
    if (ids.length === 0) return 0
    const idsToRemove = new Set(ids)
    const effects = project.timeline.effects ?? []
    const nextEffects = effects.filter(e => !idsToRemove.has(e.id))
    const removed = effects.length - nextEffects.length
    if (removed > 0) {
      project.timeline.effects = nextEffects
      markModified(project)
    }
    return removed
  },

  /**
   * Update multiple effects in a single operation.
   * Skips invalid timing updates but applies all valid ones.
   */
  updateMany(project: Project, updates: Array<{ id: string; changes: Partial<Effect> }>): number {
    if (updates.length === 0) return 0
    const effects = project.timeline.effects ?? []
    const updateMap = new Map(updates.map(u => [u.id, u.changes]))
    let updatedCount = 0

    const nextEffects = effects.map(e => {
      const changes = updateMap.get(e.id)
      if (!changes) return e

      // Validate timing if being updated
      const nextStartTime = changes.startTime ?? e.startTime
      const nextEndTime = changes.endTime ?? e.endTime
      if (!Number.isFinite(nextStartTime) || !Number.isFinite(nextEndTime) || nextEndTime <= nextStartTime) {
        console.warn(`[EffectStore.updateMany] Skipping effect ${e.id} with invalid timing`)
        return e
      }

      updatedCount++
      // Merge data objects properly
      if (changes.data && e.data) {
        return { ...e, ...changes, data: { ...e.data, ...(changes.data as typeof e.data) } } as Effect
      }
      return { ...e, ...changes } as Effect
    })

    if (updatedCount > 0) {
      project.timeline.effects = nextEffects
      markModified(project)
    }
    return updatedCount
  },

  /**
   * Apply a batch of mutations atomically.
   * Processes removals, updates, and additions in a single array operation.
   *
   * This is the SSOT-enforcing method - all sync handlers should collect
   * mutations into an EffectMutationBatch and apply them through this method.
   */
  applyBatch(project: Project, batch: EffectMutationBatch): void {
    const effects = project.timeline.effects ?? []
    const hasChanges = batch.toRemove.size > 0 || batch.toUpdate.size > 0 || batch.toAdd.length > 0

    if (!hasChanges) return

    // Single pass: filter out removed, apply updates
    const nextEffects = effects
      .filter(e => !batch.toRemove.has(e.id))
      .map(e => {
        const updates = batch.toUpdate.get(e.id)
        if (!updates) return e

        // Validate timing if being updated
        const nextStartTime = updates.startTime ?? e.startTime
        const nextEndTime = updates.endTime ?? e.endTime
        if (!Number.isFinite(nextStartTime) || !Number.isFinite(nextEndTime) || nextEndTime <= nextStartTime) {
          console.warn(`[EffectStore.applyBatch] Skipping effect ${e.id} with invalid timing`)
          return e
        }

        // Merge data objects properly
        if (updates.data && e.data) {
          return { ...e, ...updates, data: { ...e.data, ...(updates.data as typeof e.data) } } as Effect
        }
        return { ...e, ...updates } as Effect
      })

    // Validate added effects
    const validAdds = batch.toAdd.filter(e => {
      if (!isValidEffectTiming(e)) {
        console.warn(`[EffectStore.applyBatch] Skipping added effect ${e.id} with invalid timing`)
        return false
      }
      return true
    })

    project.timeline.effects = [...nextEffects, ...validAdds]
    markModified(project)
  },
}
