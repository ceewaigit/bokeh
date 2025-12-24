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
import React, { useEffect, useRef, useState } from 'react';
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
  visible,
  // New Config Objects
  resources,
  playback,
  renderSettings,
}) => {
  // Destructure config objects
  const { isPlaying, isHighQualityPlaybackEnabled, previewMuted, previewVolume } = playback;
  const { isGlowMode, enhanceAudio } = renderSettings;

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
  // VIDEO READY STATE - Prevents crop misalignment before metadata loads
  // ==========================================================================
  const [isVideoReady, setIsVideoReady] = useState(false);

  // ==========================================================================
  // VIDEO URL RESOLUTION
  // ==========================================================================
  const videoUrl = useVideoUrl({
    recording,
    resources,
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
      // Reset video ready state when URL changes
      setIsVideoReady(false);

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

    // Track when video metadata is loaded - needed for objectFit to work correctly
    const handleLoadedMetadata = () => {
      setIsVideoReady(true);
      // CRITICAL FIX: Resume playback after source change if we should be playing
      // This fixes video not playing during high-quality playback mode
      if (isPlayingRef.current && visible) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => undefined); // Suppress autoplay errors
        }
        lastIsPlayingRef.current = true;
      }
    };

    // If video already has metadata (can happen with cached videos), mark as ready
    if (video.readyState >= 1) {
      setIsVideoReady(true);
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Cleanup on unmount
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      try {
        video.pause();
        video.removeAttribute('src');
        video.load(); // Forces decoder to release
      } catch (e) {
        // Best-effort cleanup
      }
    };
  }, [videoUrl, visible]);

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

    const attemptPlay = () => {
      // CRITICAL FIX: Check actual video.paused state, not just our tracking ref
      // Video can become paused due to buffering, source change, etc.
      if (shouldPlay && video.paused) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => undefined); // Suppress autoplay errors
        }
      }
    };

    if (shouldPlay) {
      attemptPlay();
      // Retry when video becomes ready to play (after buffering)
      video.addEventListener('canplay', attemptPlay);
      // HIGH-QUALITY PLAYBACK FIX: Also listen for stalled/waiting events
      // These fire when video buffers during playback and need recovery
      video.addEventListener('stalled', attemptPlay);
      video.addEventListener('waiting', attemptPlay);
    } else if (!shouldPlay && !video.paused) {
      try {
        video.pause();
      } catch (e) {
        // Best-effort pause
      }
    }

    lastIsPlayingRef.current = shouldPlay;

    return () => {
      video.removeEventListener('canplay', attemptPlay);
      video.removeEventListener('stalled', attemptPlay);
      video.removeEventListener('waiting', attemptPlay);
    };
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
   * 4. Video becomes ready (initial load)
   */
  // BUGFIX: Initialize to -1 so the FIRST seek always triggers (was causing crop misalignment)
  const lastSeekSourceTimeMsRef = useRef<number>(-1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || !visible) return;

    // CRITICAL FIX: During playback, the native video element handles its own timing.
    // Seeking during playback fights with the video element and causes freezes.
    // Only seek when:
    // 1. Paused (scrubbing/frame advance)
    // 2. Initial load (no previous seek)
    if (isPlayingRef.current && lastSeekSourceTimeMsRef.current >= 0) {
      // Already playing and have seeked before - let native video handle timing
      return;
    }

    // For paused state, require video ready for proper crop alignment
    if (!isVideoReady && !isPlayingRef.current) return;

    const desiredTime = Math.max(0, sourceTimeMs / 1000);
    const currentVideoTime = video.currentTime;
    const diff = Math.abs(currentVideoTime - desiredTime);

    // Tolerance: when paused we need precise positioning for scrubbing
    const tolerance = 0.001;

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
  }, [sourceTimeMs, videoUrl, visible, isVideoReady]);

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
  // CROP FIX: Hide video until metadata is loaded to prevent objectFit misalignment
  // PLAYBACK FIX: During playback, show video immediately even if still loading
  // The crop alignment issue only matters when paused/scrubbing (precise frame positioning)
  const shouldWaitForReady = !isPlaying; // Only wait for metadata when paused
  const effectiveOpacity = visible && hasSource && (isVideoReady || !shouldWaitForReady) ? baseOpacity : 0;

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
      {/* Loading skeleton - shows while video is buffering */}
      {!isVideoReady && visible && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(30,30,30,0.9) 0%, rgba(20,20,20,0.95) 100%)',
          borderRadius: `${cornerRadius}px`,
        }}>
          <div style={{
            width: 32,
            height: 32,
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: 'rgba(255,255,255,0.5)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {resolvedContent}
    </div>
  );
});
