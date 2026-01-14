/**
 * VTDecoder Memory Cleanup Utilities & Hooks
 *
 * macOS VTDecoderXPCService holds onto decoder resources unless we explicitly
 * clear the video src and call load() before the element is garbage collected.
 *
 * SSOT: All cleanup logic lives here, renderers just use hooks.
 */

import { useEffect, useRef } from 'react';

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

function cleanupTrackedVideos(
  videos: HTMLVideoElement[] | null,
  urlToCleanup?: string
): void {
  if (!videos || videos.length === 0) return;
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
  const trackedVideosRef = useRef<HTMLVideoElement[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    trackedVideosRef.current = Array.from(container.querySelectorAll('video'));
  });

  useEffect(() => {
    const container = containerRef.current;
    const prevUrl = prevVideoUrlRef.current;
    if (prevUrl !== undefined && prevUrl !== videoUrl) {
      cleanupVideoDecodersInContainer(container, prevUrl);
      cleanupTrackedVideos(trackedVideosRef.current, prevUrl);
    }
    prevVideoUrlRef.current = videoUrl;
    return () => {
      cleanupVideoDecodersInContainer(container);
      cleanupTrackedVideos(trackedVideosRef.current);
    };
  }, [videoUrl]);

  return containerRef;
}
