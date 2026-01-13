/**
 * Playback Slice
 *
 * Manages playback state and controls.
 * - Play/pause
 * - Seek
 * - Timeline zoom
 * 
 * Timeline-Centric Architecture:
 * - Hidden regions are handled by the player sync via getGlobalTimelineSkips()
 * - Duration is the full timeline duration (no collapsing)
 * - seekFromPlayer no longer needs to skip regions here (handled by usePlayerSync)
 */

import { playbackService } from '@/features/playback/services/playback-service'
import type { CreatePlaybackSlice, ProjectStore } from './types'

const seekTo = (state: Pick<ProjectStore, 'currentProject'>, time: number): number => {
  // Timeline-Centric: Use raw timeline duration
  const duration = state.currentProject?.timeline.duration ?? 0
  return playbackService.seek(time, duration)
}

export const createPlaybackSlice: CreatePlaybackSlice = (set, get) => ({
  // State
  currentTime: 0,
  isPlaying: false,
  isScrubbing: false,
  hoverTime: null,
  zoom: 0.5,
  zoomManuallyAdjusted: false,

  // Actions
  play: () => {
    const state = get()
    if (!state.currentProject) return

    // Timeline-Centric: Use raw timeline duration
    const duration = state.currentProject.timeline.duration

    playbackService.play(
      state.currentTime,
      duration,
      () => {
        set((s) => {
          s.currentTime = 0
          seekTo(state, 0)
        })
      }
    )

    set({ isPlaying: true, hoverTime: null })
  },

  pause: () => {
    playbackService.pause()
    set({ isPlaying: false })
  },


  seek: (time) => {
    set((state) => {
      state.currentTime = seekTo(state, time)
    })
  },

  seekFromPlayer: (time) => {
    set((state) => {
      // Timeline-Centric: Hidden region skipping is handled by usePlayerSync
      // This method just updates the store with the player's current time
      state.currentTime = seekTo(state, time)
    })
  },

  setScrubbing: (isScrubbing) => {
    set((state) => {
      state.isScrubbing = isScrubbing
    })
  },

  setHoverTime: (time) => {
    set((state) => {
      state.hoverTime = time
    })
  },

  setZoom: (zoom, isManual = true) => {
    set((state) => {
      state.zoom = Math.max(0.1, Math.min(10, zoom))
      if (isManual) {
        state.zoomManuallyAdjusted = true
      }
    })
  },

  setAutoZoom: (zoom) => {
    set((state) => {
      // Only set auto zoom if user hasn't manually adjusted
      if (!state.zoomManuallyAdjusted) {
        state.zoom = Math.max(0.1, Math.min(10, zoom))
      }
    })
  }
})
