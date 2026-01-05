/**
 * usePlayheadState - Computed hook for playhead state
 *
 * This replaces the stored playheadClip/playheadRecording/nextClip/nextRecording
 * in project-store with a computed value. The playhead state is derived from
 * currentTime and currentProject, making it impossible to get out of sync.
 *
 * Uses prevState optimization for battery efficiency during playback.
 */
import { useRef, useMemo } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { PlayheadService, type PlayheadState } from '@/features/ui/timeline/playback/playhead-service'

/**
 * Hook to get computed playhead state.
 * Automatically updates when currentTime or clips change.
 * Uses prevState optimization to avoid expensive recalculation during playback.
 */
export function usePlayheadState(): PlayheadState {
  const currentTime = useProjectStore((s) => s.currentTime)
  const currentProject = useProjectStore((s) => s.currentProject)

  // Track previous state for optimization (same clip check)
  const prevStateRef = useRef<PlayheadState | undefined>(undefined)

  const playheadState = useMemo(() => {
    const newState = PlayheadService.updatePlayheadState(
      currentProject,
      currentTime,
      prevStateRef.current
    )
    prevStateRef.current = newState
    return newState
  }, [currentProject, currentTime])

  return playheadState
}

/**
 * Utility function to compute playhead state for use in store actions.
 * Call this when you need playhead state inside a store action (not a component).
 */
export function computePlayheadState(): PlayheadState {
  const state = useProjectStore.getState()
  return PlayheadService.updatePlayheadState(
    state.currentProject,
    state.currentTime
  )
}
