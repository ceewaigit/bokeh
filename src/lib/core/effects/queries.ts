/**
 * Effect Queries - Filtering and querying utilities for effects
 * 
 * This module provides efficient query functions for filtering effects
 * by type, clip, time range, etc. without mutating the source data.
 */

import type { Effect, Project, EffectType } from '@/types/project'
import { EffectStore } from './store'

/**
 * EffectQueries - Query utilities for filtering effects.
 * All queries are read-only and return new arrays.
 */
export const EffectQueries = {
    /**
     * Get effects of a specific type.
     */
    byType<T extends Effect = Effect>(
        project: Project,
        type: EffectType
    ): T[] {
        return EffectStore.getAll(project).filter(e => e.type === type) as T[]
    },

    /**
     * Get effects bound to a specific clip.
     * Effects can be bound via clipId property.
     */
    byClip(project: Project, clipId: string): Effect[] {
        return EffectStore.getAll(project).filter(e => e.clipId === clipId)
    },

    /**
     * Get effects active at a specific time.
     * An effect is "active" if its time range overlaps the given time.
     */
    atTime(project: Project, timeMs: number): Effect[] {
        return EffectStore.getAll(project).filter(e =>
            e.enabled !== false &&
            timeMs >= e.startTime &&
            timeMs <= e.endTime
        )
    },

    /**
     * Get effects active within a time range.
     * Returns effects that overlap with the specified range.
     */
    inTimeRange(project: Project, startMs: number, endMs: number): Effect[] {
        return EffectStore.getAll(project).filter(e =>
            e.enabled !== false &&
            e.startTime < endMs &&
            e.endTime > startMs
        )
    },

    /**
     * Get effects of a specific type that are active at a given time.
     */
    byTypeAtTime<T extends Effect = Effect>(
        project: Project,
        type: EffectType,
        timeMs: number
    ): T[] {
        return EffectStore.getAll(project).filter(e =>
            e.type === type &&
            e.enabled !== false &&
            timeMs >= e.startTime &&
            timeMs <= e.endTime
        ) as T[]
    },

    /**
     * Get enabled effects only.
     */
    enabled(project: Project): Effect[] {
        return EffectStore.getAll(project).filter(e => e.enabled !== false)
    },

    /**
     * Get global effects (effects without a clipId binding).
     * These typically apply to the entire timeline.
     */
    global(project: Project): Effect[] {
        return EffectStore.getAll(project).filter(e => !e.clipId)
    },

    /**
     * Get effects matching a predicate.
     */
    filter(project: Project, predicate: (effect: Effect) => boolean): Effect[] {
        return EffectStore.getAll(project).filter(predicate)
    },

    /**
     * Find the first effect matching a predicate.
     */
    findFirst(project: Project, predicate: (effect: Effect) => boolean): Effect | undefined {
        return EffectStore.getAll(project).find(predicate)
    },

    /**
     * Count effects matching a predicate.
     */
    count(project: Project, predicate?: (effect: Effect) => boolean): number {
        const effects = EffectStore.getAll(project)
        return predicate ? effects.filter(predicate).length : effects.length
    },

    /**
     * Check if any effects match a predicate.
     */
    some(project: Project, predicate: (effect: Effect) => boolean): boolean {
        return EffectStore.getAll(project).some(predicate)
    }
}
