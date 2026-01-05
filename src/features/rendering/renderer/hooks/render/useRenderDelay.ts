/**
 * Hook for managing Remotion's delayRender/continueRender mechanism.
 * Prevents blank first frames by waiting for video to be ready before rendering.
 */

import { useCallback, useEffect, useRef } from 'react';
import { delayRender, continueRender, useCurrentFrame } from 'remotion';
import type { UseRenderDelayResult } from '@/types';

/**
 * Manages render delay for video elements during export.
 * Waits for video to be seeked and have a painted frame before allowing render.
 */
export function useRenderDelay(isRendering: boolean): UseRenderDelayResult {
  const currentFrame = useCurrentFrame();

  const renderReadyRef = useRef(!isRendering);
  const renderDelayHandleRef = useRef<number | null>(null);
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markRenderReady = useCallback((_reason?: string) => {
    if (!isRendering) return;
    if (renderReadyRef.current) return;

    renderReadyRef.current = true;

    if (readyTimeoutRef.current) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
    if (renderDelayHandleRef.current != null) {
      continueRender(renderDelayHandleRef.current);
      renderDelayHandleRef.current = null;
    }
  }, [isRendering]);

  // Enhanced handler that ensures the video frame is actually painted before continuing render.
  // onLoadedData/onCanPlay/onCanPlayThrough can fire before the frame is visible on screen.
  // We wait for onSeeked (which fires after seeking to startFrom) and use requestAnimationFrame
  // to ensure the browser has actually painted the frame.
  const handleVideoReady = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!isRendering || renderReadyRef.current) return;

    const video = event.currentTarget;

    // Check video readyState - should be at least HAVE_CURRENT_DATA (2) to have a frame
    if (video.readyState < 2) {
      return; // Wait for more data
    }

    // Use requestVideoFrameCallback if available (Chrome/Edge) for precise frame timing
    // Otherwise fall back to double requestAnimationFrame to ensure paint
    if ('requestVideoFrameCallback' in video) {
      (video as any).requestVideoFrameCallback(() => {
        markRenderReady('video-frame-callback');
      });
    } else {
      // Double rAF ensures the browser has actually painted the frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          markRenderReady('raf-double');
        });
      });
    }
  }, [isRendering, markRenderReady]);

  useEffect(() => {
    if (!isRendering) return;
    if (renderReadyRef.current) return;

    if (renderDelayHandleRef.current == null) {
      renderDelayHandleRef.current = delayRender('Waiting for first video to load');
    }

    if (!readyTimeoutRef.current) {
      // Safety valve to avoid hanging renders if the media element never fires events.
      // Increased to 10s for headless rendering which can be slower
      readyTimeoutRef.current = setTimeout(() => {
        markRenderReady('timeout-safety');
      }, 10000);
    }

    return () => {
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
      // Ensure we never leave a render handle hanging during unmount/teardown.
      if (renderDelayHandleRef.current != null) {
        continueRender(renderDelayHandleRef.current);
        renderDelayHandleRef.current = null;
      }
    };
  }, [currentFrame, isRendering, markRenderReady]);

  return { markRenderReady, handleVideoReady };
}
