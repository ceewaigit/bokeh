/**
 * Playback Slice
 *
 * Manages playback state and controls.
 * - Play/pause
 * - Seek
 * - Timeline zoom
 */

import { playbackService } from '@/lib/timeline/playback-service'
import type { CreatePlaybackSlice } from './types'

export const createPlaybackSlice: CreatePlaybackSlice = (set, get) => ({
  // State
  currentTime: 0,
  isPlaying: false,
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
          // playhead state computed via hook
        })
      }
    )

    set({ isPlaying: true })
  },

  pause: () => {
    playbackService.pause()
    set({ isPlaying: false })
  },


  seek: (time) => {
    set((state) => {
      const duration = state.currentProject?.timeline?.duration || 0
      state.currentTime = playbackService.seek(time, duration)
      // playhead state computed via hook
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
