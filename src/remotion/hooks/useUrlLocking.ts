import { useRef } from 'react'

/**
 * Hook to lock a URL value to prevent mid-session switches
 * that cause video decoder reloads and blank displays.
 *
 * Key insight: Lock the FIRST valid URL we get for a recording
 * and only update when the recording changes. This prevents
 * flickering between proxy and full-source URLs.
 *
 * @param computedUrl - The current computed URL
 * @param isPlaying - Whether playback is active (not used currently, kept for API compat)
 * @param invalidateKey - Key to trigger lock invalidation (e.g., recording ID)
 * @returns The locked URL
 *
 * @example
 * const videoUrl = useUrlLocking(computedUrl, isPlaying, recording?.id)
 */
export function useUrlLocking(
  computedUrl: string | undefined,
  isPlaying: boolean,
  invalidateKey?: string
): string | undefined {
  const lockedUrlRef = useRef<string | undefined>(undefined)
  const lockedKeyRef = useRef<string | undefined>(undefined)

  if (invalidateKey !== lockedKeyRef.current) {
    // Key changed (e.g., different recording) - lock the new URL
    lockedUrlRef.current = computedUrl
    lockedKeyRef.current = invalidateKey
  } else if (!lockedUrlRef.current && computedUrl) {
    // First time getting a valid URL for this recording - lock it
    lockedUrlRef.current = computedUrl
  }
  // Otherwise, keep the locked URL (even if computedUrl changes)

  return lockedUrlRef.current ?? computedUrl
}
