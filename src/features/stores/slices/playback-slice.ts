/**
 * Playback Slice
 *
 * Manages playback state and controls.
 * - Play/pause
 * - Seek
 * - Timeline zoom
 */

import { playbackService } from '@/features/timeline/playback/playback-service'
import type { CreatePlaybackSlice, ProjectStore } from './types'

const seekTo = (state: Pick<ProjectStore, 'currentProject'>, time: number): number => {
  const duration = state.currentProject?.timeline?.duration || 0
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

    // Call playbackService with restart callback (if at end, reset to 0)
    playbackService.play(
      state.currentTime,
      state.currentProject.timeline.duration,
      () => {
        set((s) => {
          s.currentTime = 0
          // Notify observer of reset
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
      // During playback, we update the store but don't need to push back to observer
      // because the observer (via RAF) is the one calling this.
      // However, calling playbackService.seek is safe as pushTime has a guard.
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
