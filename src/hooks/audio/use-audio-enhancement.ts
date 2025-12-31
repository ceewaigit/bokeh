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

    const ensureRegistered = () => {
      if (!audioEnhancementManager.hasVideo(videoElement)) {
        audioEnhancementManager.registerVideoElement(videoElement, true);
      }
      audioEnhancementManager.setVideoEnhanced(videoElement, true);
      lastEnabled.current = true;
    };

    const ensureUnregistered = () => {
      if (audioEnhancementManager.hasVideo(videoElement)) {
        audioEnhancementManager.unregisterVideoElement(videoElement);
      }
      lastEnabled.current = false;
    };

    // Only attach WebAudio graph when enhancement is enabled and video is playing.
    if (!enabled) {
      ensureUnregistered();
      return;
    }

    const handlePlay = () => ensureRegistered();
    const handlePause = () => ensureUnregistered();

    if (!videoElement.paused && !videoElement.ended) {
      ensureRegistered();
    } else {
      ensureUnregistered();
    }

    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('playing', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('ended', handlePause);
    videoElement.addEventListener('emptied', handlePause);

    // Cleanup: unregister and remove listeners when component unmounts or video element changes
    return () => {
      ensureUnregistered();
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('playing', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('ended', handlePause);
      videoElement.removeEventListener('emptied', handlePause);
    };
  }, [videoElement, enabled]);
}
