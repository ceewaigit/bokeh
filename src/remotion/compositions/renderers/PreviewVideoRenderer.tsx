/**
 * PreviewVideoRenderer.tsx
 *
 * Renders video clips for the interactive PREVIEW player (not export).
 * This component uses a native HTML video element with imperative control
 * for responsive scrubbing and real-time playback.
 *
 * Key responsibilities:
 * - Renders video clips with native HTML video element for preview
 * - Handles imperative play/pause, seek, and volume control
 * - Implements smart resolution selection based on current zoom scale
 * - Manages VTDecoder memory cleanup to prevent macOS decoder leaks
 * - Supports audio enhancement integration
 *
 * @see VideoClipRenderer for the Remotion Sequence-based export counterpart
 */
import React, { useEffect, useRef } from 'react';
import type { PreviewVideoRendererProps } from '@/types';
import { useVideoUrl, isProxySufficientForTarget } from '@/remotion/hooks/useVideoUrl';
import { AudioEnhancerWrapper } from '@/remotion/components/video-helpers';
import {
  calculateClipFadeDurations,
  calculateClipFadeOpacity,
} from '../utils/clip-fade';

// ============================================================================
// COMPONENT
// ============================================================================
export const PreviewVideoRenderer: React.FC<PreviewVideoRendererProps> = React.memo(({
  recording,
  clipForVideo,
  startFrame,
  durationFrames,
  sourceTimeMs,
  currentFrame,
  fps,
  cornerRadius,
  drawWidth,
  drawHeight,
  compositionWidth,
  compositionHeight,
  maxZoomScale,
  currentZoomScale,
  mockupEnabled,
  videoUrls,
  videoUrlsHighRes,
  videoFilePaths,
  isHighQualityPlaybackEnabled,
  isPlaying,
  isGlowMode,
  enhanceAudio,
  previewMuted,
  previewVolume,
  visible,
}) => {
  // ==========================================================================
  // REFS
  // ==========================================================================
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Tracks the last applied video source URL */
  const lastSrcRef = useRef<string | null>(null);
  /** Tracks the last playing state to avoid redundant play/pause calls */
  const lastIsPlayingRef = useRef<boolean>(false);
  /** Tracks current playing state for seek tolerance calculation without triggering effect re-runs */
  const isPlayingRef = useRef<boolean>(isPlaying);

  // ==========================================================================
  // VIDEO URL RESOLUTION
  // ==========================================================================
  const videoUrl = useVideoUrl({
    recording,
    videoUrls,
    videoUrlsHighRes,
    videoFilePaths,
    preferOffthreadVideo: false, // Preview always uses native video element
    targetWidth: compositionWidth,
    targetHeight: compositionHeight,
    maxZoomScale,
    currentZoomScale,
    isGlowMode,
    isHighQualityPlaybackEnabled,
    isPlaying,
  });

  // ==========================================================================
  // EARLY RETURNS CHECK
  // ==========================================================================
  // Block generated/blank clips - they don't have video sources
  const shouldRender = recording && recording.sourceType !== 'generated' && recording.filePath;

  // ==========================================================================
  // DERIVED VALUES
  // ==========================================================================
  const playbackRate = clipForVideo?.playbackRate && clipForVideo.playbackRate > 0
    ? clipForVideo.playbackRate
    : 1;

  const normalizedVolume = Math.max(0, Math.min(1, previewVolume));
  const effectiveMuted = previewMuted || isGlowMode; // Glow mode is always muted
  const hasSource = Boolean(videoUrl);

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
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!videoUrl) return;

    const prevUrl = lastSrcRef.current;

    if (prevUrl !== videoUrl) {
      // Cleanup OLD video decoder before setting new URL
      if (prevUrl) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load(); // Forces decoder to release
        } catch (e) {
          // Best-effort cleanup - don't crash on edge cases
        }
      }

      // Apply new video source
      lastSrcRef.current = videoUrl;
      video.src = videoUrl;
      video.preload = 'auto';
      video.load();
      lastIsPlayingRef.current = false; // Reset play state for new source
    }

    // Cleanup on unmount
    return () => {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load(); // Forces decoder to release
      } catch (e) {
        // Best-effort cleanup
      }
    };
  }, [videoUrl]);

  // ==========================================================================
  // AUDIO CONFIGURATION
  // ==========================================================================
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = effectiveMuted;
    video.volume = effectiveMuted ? 0 : normalizedVolume;
    video.playbackRate = playbackRate;
  }, [effectiveMuted, normalizedVolume, playbackRate]);

  // ==========================================================================
  // PLAY/PAUSE CONTROL
  // ==========================================================================
  useEffect(() => {
    // Keep ref in sync for seek tolerance calculation
    isPlayingRef.current = isPlaying;

    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const shouldPlay = isPlaying && visible && hasSource;
    if (shouldPlay) {
      if (!lastIsPlayingRef.current) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => undefined); // Suppress autoplay errors
        }
      }
    } else if (lastIsPlayingRef.current) {
      try {
        video.pause();
      } catch (e) {
        // Best-effort pause
      }
    }
    lastIsPlayingRef.current = shouldPlay;
  }, [isPlaying, visible, videoUrl, hasSource]);

  // ==========================================================================
  // SEEK CONTROL
  // ==========================================================================
  /**
   * Seek the video to the current source time position.
   * 
   * IMPORTANT: We do NOT include `isPlaying` in the dependency array or condition
   * because seeking on every play/pause toggle causes effects to "replay" as the
   * video position is recalculated. The seek should only happen when:
   * 1. The sourceTimeMs actually changes (scrubbing, frame advance)
   * 2. The video URL changes (switching clips)
   * 3. Visibility changes (coming back into view)
   */
  const lastSeekSourceTimeMsRef = useRef<number>(sourceTimeMs);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || !visible) return;

    const desiredTime = Math.max(0, sourceTimeMs / 1000);
    const currentVideoTime = video.currentTime;
    const diff = Math.abs(currentVideoTime - desiredTime);

    // Tolerance: during playback, the video element naturally advances,
    // so we allow larger drift before forcing a seek. When paused (scrubbing),
    // we need precise frame positioning. Use ref to avoid stale closure.
    const tolerance = isPlayingRef.current ? Math.max(1 / fps, 0.05) : 0.001;

    // Only seek if:
    // 1. The source time actually changed significantly
    // 2. The video position is out of sync with desired time
    const sourceTimeChanged = Math.abs(sourceTimeMs - lastSeekSourceTimeMsRef.current) > 1;

    if (sourceTimeChanged && diff > tolerance) {
      try {
        video.currentTime = desiredTime;
      } catch (e) {
        // Best-effort seek
      }
    }

    lastSeekSourceTimeMsRef.current = sourceTimeMs;
  }, [sourceTimeMs, videoUrl, visible, fps]); // Removed isPlaying from deps - seek on time change only

  // ==========================================================================
  // SIZING CALCULATIONS
  // ==========================================================================
  const needsHighRes = isHighQualityPlaybackEnabled
    && !isProxySufficientForTarget(compositionWidth, compositionHeight, currentZoomScale || maxZoomScale || 1);
  const useHighResSizing = needsHighRes;

  // ==========================================================================
  // FADE CALCULATIONS
  // ==========================================================================
  const localFrameRaw = currentFrame - startFrame;
  const localFrame = Math.max(0, Math.min(localFrameRaw, durationFrames - 1));

  const { introFadeDuration, outroFadeDuration } = clipForVideo
    ? calculateClipFadeDurations(clipForVideo, fps, isGlowMode, false, false)
    : { introFadeDuration: 0, outroFadeDuration: 0 };

  const fadeOpacity = calculateClipFadeOpacity({ localFrame, durationFrames, introFadeDuration, outroFadeDuration });
  const needsFade = introFadeDuration > 0 || outroFadeDuration > 0;

  // ==========================================================================
  // OPACITY CALCULATION
  // ==========================================================================
  const isPreloading = currentFrame < startFrame;
  const baseOpacity = isPreloading ? 0 : (needsFade ? fadeOpacity : 1);
  const effectiveOpacity = visible && hasSource ? baseOpacity : 0;

  // ==========================================================================
  // RENDER
  // ==========================================================================
  const videoElement = (
    <video
      ref={videoRef}
      playsInline
      muted={effectiveMuted}
      style={{
        width: '100%',
        height: '100%',
        objectFit: mockupEnabled ? 'cover' : 'contain',
        position: 'absolute',
        top: 0,
        left: 0,
        borderRadius: `${cornerRadius}px`,
        pointerEvents: 'none',
      }}
    />
  );

  const resolvedContent = (
    <AudioEnhancerWrapper enabled={Boolean(enhanceAudio && !isGlowMode)}>
      {videoElement}
    </AudioEnhancerWrapper>
  );

  if (!shouldRender) {
    return null;
  }

  return (
    <div style={{
      width: useHighResSizing ? (recording?.width || '100%') : '100%',
      height: useHighResSizing ? (recording?.height || '100%') : '100%',
      transform: useHighResSizing
        ? `scale(${drawWidth / (recording?.width || drawWidth)}, ${drawHeight / (recording?.height || drawHeight)})`
        : undefined,
      transformOrigin: '0 0',
      position: 'absolute',
      top: 0,
      left: 0,
      opacity: effectiveOpacity,
    }}>
      {resolvedContent}
    </div>
  );
});
