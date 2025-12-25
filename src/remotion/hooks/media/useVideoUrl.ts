/**
 * Resolve video URL for a recording with smart resolution selection
 *
 * Handles both preview (proxy/blob URLs) and export (file URLs) environments.
 * Uses proxy when sufficient for target × zoom × retina, otherwise full source.
 *
 * Key insight: Once a source is selected for a clip, it stays consistent
 * throughout playback - no switching means no blink.
 */

import { useMemo, useRef } from 'react';
import { getRemotionEnvironment } from 'remotion';
import { RecordingStorage } from '@/lib/storage/recording-storage';
import type { UseVideoUrlProps } from '@/types';

// Re-export shared utilities for backwards compatibility
export {
  getMaxZoomScale,
  isProxySufficientForTarget,
  isSourceOverkillForPreview,
  PROXY_WIDTH,
  PROXY_HEIGHT,
  PREVIEW_DISPLAY_WIDTH,
  PREVIEW_DISPLAY_HEIGHT,
  RETINA_MULTIPLIER,
} from '@/lib/utils/resolution-utils';

import {
  isProxySufficientForTarget,
  PREVIEW_DISPLAY_WIDTH,
  PREVIEW_DISPLAY_HEIGHT,
  RETINA_MULTIPLIER,
} from '@/lib/utils/resolution-utils';

export function useVideoUrl({
  recording,
  resources,
  preferOffthreadVideo: _preferOffthreadVideo,
  targetWidth = 1280,
  targetHeight = 720,
  maxZoomScale = 1,
  isGlowMode = false,
  forceProxy = false,
  isHighQualityPlaybackEnabled = false,
}: UseVideoUrlProps): string | undefined {
  const { isRendering } = getRemotionEnvironment();
  const { videoUrls, videoUrlsHighRes } = resources || {};

  const computedUrl = useMemo(() => {
    if (!recording) return undefined;
    if (recording.sourceType === 'generated') return undefined;

    // Use maxZoomScale (stable) instead of currentZoomScale (frame-varying)
    // to prevent URL switching during zoom animations which causes VTDecoder churn
    const zoomScaleForQuality = Math.max(maxZoomScale || 1, 1);

    // Glow player (64×36) always uses proxy
    // No point decoding 5K when output is 64px wide
    if (isGlowMode) {
      // PRIORITY 0: Specific glow proxy (super low res)
      if (recording.glowProxyUrl) {
        return recording.glowProxyUrl;
      }

      if (recording.previewProxyUrl) {
        return recording.previewProxyUrl;
      } else {
        // console.warn(`[useVideoUrl] ⚠️ GLOW has NO proxy, will use full source: ${recording.id}`);
      }
    }
    // Previously, switching to proxy on play caused VTDecoder churn every start/stop
    // Now we use consistent resolution logic regardless of playback state

    // Force proxy for preload videos
    // Preload shows first frame briefly - doesn't need full resolution
    if (forceProxy && recording.previewProxyUrl) {
      return recording.previewProxyUrl;
    }

    // Both videoUrls and videoUrlsHighRes are pre-unified by export orchestrator
    // to point to the same zoom-aware smart proxy. Just use what's available.
    if (isRendering) {
      // Use the unified proxy URL (both are the same in export mode)
      if (videoUrls?.[recording.id]) {
        return videoUrls[recording.id];
      }
      if (videoUrlsHighRes?.[recording.id]) {
        return videoUrlsHighRes[recording.id];
      }
    }

    // PRIORITY 2: Fallback to any available videoUrls (non-export mode)
    if (videoUrls?.[recording.id]) {
      return videoUrls[recording.id];
    }

    // PRIORITY 3: Smart proxy selection with resolution capping
    if (recording.previewProxyUrl) {
      const sourceWidth = recording.width || 1920;
      const sourceHeight = recording.height || 1080;

      // Check if proxy is sufficient for the target composition
      const proxySufficient = isProxySufficientForTarget(targetWidth, targetHeight, zoomScaleForQuality);

      // USER PREFERENCE: If high-res preview is enabled, only use proxy if truly sufficient
      // Don't apply sourceOverkill optimization - user wants quality preview
      // USER PREFERENCE: If high-res preview is enabled, prioritize full source
      // We only use proxy if it's explicitly forced or if we really can't load the source
      if (isHighQualityPlaybackEnabled) {
        // Fall through to full source unless there's a compelling reason not to
        // This fixes the issue where "High Quality" doesn't work because the system thinks the proxy is "good enough"
      } else {
        // MEMORY OPTIMIZATION: When high-res preview is disabled, be aggressive about using proxy
        // Calculate max useful resolution for preview display
        const maxUsefulWidth = PREVIEW_DISPLAY_WIDTH * RETINA_MULTIPLIER * zoomScaleForQuality;
        const maxUsefulHeight = PREVIEW_DISPLAY_HEIGHT * RETINA_MULTIPLIER * zoomScaleForQuality;

        // If source resolution exceeds what preview can actually use by >20%, use proxy
        const sourceOverkill = sourceWidth > maxUsefulWidth * 1.2 || sourceHeight > maxUsefulHeight * 1.2;

        // Use proxy if: proxy is sufficient for quality OR source is overkill for display
        if (proxySufficient || sourceOverkill) {
          return recording.previewProxyUrl;
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
  }, [recording, isRendering, videoUrls, videoUrlsHighRes, targetWidth, targetHeight, maxZoomScale, isGlowMode, forceProxy, isHighQualityPlaybackEnabled]);

  // Use URL locking to prevent mid-playback URL switches that cause video reloads
  // Merged from useUrlLocking logic:
  const lockedUrlRef = useRef<string | undefined>(undefined);
  const lockedKeyRef = useRef<string | undefined>(undefined);
  const invalidateKey = recording?.id;

  if (invalidateKey !== lockedKeyRef.current) {
    // Key changed (e.g., different recording) - lock the new URL
    lockedUrlRef.current = computedUrl;
    lockedKeyRef.current = invalidateKey;
  } else if (!lockedUrlRef.current && computedUrl) {
    // First time getting a valid URL for this recording - lock it
    lockedUrlRef.current = computedUrl;
  }

  return lockedUrlRef.current ?? computedUrl;
}
