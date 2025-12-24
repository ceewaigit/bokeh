/**
 * VTDecoder Memory Cleanup Utilities & Hooks
 *
 * macOS VTDecoderXPCService holds onto decoder resources unless we explicitly
 * clear the video src and call load() before the element is garbage collected.
 *
 * SSOT: All cleanup logic lives here, renderers just use hooks.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Cleanup a single video element's decoder resources.
 */
export function cleanupVideoDecoder(video: HTMLVideoElement): void {
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Cleanup all video elements within a container.
 */
export function cleanupVideoDecodersInContainer(
  container: HTMLElement | null,
  urlToCleanup?: string
): void {
  if (!container) return;

  const videos = container.querySelectorAll('video');
  videos.forEach((video) => {
    if (urlToCleanup) {
      if (video.src === urlToCleanup || video.currentSrc === urlToCleanup) {
        cleanupVideoDecoder(video);
      }
    } else {
      cleanupVideoDecoder(video);
    }
  });
}

// ============================================================================
// HOOKS (SSOT for cleanup logic)
// ============================================================================

/**
 * Hook for VTDecoder cleanup in Remotion-managed video containers.
 * Used by VideoClipRenderer for export rendering.
 */
export function useVideoContainerCleanup(videoUrl: string | undefined) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevVideoUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prevUrl = prevVideoUrlRef.current;
    if (prevUrl !== undefined && prevUrl !== videoUrl) {
      cleanupVideoDecodersInContainer(containerRef.current, prevUrl);
    }
    prevVideoUrlRef.current = videoUrl;
    return () => cleanupVideoDecodersInContainer(containerRef.current);
  }, [videoUrl]);

  return containerRef;
}

interface NativeVideoCleanupOptions {
  videoUrl: string | undefined;
  visible?: boolean;
  onPlay?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

interface NativeVideoCleanupResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  isVideoReady: boolean;
  setIsVideoReady: (ready: boolean) => void;
}

/**
 * Hook for VTDecoder cleanup with native video elements.
 * Used by PreviewVideoRenderer for interactive preview.
 *
 * Handles:
 * - Source changes with cleanup
 * - loadedmetadata tracking
 * - Unmount cleanup
 */
export function useNativeVideoCleanup({
  videoUrl,
  visible = true,
  onPlay,
  videoRef: providedRef,
}: NativeVideoCleanupOptions): NativeVideoCleanupResult {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = providedRef || internalRef;
  const lastSrcRef = useRef<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const prevUrl = lastSrcRef.current;
    if (prevUrl !== videoUrl) {
      setIsVideoReady(false);
      if (prevUrl) cleanupVideoDecoder(video);

      lastSrcRef.current = videoUrl;
      video.src = videoUrl;
      video.preload = 'auto';
      video.load();
    }

    const handleLoadedMetadata = () => {
      setIsVideoReady(true);
      onPlay?.();
    };

    if (video.readyState >= 1) setIsVideoReady(true);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      cleanupVideoDecoder(video);
    };
  }, [videoUrl, onPlay, videoRef]);

  return { videoRef, isVideoReady, setIsVideoReady };
}
