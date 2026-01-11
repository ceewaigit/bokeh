/**
 * Service for managing timeline playback state
 * 
 * REFACTORED: This service no longer drives time advancement.
 * The Remotion Player is the single source of truth for frame position.
 * This service now only manages play/pause state and time clamping.
 */

import { useTimeStore } from '@/features/ui/timeline/stores/time-store'

export class PlaybackService {
  private isPlaying = false

  /**
   * Start playback - just sets state, Player drives time
   * @param currentTime - Current time in ms (for restart-from-beginning check)
   * @param duration - Timeline duration in ms
   * @param onRestart - Callback if time resets to 0 (was at end)
   */
  play(
    currentTime: number,
    duration: number,
    onRestart?: () => void
  ): void {
    // If at the end of timeline, restart from beginning
    if (currentTime >= duration) {
      onRestart?.()
    }

    this.isPlaying = true
  }

  /**
   * Pause playback - just sets state
   */
  pause(): void {
    this.isPlaying = false
  }

  /**
   * Seek to a specific time (clamped to valid range)
   * Automatically notifies timeObserver for UI sync.
   */
  seek(time: number, duration: number, fps: number = 30): number {
    // Seeking to the exact end (`time === duration`) can cause the renderer/video to show an
    // empty/black frame because it maps to the *next* frame boundary in rounding code paths.
    // Clamp to slightly before the end (center of the last frame) to guarantee a renderable frame.
    const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30
    const frameDurationMs = 1000 / safeFps
    const safeEndTime = Math.max(0, duration - frameDurationMs * 0.5)
    const clamped = Math.max(0, Math.min(safeEndTime, time))
    useTimeStore.getState().setTime(clamped)
    return clamped
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.pause()
  }
}

// Export singleton instance
export const playbackService = new PlaybackService()
