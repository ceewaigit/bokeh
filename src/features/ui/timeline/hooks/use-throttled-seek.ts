import { useRef, useCallback, useEffect } from 'react';
import { PlayerRef } from '@remotion/player';

const SCRUB_THROTTLE_MS = 125;

/**
 * Hook to throttle seek operations on a Remotion Player.
 * Reduces video decoder pressure during rapid scrubbing or frequent updates.
 */
export function useThrottledSeek(playerRef: React.RefObject<PlayerRef | null>) {
  const lastSeekTimeRef = useRef<number>(0);
  const pendingSeekRef = useRef<number | null>(null);
  const scrubTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const throttledSeek = useCallback((targetFrame: number) => {
    if (!playerRef.current) return;

    // Optimization: If frame is effectively the same, do nothing.
    const currentFrame = playerRef.current.getCurrentFrame();
    if (Math.abs(currentFrame - targetFrame) <= 1) {
      return;
    }

    const now = Date.now();
    const timeSinceLastSeek = now - lastSeekTimeRef.current;

    // If we're within throttle window, schedule this seek for later
    if (timeSinceLastSeek < SCRUB_THROTTLE_MS) {
      pendingSeekRef.current = targetFrame;

      // Clear existing timeout and set a new one (debounce-ish behavior)
      if (scrubTimeoutRef.current) {
        clearTimeout(scrubTimeoutRef.current);
      }

      scrubTimeoutRef.current = setTimeout(() => {
        if (pendingSeekRef.current !== null && playerRef.current) {
          const pendingCurrentFrame = playerRef.current.getCurrentFrame();
          // Double check if we still need to seek
          if (Math.abs(pendingCurrentFrame - pendingSeekRef.current) > 1) {
            playerRef.current.seekTo(pendingSeekRef.current);
            lastSeekTimeRef.current = Date.now();
          }
          pendingSeekRef.current = null;
        }
        scrubTimeoutRef.current = null;
      }, SCRUB_THROTTLE_MS - timeSinceLastSeek);

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
