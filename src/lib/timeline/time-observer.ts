/**
 * Time Observer Service
 * 
 * ARCHITECTURE:
 * The Remotion Player is the source of truth for time during playback.
 * This service:
 * 1. Polls the player using requestAnimationFrame during playback
 * 2. Pushes time updates to subscribers (playhead, timecode display)
 * 3. Throttles store updates for persistence
 * 
 * This approach is used by professional video editors because:
 * - RAF runs independently of React's render cycle
 * - It doesn't depend on effect timing or event listeners
 * - Copy/paste and other operations can't break it
 */

import type { PlayerRef } from '@remotion/player'

type TimeListener = (timeMs: number) => void

class TimeObserverService {
    private currentTime: number = 0
    private listeners: Set<TimeListener> = new Set()
    private playerRef: React.RefObject<PlayerRef | null> | null = null
    private rafId: number | null = null
    private isPolling: boolean = false
    private fps: number = 60
    private lastStoreUpdateMs: number = 0

    /**
     * Get current time (synchronous read)
     */
    getTime(): number {
        return this.currentTime
    }

    /**
     * Push time update (for external sources like scrubbing)
     */
    pushTime(timeMs: number): void {
        if (Math.abs(this.currentTime - timeMs) < 0.5) return
        this.currentTime = timeMs
        for (const listener of this.listeners) {
            listener(timeMs)
        }
    }

    /**
     * Subscribe to time updates. Returns unsubscribe function.
     */
    subscribe(listener: TimeListener): () => void {
        this.listeners.add(listener)
        listener(this.currentTime) // Immediate sync
        return () => this.listeners.delete(listener)
    }

    /**
     * Connect to Remotion Player for RAF-based polling.
     * Call this once when the preview area mounts.
     */
    connect(playerRef: React.RefObject<PlayerRef | null>, fps: number): void {
        this.playerRef = playerRef
        this.fps = fps
    }

    /**
     * Start polling the player using RAF.
     * Call when playback starts.
     */
    startPolling(storeSeekCallback?: (timeMs: number) => void): void {
        if (this.isPolling) return
        this.isPolling = true

        const poll = () => {
            if (!this.isPolling) return

            const player = this.playerRef?.current
            if (player) {
                try {
                    const frame = player.getCurrentFrame()
                    const timeMs = (frame / this.fps) * 1000

                    // Always push to observers for immediate UI update
                    if (Math.abs(this.currentTime - timeMs) >= 0.5) {
                        this.currentTime = timeMs
                        for (const listener of this.listeners) {
                            listener(timeMs)
                        }
                    }

                    // Throttle store updates to 30fps
                    const now = performance.now()
                    if (storeSeekCallback && now - this.lastStoreUpdateMs >= 1000 / 30) {
                        this.lastStoreUpdateMs = now
                        storeSeekCallback(timeMs)
                    }
                } catch {
                    // Player not ready, continue polling
                }
            }

            this.rafId = requestAnimationFrame(poll)
        }

        this.rafId = requestAnimationFrame(poll)
    }

    /**
     * Stop polling. Call when playback stops.
     */
    stopPolling(): void {
        this.isPolling = false
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId)
            this.rafId = null
        }
    }

    /**
     * Reset on project cleanup
     */
    reset(): void {
        this.stopPolling()
        this.currentTime = 0
        this.playerRef = null
        for (const listener of this.listeners) {
            listener(0)
        }
    }
}

export const timeObserver = new TimeObserverService()
