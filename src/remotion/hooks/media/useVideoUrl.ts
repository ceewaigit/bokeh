/**
 * Resolve video URL for a recording with smart resolution selection
 *
 * Handles both preview (proxy/blob URLs) and export (file URLs) environments.
 * Uses proxy when sufficient for target × zoom × retina, otherwise full source.
 *
 * Key insight: Once a source is selected for a clip, it stays consistent
 * throughout playback - no switching means no blink.
 * 
 * PROXY URL RESOLUTION:
 * Proxy URLs are stored in an ephemeral store (cache-slice.proxyUrls) to avoid
 * triggering cache invalidation when proxies complete. This hook checks the
 * ephemeral store first, then falls back to recording properties for backward
 * compatibility with projects that have proxy URLs baked in.
 */

import { useMemo, useRef } from 'react';
import { getRemotionEnvironment } from 'remotion';
import { RecordingStorage } from '@/lib/storage/recording-storage';
import { useProjectStore } from '@/stores/project-store';
import type { UseVideoUrlProps } from '@/types';

// Re-export shared utilities for backwards compatibility
export {
  getMaxZoomScale,
  isProxySufficientForTarget,
  isProxySufficientForExport,
  isSourceOverkillForPreview,
  PROXY_WIDTH,
  PROXY_HEIGHT,
  PREVIEW_DISPLAY_WIDTH,
  PREVIEW_DISPLAY_HEIGHT,
  RETINA_MULTIPLIER,
} from '@/lib/utils/resolution-utils';

import {
  isProxySufficientForTarget,
  isProxySufficientForExport,
  PREVIEW_DISPLAY_WIDTH,
  PREVIEW_DISPLAY_HEIGHT,
  RETINA_MULTIPLIER,
  isSourceOverkillForPreview,
} from '@/lib/utils/resolution-utils';

export function useVideoUrl({
  recording,
  resources,
  clipId,
  preferOffthreadVideo: _preferOffthreadVideo,
  targetWidth = 1280,
  targetHeight = 720,
  maxZoomScale = 1,
  isGlowMode = false,
  forceProxy = false,
  isHighQualityPlaybackEnabled = false,
  isPlaying = false,
  isScrubbing = false,
}: UseVideoUrlProps & { isScrubbing?: boolean }): string | undefined {
  const { isRendering } = getRemotionEnvironment();
  const { videoUrls, videoUrlsHighRes } = resources || {};

  // Get proxy URLs from ephemeral store (first priority) with recording fallback
  const ephemeralProxyUrls = useProjectStore((s) => recording ? s.proxyUrls[recording.id] : undefined);

  // Helper to resolve proxy URL: ephemeral store first, then recording property
  const getProxyUrl = (type: 'preview' | 'glow' | 'scrub'): string | undefined => {
    if (!recording) return undefined;
    if (type === 'preview') {
      return ephemeralProxyUrls?.previewProxyUrl || recording.previewProxyUrl;
    }
    if (type === 'glow') {
      return ephemeralProxyUrls?.glowProxyUrl || recording.glowProxyUrl;
    }
    return ephemeralProxyUrls?.scrubProxyUrl || recording.scrubProxyUrl;
  };

  const computedUrl = useMemo(() => {
    if (!recording) return undefined;
    if (recording.sourceType === 'generated') return undefined;

    // Resolve proxy URLs: ephemeral store first, then recording property fallback
    const previewProxyUrl = ephemeralProxyUrls?.previewProxyUrl || recording.previewProxyUrl;
    const glowProxyUrl = ephemeralProxyUrls?.glowProxyUrl || recording.glowProxyUrl;
    const scrubProxyUrl = ephemeralProxyUrls?.scrubProxyUrl || recording.scrubProxyUrl;

    // Use maxZoomScale (stable) instead of currentZoomScale (frame-varying)
    // to prevent URL switching during zoom animations which causes VTDecoder churn
    const zoomScaleForQuality = Math.max(maxZoomScale || 1, 1);

    // PRIORITY 0: Force proxy during scrubbing for performance
    if (isScrubbing) {
      if (scrubProxyUrl) {
        return scrubProxyUrl;
      }
      if (previewProxyUrl) {
        return previewProxyUrl;
      }
    }


    // Glow player (64×36) always uses proxy
    // No point decoding 5K when output is 64px wide
    if (isGlowMode) {
      // PRIORITY 0: Specific glow proxy (super low res)
      if (glowProxyUrl) {
        return glowProxyUrl;
      }

      if (previewProxyUrl) {
        return previewProxyUrl;
      } else {
        // console.warn(`[useVideoUrl] ⚠️ GLOW has NO proxy, will use full source: ${recording.id}`);
      }
    }
    // Previously, switching to proxy on play caused VTDecoder churn every start/stop
    // Now we use consistent resolution logic regardless of playback state

    // KISS: In preview, prefer proxy for performance unless user explicitly asked for high quality.
    if (!isRendering && !isHighQualityPlaybackEnabled && previewProxyUrl) {
      return previewProxyUrl;
    }

    // Force proxy for preload videos
    // Preload shows first frame briefly - doesn't need full resolution
    if (forceProxy && previewProxyUrl) {
      return previewProxyUrl;
    }

    if (isRendering) {
      const proxyUrl = videoUrls?.[recording.id];
      const highResUrl = videoUrlsHighRes?.[recording.id];

      if (proxyUrl && highResUrl && proxyUrl !== highResUrl) {
        const proxySufficient = isProxySufficientForExport(
          targetWidth,
          targetHeight,
          zoomScaleForQuality
        );
        return proxySufficient ? proxyUrl : highResUrl;
      }

      if (proxyUrl) {
        return proxyUrl;
      }
      if (highResUrl) {
        return highResUrl;
      }
    }

    // PRIORITY 2: Fallback to any available videoUrls (non-export mode)
    if (videoUrls?.[recording.id]) {
      return videoUrls[recording.id];
    }

    // PRIORITY 3: Smart proxy selection with resolution capping
    if (previewProxyUrl) {
      const sourceWidth = recording.width || 1920;
      const sourceHeight = recording.height || 1080;

      // Check if proxy is sufficient for the target composition
      const proxySufficient = isProxySufficientForTarget(targetWidth, targetHeight, zoomScaleForQuality);
      const sourceOverkill = isSourceOverkillForPreview(sourceWidth, sourceHeight, zoomScaleForQuality);

      // USER PREFERENCE: If high-res preview is enabled, only use proxy if truly sufficient
      // Don't apply sourceOverkill optimization - user wants quality preview
      // USER PREFERENCE: If high-res preview is enabled, prioritize full source
      // We only use proxy if it's explicitly forced or if we really can't load the source
      if (isHighQualityPlaybackEnabled) {
        // Use proxy only when it is sufficient AND source is overkill for the preview display.
        // This preserves visible quality while avoiding needless full-res decodes.
        if (proxySufficient && sourceOverkill) {
          return previewProxyUrl;
        }
      } else {
        // MEMORY OPTIMIZATION: When high-res preview is disabled, be aggressive about using proxy
        // Calculate max useful resolution for preview display
        const maxUsefulWidth = PREVIEW_DISPLAY_WIDTH * RETINA_MULTIPLIER * zoomScaleForQuality;
        const maxUsefulHeight = PREVIEW_DISPLAY_HEIGHT * RETINA_MULTIPLIER * zoomScaleForQuality;

        // If source resolution exceeds what preview can actually use by >20%, use proxy
        // Use proxy if: proxy is sufficient for quality OR source is overkill for display
        if (proxySufficient || sourceOverkill) {
          return previewProxyUrl;
        }
      }
    }

    // PRIORITY 4: Preview mode - use blob URL cache
    const cachedUrl = RecordingStorage.getBlobUrl(recording.id);
    if (cachedUrl) {
      return cachedUrl;
    }

    // PRIORITY 5: Fallback to video-stream protocol
    // Include folderPath context for proper path resolution
    if (recording.filePath) {
      if (recording.filePath.startsWith('data:')) {
        return recording.filePath;
      }

      // If we have an absolute folderPath, construct the full path
      if (recording.folderPath && recording.folderPath.startsWith('/')) {
        // folderPath is absolute to the recording folder (e.g., /path/to/project/recording-123)
        // filePath is relative (e.g., recording-123/recording-123.mov)
        // The file is inside folderPath, using just the basename of filePath
        const fileName = recording.filePath.split('/').pop() || recording.filePath;
        const fullPath = `${recording.folderPath}/${fileName}`;
        return `video-stream://local/${encodeURIComponent(fullPath)}`;
      }
      return `video-stream://local/${encodeURIComponent(recording.filePath)}`;
    }

    return `video-stream://${recording.id}`;
  }, [recording, isRendering, videoUrls, videoUrlsHighRes, targetWidth, targetHeight, maxZoomScale, isGlowMode, forceProxy, isHighQualityPlaybackEnabled, isScrubbing, ephemeralProxyUrls]);

  // Use URL locking to prevent mid-playback URL switches that cause video reloads
  // Merged from useUrlLocking logic:
  // Include clipId in key so lock invalidates when active clip changes (e.g., after deletion)
  const lockedUrlRef = useRef<string | undefined>(undefined);
  const lockedKeyRef = useRef<string | undefined>(undefined);
  const invalidateKey = `${recording?.id ?? ''}-${clipId ?? ''}`;
  const canUpdateWhileIdle = false;

  if (invalidateKey !== lockedKeyRef.current) {
    // Key changed (different recording or different clip) - lock the new URL
    lockedUrlRef.current = computedUrl;
    lockedKeyRef.current = invalidateKey;
  } else if (canUpdateWhileIdle && computedUrl && computedUrl !== lockedUrlRef.current) {
    // Allow resolution downgrades (proxy/scrub availability) when idle to reduce memory.
    lockedUrlRef.current = computedUrl;
  } else if (!lockedUrlRef.current && computedUrl) {
    // First time getting a valid URL for this recording - lock it
    lockedUrlRef.current = computedUrl;
  }

  return lockedUrlRef.current ?? computedUrl;
}
