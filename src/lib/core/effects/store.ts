/**
 * Effect Store - Single Source of Truth for all effect CRUD operations
 *
 * This module provides a centralized API for managing effects.
 * All effects live on timeline.effects[] - this is THE ONLY authoritative location.
 *
 * Key design decisions:
 * - Effects are stored ONLY on timeline.effects[]
 * - recording.effects[] is FULLY DEPRECATED and not supported
 * - All effect operations go through this store
 * - Same-type effects cannot overlap (auto-adjusted on add/update)
 */

import type { Effect, Project } from '@/types/project'
import { EffectType } from '@/types/project'

// Effect types that should not overlap with each other
const NON_OVERLAPPING_TYPES = new Set([
    EffectType.Plugin,
    EffectType.Zoom,
    EffectType.Screen,
    EffectType.Keystroke
])

/**
 * Check if two time ranges overlap.
 */
function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
    return start1 < end2 && end1 > start2
}

/**
 * Find a non-overlapping position for an effect.
 * Tries to keep the effect at its original position, but shifts it if overlapping.
 */
function findNonOverlappingPosition(
    effect: Effect,
    sameTypeEffects: Effect[],
    effectId?: string // Exclude this effect when checking (for updates)
): { startTime: number; endTime: number } {
    const duration = effect.endTime - effect.startTime
    let startTime = effect.startTime
    let endTime = effect.endTime

    // Sort by start time
    const sorted = sameTypeEffects
        .filter(e => e.id !== effectId)
        .sort((a, b) => a.startTime - b.startTime)

    // Check for overlaps and shift if needed
    let hasOverlap = true
    let iterations = 0
    const maxIterations = sorted.length + 1 // Safety limit

    while (hasOverlap && iterations < maxIterations) {
        hasOverlap = false
        iterations++

        for (const existing of sorted) {
            if (rangesOverlap(startTime, endTime, existing.startTime, existing.endTime)) {
                // Shift to after this effect with a small gap
                startTime = existing.endTime + 100 // 100ms gap
                endTime = startTime + duration
                hasOverlap = true
                break
            }
        }
    }

    return { startTime, endTime }
}

/**
 * EffectStore - THE authoritative API for effect CRUD operations.
 * All effects are stored ONLY on timeline.effects[].
 */
export const EffectStore = {
    /**
     * Get all effects from the project.
     * Returns effects from timeline.effects (the SSOT).
     */
    getAll(project: Project): Effect[] {
        return project.timeline.effects ?? []
    },

    /**
     * Add an effect to the project.
     * Effects are always added to timeline.effects (the SSOT).
     * For non-overlapping effect types, position is auto-adjusted if needed.
     */
    add(project: Project, effect: Effect): void {
        const existing = project.timeline.effects ?? []

        // Auto-adjust position for non-overlapping effect types
        if (NON_OVERLAPPING_TYPES.has(effect.type)) {
            const sameTypeEffects = existing.filter(e => e.type === effect.type)
            const { startTime, endTime } = findNonOverlappingPosition(effect, sameTypeEffects)
            effect.startTime = startTime
            effect.endTime = endTime
        }

        project.timeline.effects = [...existing, effect]
        project.modifiedAt = new Date().toISOString()
    },

    /**
     * Add multiple effects to the project.
     */
    addMany(project: Project, effects: Effect[]): void {
        const existing = project.timeline.effects ?? []
        project.timeline.effects = [...existing, ...effects]
        project.modifiedAt = new Date().toISOString()
    },

    /**
     * Remove an effect from the project by ID.
     * Returns true if the effect was found and removed.
     */
    remove(project: Project, effectId: string): boolean {
        const effects = project.timeline.effects ?? []
        const nextEffects = effects.filter(e => e.id !== effectId)
        if (nextEffects.length !== effects.length) {
            project.timeline.effects = nextEffects
            project.modifiedAt = new Date().toISOString()
            return true
        }

        return false
    },

    /**
     * Update an effect in the project.
     * Performs a shallow merge of updates with the existing effect.
     * Deep merges the data property to preserve existing data fields.
     * For non-overlapping effect types, position is auto-adjusted if needed.
     * Returns true if the effect was found and updated.
     */
    update(project: Project, effectId: string, updates: Partial<Effect>): boolean {
        const effects = project.timeline.effects ?? []
        const index = effects.findIndex(e => e.id === effectId)
        if (index === -1) return false
        const effect = effects[index]

        // Check if we need to auto-adjust position for non-overlapping types
        const isTimeUpdate = updates.startTime !== undefined || updates.endTime !== undefined
        if (isTimeUpdate && NON_OVERLAPPING_TYPES.has(effect.type)) {
            const newStartTime = updates.startTime ?? effect.startTime
            const newEndTime = updates.endTime ?? effect.endTime

            // Create a temporary effect with the new times to check for overlaps
            const tempEffect = { ...effect, startTime: newStartTime, endTime: newEndTime }
            const sameTypeEffects = effects.filter(e => e.type === effect.type)
            const { startTime, endTime } = findNonOverlappingPosition(tempEffect, sameTypeEffects, effectId)

            updates = { ...updates, startTime, endTime }
        }

        let nextEffect: Effect
        if (updates.data && effect.data) {
            nextEffect = {
                ...effect,
                ...updates,
                data: { ...effect.data, ...updates.data }
            }
        } else {
            nextEffect = { ...effect, ...updates }
        }

        const nextEffects = effects.slice()
        nextEffects[index] = nextEffect
        project.timeline.effects = nextEffects
        project.modifiedAt = new Date().toISOString()
        return true
    },

    /**
     * Get an effect by ID.
     * Returns the effect or null if not found.
     */
    get(project: Project, effectId: string): Effect | null {
        const effects = project.timeline.effects ?? []
        return effects.find(e => e.id === effectId) ?? null
    },

    /**
     * Find an effect by ID with location info.
     * Returns the effect and scope info, or null if not found.
     */
    find(project: Project, effectId: string): {
        effect: Effect
        scope: 'timeline'
    } | null {
        const effect = this.get(project, effectId)
        if (effect) {
            return { effect, scope: 'timeline' }
        }
        return null
    },

    /**
     * Check if an effect exists.
     */
    exists(project: Project, effectId: string): boolean {
        return this.get(project, effectId) !== null
    },

    /**
     * Ensure the effects array exists on the timeline.
     */
    ensureArray(project: Project): void {
        if (!project.timeline.effects) {
            project.timeline.effects = []
        }
    }
}
