/**
 * Service for managing timeline playback
 * Handles play/pause/seek logic and animation frames
 */

export class PlaybackService {
  private animationFrameId: number | null = null
  private lastTimestamp: number | null = null
  private isPlaying = false

  /**
   * Start playback from current time or beginning if at end
   */
  play(
    currentTime: number,
    duration: number,
    onUpdate: (newTime: number) => void,
    onEnd?: () => void
  ): void {
    // If at the end of timeline, restart from beginning
    if (currentTime >= duration) {
      currentTime = 0
      onUpdate(0)
    }

    this.isPlaying = true
    this.lastTimestamp = null

    // Store current time in closure to track properly
    let playbackTime = currentTime

    const animate = (timestamp: number) => {
      if (!this.isPlaying) {
        this.animationFrameId = null
        return
      }

      if (this.lastTimestamp === null) {
        this.lastTimestamp = timestamp
      }

      const deltaTime = timestamp - this.lastTimestamp
      this.lastTimestamp = timestamp

      // Calculate new time
      playbackTime = playbackTime + deltaTime

      // Check if we've reached the end
      if (playbackTime >= duration) {
        this.pause()
        onUpdate(duration)
        onEnd?.()
      } else {
        // Update time and continue
        onUpdate(playbackTime)
        this.animationFrameId = requestAnimationFrame(animate)
      }
    }

    this.animationFrameId = requestAnimationFrame(animate)
  }

  /**
   * Pause playback and clean up animation frame
   */
  pause(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
      this.lastTimestamp = null
    }
    this.isPlaying = false
  }

  /**
   * Seek to a specific time
   */
  seek(time: number, duration: number): number {
    // Clamp time to valid range
    return Math.max(0, Math.min(duration, time))
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