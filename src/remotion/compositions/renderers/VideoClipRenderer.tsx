/**
 * VideoClipRenderer.tsx
 *
 * Renders individual video clips within a Remotion composition for EXPORT rendering.
 * This component is designed for the rendering/export pipeline where precise frame
 * timing and Remotion's Sequence-based playback are required.
 *
 * Key responsibilities:
 * - Renders video clips with proper timing via Remotion's Sequence component
 * - Handles smart resolution selection (proxy vs high-res) based on zoom scale
 * - Manages fade-in/out transitions and glow mode crossfades
 * - Implements VTDecoder memory cleanup to prevent macOS decoder resource leaks
 * - Supports audio enhancement integration
 *
 * @see PreviewVideoRenderer for the interactive preview counterpart
 * @see GeneratedClipRenderer for plugin-generated clips
 */
import React from 'react';
import { Sequence } from 'remotion';
import type { VideoClipRendererProps } from '@/types';
import { useVideoUrl, isProxySufficientForTarget } from '@/remotion/hooks/useVideoUrl';
import { AudioEnhancerWrapper } from '@/remotion/components/video-helpers';
import {
  calculateClipFadeDurations,
  calculateClipFadeOpacity,
  calculateGlowCrossfadeOpacity,
} from '../utils/clip-fade';

// ============================================================================
// COMPONENT
// ============================================================================
export const VideoClipRenderer: React.FC<VideoClipRendererProps> = React.memo(({
  clipForVideo, recording, startFrame, durationFrames,
  groupStartFrame, renderStartFrom, groupDuration,
  currentFrame, fps, isRendering,
  cornerRadius, drawWidth, drawHeight,
  compositionWidth, compositionHeight, maxZoomScale, currentZoomScale, mockupEnabled,
  activeLayoutItem, prevLayoutItem, nextLayoutItem, shouldHoldPrevFrame,
  isNearBoundaryEnd, overlapFrames, markRenderReady, handleVideoReady,
  VideoComponent, premountFor, postmountFor,
  // New Config Objects
  resources,
  playback,
  renderSettings,
}) => {
  // Destructure config objects
  const { isPlaying, isHighQualityPlaybackEnabled } = playback;
  const { isGlowMode, preferOffthreadVideo, enhanceAudio } = renderSettings;

  // ==========================================================================
  // VIDEO URL RESOLUTION
  // ==========================================================================
  // IMPORTANT: Hooks must run unconditionally to maintain stable hook order.
  // Early returns happen AFTER this hook to prevent React hook count mismatches.
  const videoUrl = useVideoUrl({
    recording,
    resources,
    preferOffthreadVideo,
    targetWidth: compositionWidth, targetHeight: compositionHeight,
    maxZoomScale,
    currentZoomScale,  // Smart resolution: uses current frame's zoom level
    isGlowMode,        // Glow player always uses proxy (64×36 doesn't need high-res)
    isHighQualityPlaybackEnabled,
    isPlaying,
  });

  // ==========================================================================
  // EARLY RETURNS (after hooks)
  // ==========================================================================
  if (!recording) return null;

  // Block generated/blank clips - they don't have video sources
  if (recording.sourceType === 'generated' || !recording.filePath) {
    console.warn('[VideoClipRenderer] ⚠️ BLOCKED: Generated clip reached VideoClipRenderer!', {
      recordingId: recording.id,
      sourceType: recording.sourceType,
      filePath: recording.filePath,
    });
    return null;
  }

  // ==========================================================================
  // VTDECODER MEMORY MANAGEMENT
  // ==========================================================================
  /**
   * macOS VTDecoderXPCService holds onto decoder resources unless we explicitly
   * clear the video src and call load() before the element is garbage collected.
   * This effect handles cleanup when:
   * 1. Video URL changes - release old decoder before new one is created
   * 2. Component unmounts - release decoder to prevent memory leaks
   */
  const videoContainerRef = React.useRef<HTMLDivElement>(null);
  const prevVideoUrlRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    const prevUrl = prevVideoUrlRef.current;
    const urlChanged = prevUrl !== undefined && prevUrl !== videoUrl;

    // When URL changes, cleanup old video elements BEFORE React swaps them
    if (urlChanged && videoContainerRef.current) {
      const videos = videoContainerRef.current.querySelectorAll('video');
      videos.forEach((video) => {
        try {
          // Only cleanup if this video has the OLD url (not the new one)
          if (video.src === prevUrl || video.currentSrc === prevUrl) {
            video.pause();
            video.removeAttribute('src');
            video.load(); // Forces decoder to release
          }
        } catch (e) {
          // Best-effort cleanup - don't crash on edge cases
        }
      });
    }

    prevVideoUrlRef.current = videoUrl;

    // Cleanup on unmount
    return () => {
      const container = videoContainerRef.current;
      if (container) {
        const videos = container.querySelectorAll('video');
        videos.forEach((video) => {
          try {
            video.pause();
            video.removeAttribute('src');
            video.load(); // Forces decoder to release
          } catch (e) {
            // Best-effort cleanup
          }
        });
      }
    };
  }, [videoUrl]);

  // ==========================================================================
  // VIDEO SOURCE CONFIGURATION
  // ==========================================================================
  // Use same URL for preload and main playback to avoid source swaps
  // (which cause black frame blinks and double memory usage)
  const preloadVideoUrl = videoUrl;

  // Determine if high-res sizing is needed based on resolution requirements
  const needsHighRes = isHighQualityPlaybackEnabled
    && !isProxySufficientForTarget(compositionWidth, compositionHeight, currentZoomScale || maxZoomScale || 1);
  const useHighResSizing = isRendering || needsHighRes;

  const playbackRate = clipForVideo.playbackRate && clipForVideo.playbackRate > 0 ? clipForVideo.playbackRate : 1;

  // ==========================================================================
  // SEQUENCE TIMING CALCULATIONS
  // ==========================================================================
  // Group-based rendering uses the parent group's start frame for stability.
  // This ensures all clips in a group share the same Sequence timing origin.
  const currentClipEndFrame = startFrame + durationFrames;
  const durationFromGroupStart = currentClipEndFrame - groupStartFrame;

  // Determine if this clip should hold its last frame during transitions
  const isHoldPrevClip = !isRendering && shouldHoldPrevFrame && prevLayoutItem?.clip.id === clipForVideo.id;
  const isHoldActiveClipAtEnd = !isRendering && isNearBoundaryEnd && activeLayoutItem?.clip.id === clipForVideo.id;
  const isHoldClip = isHoldPrevClip || isHoldActiveClipAtEnd;

  // Calculate gap between this clip and the next (for extending duration)
  const gapFrames = nextLayoutItem ? Math.max(0, nextLayoutItem.startFrame - currentClipEndFrame) : 0;

  // Extend Sequence duration for hold frames or gaps at group boundaries
  const finalDuration = Math.max(groupDuration, durationFromGroupStart + (isHoldClip ? overlapFrames : gapFrames));

  // Calculate local frame position (clamped for hold mode)
  const localFrameRaw = currentFrame - startFrame;
  const localFrame = isHoldClip ? Math.min(localFrameRaw, durationFrames - 1) : localFrameRaw;

  // ==========================================================================
  // FADE & CROSSFADE CALCULATIONS
  // ==========================================================================
  // Don't apply fade if clips are contiguous (same group)
  const isNextContiguous = nextLayoutItem && nextLayoutItem.groupId === activeLayoutItem?.groupId;
  const isPrevContiguous = prevLayoutItem && prevLayoutItem.groupId === activeLayoutItem?.groupId;

  // Glow mode intro/outro triggers
  const wantsGlowIntro = isGlowMode && (
    (clipForVideo.id === activeLayoutItem?.clip.id && shouldHoldPrevFrame && !isPrevContiguous) ||
    (clipForVideo.id === nextLayoutItem?.clip.id && !isNextContiguous)
  );
  const wantsGlowOutro = isGlowMode && (
    (clipForVideo.id === activeLayoutItem?.clip.id && isNearBoundaryEnd && !isNextContiguous) ||
    (clipForVideo.id === prevLayoutItem?.clip.id && !isPrevContiguous)
  );

  const { introFadeDuration, outroFadeDuration } = calculateClipFadeDurations(
    clipForVideo, fps, isGlowMode, wantsGlowIntro, wantsGlowOutro
  );

  const fadeOpacity = calculateClipFadeOpacity({ localFrame, durationFrames, introFadeDuration, outroFadeDuration });

  const glowOpacityOverride = calculateGlowCrossfadeOpacity({
    isGlowMode, clipId: clipForVideo.id, currentFrame, fps, shouldHoldPrevFrame,
    isNearBoundaryEnd, prevLayoutItem, activeLayoutItem, nextLayoutItem,
  });

  const needsFade = introFadeDuration > 0 || outroFadeDuration > 0;

  // ==========================================================================
  // OPACITY CALCULATION
  // ==========================================================================
  const isPreloading = currentFrame < startFrame;

  // Hide video when active clip is generated (blank/plugin) but keep mounted
  // to prevent VTDecoder release/recreation thrashing
  const isActiveClipGenerated = activeLayoutItem?.clip.recordingId?.startsWith('generated-');
  const isThisClipActive = activeLayoutItem?.clip.id === clipForVideo.id;
  const shouldHideForGeneratedActive = isActiveClipGenerated && !isThisClipActive;

  const effectiveOpacity = (isPreloading || shouldHideForGeneratedActive)
    ? 0
    : (glowOpacityOverride ?? (needsFade ? fadeOpacity : 1));

  // ==========================================================================
  // RENDER
  // ==========================================================================
  const videoElement = (
    <VideoComponent
      key={videoUrl} // Force remount on URL change to ensure decoder cleanup
      src={preloadVideoUrl || ''}
      style={{
        width: '100%', height: '100%', objectFit: mockupEnabled ? 'cover' : 'contain',
        position: 'absolute', top: 0, left: 0, borderRadius: `${cornerRadius}px`, pointerEvents: 'none',
      }}
      volume={1}
      muted={false}
      pauseWhenBuffering={false}
      startFrom={renderStartFrom}
      endAt={undefined} // Let it play continuously
      playbackRate={playbackRate}
      {...(isRendering ? { onLoadedData: handleVideoReady, onCanPlay: handleVideoReady, onSeeked: handleVideoReady } : {})}
      onError={(e: any) => {
        const errorObj = e?.target?.error ?? e;
        console.error('[SharedVideoController] Video error:', { error: errorObj, videoUrl, recordingId: recording.id });
        markRenderReady('video-error');
      }}
    />
  );

  const enhancedVideoElement = (
    <AudioEnhancerWrapper enabled={enhanceAudio && !isRendering}>{videoElement}</AudioEnhancerWrapper>
  );

  return (
    <div ref={videoContainerRef} style={{ display: 'contents' }}>
      {/* Container ref enables VTDecoder cleanup to find and release video elements */}
      <Sequence
        from={groupStartFrame}
        durationInFrames={finalDuration}
        premountFor={premountFor}
        postmountFor={postmountFor}
      >
        <div style={{
          width: useHighResSizing ? (recording?.width || '100%') : '100%',
          height: useHighResSizing ? (recording?.height || '100%') : '100%',
          transform: useHighResSizing
            ? `scale(${drawWidth / (recording?.width || drawWidth)}, ${drawHeight / (recording?.height || drawHeight)})`
            : undefined,
          transformOrigin: '0 0', position: 'absolute', top: 0, left: 0,
          opacity: effectiveOpacity,
        }}>
          {enhancedVideoElement}
        </div>
      </Sequence>
    </div>
  );
});
