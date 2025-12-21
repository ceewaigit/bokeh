/**
 * useAudioEnhancement - Register video elements with the AudioEnhancementManager
 *
 * The video element should NOT be muted - Web Audio controls all routing.
 */

import { useEffect, useRef } from 'react';
import { audioEnhancementManager } from '@/lib/audio/audio-enhancement-manager';

export function useAudioEnhancement(
  videoElement: HTMLVideoElement | null,
  enabled: boolean
) {
  const lastEnabled = useRef<boolean | null>(null);

  useEffect(() => {
    // Validate that we have a real HTMLVideoElement
    // OffthreadVideo and other non-DOM elements should be skipped
    if (!videoElement || !(videoElement instanceof HTMLVideoElement)) {
      lastEnabled.current = null;
      return;
    }

    // Additional check: ensure the element is in the DOM
    if (!videoElement.isConnected) {
      lastEnabled.current = null;
      return;
    }

    // Register on first encounter, update on subsequent changes
    if (!audioEnhancementManager.hasVideo(videoElement)) {
      audioEnhancementManager.registerVideoElement(videoElement, enabled);
      lastEnabled.current = enabled;
    } else if (lastEnabled.current !== enabled) {
      audioEnhancementManager.setVideoEnhanced(videoElement, enabled);
      lastEnabled.current = enabled;
    }

    // Cleanup: unregister when component unmounts or video element changes
    return () => {
      audioEnhancementManager.unregisterVideoElement(videoElement);
      lastEnabled.current = null;
    };
  }, [videoElement, enabled]);
}
