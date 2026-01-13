/**
 * Store Utilities
 *
 * Helpers for store mutations and performance optimizations.
 */

import { useRef, useCallback, useSyncExternalStore } from 'react'
import type { Project } from '@/types/project'

// ============================================
// Throttled Selectors for Performance
// ============================================

/**
 * Creates a throttled selector that only updates at a specified interval.
 * Useful for values that change frequently (like currentTime at 30fps)
 * but where UI doesn't need every update.
 *
 * @param store - Zustand store with subscribe method
 * @param selector - Function to select value from state
 * @param throttleMs - Minimum time between updates (default: 100ms)
 */
export function useThrottledSelector<T, S>(
  store: {
    getState: () => S
    subscribe: (listener: (state: S) => void) => () => void
  },
  selector: (state: S) => T,
  throttleMs: number = 100
): T {
  const lastValueRef = useRef<T>(selector(store.getState()))
  const lastUpdateRef = useRef<number>(0)

  const getSnapshot = useCallback(() => {
    const now = performance.now()
    if (now - lastUpdateRef.current >= throttleMs) {
      lastValueRef.current = selector(store.getState())
      lastUpdateRef.current = now
    }
    return lastValueRef.current
  }, [store, selector, throttleMs])

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return store.subscribe(() => {
        const now = performance.now()
        if (now - lastUpdateRef.current >= throttleMs) {
          onStoreChange()
        }
      })
    },
    [store, throttleMs]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Creates a change-threshold selector that only updates when the value
 * changes by more than a specified threshold. Useful for continuous
 * numeric values like time or position.
 *
 * @param store - Zustand store
 * @param selector - Function to select numeric value
 * @param threshold - Minimum change to trigger update (default: 1)
 */
export function useThresholdSelector<S>(
  store: {
    getState: () => S
    subscribe: (listener: (state: S) => void) => () => void
  },
  selector: (state: S) => number,
  threshold: number = 1
): number {
  const lastValueRef = useRef<number>(selector(store.getState()))

  const getSnapshot = useCallback(() => {
    const current = selector(store.getState())
    if (Math.abs(current - lastValueRef.current) >= threshold) {
      lastValueRef.current = current
    }
    return lastValueRef.current
  }, [store, selector, threshold])

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return store.subscribe(() => {
        const current = selector(store.getState())
        if (Math.abs(current - lastValueRef.current) >= threshold) {
          onStoreChange()
        }
      })
    },
    [store, selector, threshold]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Mark the current project as modified.
 * Use this in all slice mutations that change project data.
 *
 * @param state - The store state with currentProject
 * @returns true if project was marked modified, false if no project
 */
export function markProjectModified(state: { currentProject: Project | null }): boolean {
  if (!state.currentProject) return false
  state.currentProject.modifiedAt = new Date().toISOString()
  return true
}

/**
 * Mark a project as modified (direct project reference version).
 */
export function markModified(project: Project): void {
  project.modifiedAt = new Date().toISOString()
}

/**
 * Clear camera path cache to trigger recalculation.
 * Use this when project settings that affect camera path change.
 *
 * @param state - The store state with cameraPathCache fields
 */
export function clearCameraPathCache(state: {
  cameraPathCache: unknown
  cameraPathCacheDimensions: unknown
}): void {
  state.cameraPathCache = null
  state.cameraPathCacheDimensions = null
}
