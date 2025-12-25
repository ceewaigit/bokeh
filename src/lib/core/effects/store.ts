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
 */

import type { Effect, Project } from '@/types/project'

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
     */
    add(project: Project, effect: Effect): void {
        if (!project.timeline.effects) {
            project.timeline.effects = []
        }
        project.timeline.effects.push(effect)
        project.modifiedAt = new Date().toISOString()
    },

    /**
     * Add multiple effects to the project.
     */
    addMany(project: Project, effects: Effect[]): void {
        if (!project.timeline.effects) {
            project.timeline.effects = []
        }
        project.timeline.effects.push(...effects)
        project.modifiedAt = new Date().toISOString()
    },

    /**
     * Remove an effect from the project by ID.
     * Returns true if the effect was found and removed.
     */
    remove(project: Project, effectId: string): boolean {
        const effects = project.timeline.effects ?? []
        const index = effects.findIndex(e => e.id === effectId)

        if (index !== -1) {
            effects.splice(index, 1)
            project.modifiedAt = new Date().toISOString()
            return true
        }

        return false
    },

    /**
     * Update an effect in the project.
     * Performs a shallow merge of updates with the existing effect.
     * Deep merges the data property to preserve existing data fields.
     * Returns true if the effect was found and updated.
     */
    update(project: Project, effectId: string, updates: Partial<Effect>): boolean {
        const effect = this.get(project, effectId)
        if (!effect) return false

        // Deep merge data object to preserve existing properties
        if (updates.data && effect.data) {
            Object.assign(effect, updates, {
                data: { ...effect.data, ...updates.data }
            })
        } else {
            Object.assign(effect, updates)
        }

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
