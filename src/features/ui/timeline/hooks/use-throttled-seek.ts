import { useRef, useCallback, useEffect } from 'react';
import { PlayerRef } from '@remotion/player';

// PERFORMANCE: Adaptive throttling for responsive scrubbing
// Small seeks (< 10 frames): 16ms (~60fps) for snappy response
// Large seeks (> 10 frames): 32ms (~30fps) to let decoder catch up
const BASE_THROTTLE_MS = 16;
const MAX_THROTTLE_MS = 32;
const LARGE_SEEK_THRESHOLD = 10; // frames

/**
 * Hook to throttle seek operations on a Remotion Player.
 * Uses adaptive throttling - smaller seeks get faster response.
 */
export function useThrottledSeek(playerRef: React.RefObject<PlayerRef | null>) {
  const lastSeekTimeRef = useRef<number>(0);
  const pendingSeekRef = useRef<number | null>(null);
  const scrubTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const throttledSeek = useCallback((targetFrame: number) => {
    if (!playerRef.current) return;

    const currentFrame = playerRef.current.getCurrentFrame();
    const frameDelta = Math.abs(currentFrame - targetFrame);

    // Skip if effectively same frame
    if (frameDelta <= 1) {
      return;
    }

    const now = Date.now();
    const timeSinceLastSeek = now - lastSeekTimeRef.current;

    // Adaptive throttle: smaller seeks = faster response, larger seeks = more time for decoder
    const dynamicThrottle = frameDelta > LARGE_SEEK_THRESHOLD ? MAX_THROTTLE_MS : BASE_THROTTLE_MS;

    // If we're within throttle window, schedule this seek for later
    if (timeSinceLastSeek < dynamicThrottle) {
      pendingSeekRef.current = targetFrame;

      // Clear existing timeout and set a new one
      if (scrubTimeoutRef.current) {
        clearTimeout(scrubTimeoutRef.current);
      }

      const remainingTime = dynamicThrottle - timeSinceLastSeek;
      scrubTimeoutRef.current = setTimeout(() => {
        if (pendingSeekRef.current !== null && playerRef.current) {
          const pendingCurrentFrame = playerRef.current.getCurrentFrame();
          if (Math.abs(pendingCurrentFrame - pendingSeekRef.current) > 1) {
            playerRef.current.seekTo(pendingSeekRef.current);
            lastSeekTimeRef.current = Date.now();
          }
          pendingSeekRef.current = null;
        }
        scrubTimeoutRef.current = null;
      }, remainingTime);

      return;
    }

    // Seek immediately
    playerRef.current.seekTo(targetFrame);
    lastSeekTimeRef.current = now;
  }, [playerRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrubTimeoutRef.current) {
        clearTimeout(scrubTimeoutRef.current);
        scrubTimeoutRef.current = null;
      }
    };
  }, []);

  return throttledSeek;
}
