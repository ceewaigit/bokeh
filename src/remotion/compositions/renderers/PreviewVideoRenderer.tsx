/**
 * PreviewVideoRenderer.tsx
 *
 * Renders video clips for the interactive PREVIEW player (not export).
 * Uses native HTML video element with imperative control for responsive scrubbing.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { useVideoUrl, isProxySufficientForTarget } from '@/remotion/hooks/useVideoUrl';
import { usePlaybackSettings } from '@/remotion/context/PlaybackSettingsContext';
import { useNativeVideoCleanup } from '@/remotion/hooks/useVTDecoderCleanup';
import { AudioEnhancerWrapper } from '@/remotion/components/video-helpers';
import { calculateClipFadeDurations, calculateClipFadeOpacity } from '../utils/clip-fade';
import type { Clip, Recording } from '@/types/project';

interface PreviewVideoRendererProps {
  recording: Recording | null | undefined;
  clipForVideo?: Clip | null;
  startFrame: number;
  durationFrames: number;
  sourceTimeMs: number;
  currentFrame: number;
  fps: number;
  cornerRadius: number;
  drawWidth: number;
  drawHeight: number;
  compositionWidth: number;
  compositionHeight: number;
  maxZoomScale: number;
  currentZoomScale: number;
  mockupEnabled?: boolean;
  visible: boolean;
}

export const PreviewVideoRenderer: React.FC<PreviewVideoRendererProps> = React.memo(({
  recording, clipForVideo, startFrame, durationFrames, sourceTimeMs,
  currentFrame, fps, cornerRadius, drawWidth, drawHeight,
  compositionWidth, compositionHeight, maxZoomScale, currentZoomScale, mockupEnabled, visible,
}) => {
  // Get settings from context
  const { playback, renderSettings, resources } = usePlaybackSettings();
  const { isPlaying, isHighQualityPlaybackEnabled, previewMuted, previewVolume } = playback;
  const { isGlowMode, enhanceAudio } = renderSettings;

  // Refs for playback control
  const lastIsPlayingRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const lastSeekSourceTimeMsRef = useRef<number>(-1);

  // Video URL resolution
  const videoUrl = useVideoUrl({
    recording, resources, preferOffthreadVideo: false,
    targetWidth: compositionWidth, targetHeight: compositionHeight,
    maxZoomScale, currentZoomScale, isGlowMode, isHighQualityPlaybackEnabled, isPlaying,
  });

  // Refs for checking state inside stable callbacks
  const visibleRef = useRef(visible);
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  // Callback for when video is ready to play
  const handleVideoReady = useCallback(() => {
    if (isPlayingRef.current && visibleRef.current) {
      const video = document.querySelector('video');
      video?.play().catch(() => undefined);
      lastIsPlayingRef.current = true;
    }
  }, []);

  // VTDecoder cleanup (SSOT hook)
  const { videoRef, isVideoReady } = useNativeVideoCleanup({
    videoUrl,
    visible,
    onPlay: handleVideoReady,
  });

  // Early return check
  const shouldRender = recording && recording.sourceType !== 'generated' && recording.filePath;

  // Derived values
  const playbackRate = clipForVideo?.playbackRate && clipForVideo.playbackRate > 0 ? clipForVideo.playbackRate : 1;
  const normalizedVolume = Math.max(0, Math.min(1, previewVolume));
  const effectiveMuted = previewMuted || isGlowMode;
  const hasSource = Boolean(videoUrl);

  // Audio configuration
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = effectiveMuted;
    video.volume = effectiveMuted ? 0 : normalizedVolume;
    video.playbackRate = playbackRate;
  }, [effectiveMuted, normalizedVolume, playbackRate, videoRef]);

  // Play/pause control
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const shouldPlay = isPlaying && visible && hasSource;
    const attemptPlay = () => {
      if (shouldPlay && video.paused) video.play().catch(() => undefined);
    };

    if (shouldPlay) {
      attemptPlay();
      video.addEventListener('canplay', attemptPlay);
      video.addEventListener('stalled', attemptPlay);
      video.addEventListener('waiting', attemptPlay);
    } else if (!shouldPlay && !video.paused) {
      video.pause();
    }

    lastIsPlayingRef.current = shouldPlay;
    return () => {
      video.removeEventListener('canplay', attemptPlay);
      video.removeEventListener('stalled', attemptPlay);
      video.removeEventListener('waiting', attemptPlay);
    };
  }, [isPlaying, visible, videoUrl, hasSource, videoRef]);

  // Seek control
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || !visible) return;
    if (isPlayingRef.current && lastSeekSourceTimeMsRef.current >= 0) return;
    if (!isVideoReady && !isPlayingRef.current) return;

    const desiredTime = Math.max(0, sourceTimeMs / 1000);
    const diff = Math.abs(video.currentTime - desiredTime);
    const sourceTimeChanged = Math.abs(sourceTimeMs - lastSeekSourceTimeMsRef.current) > 1;

    if (sourceTimeChanged && diff > 0.001) {
      video.currentTime = desiredTime;
    }
    lastSeekSourceTimeMsRef.current = sourceTimeMs;
  }, [sourceTimeMs, videoUrl, visible, isVideoReady, videoRef]);

  // Sizing
  const needsHighRes = isHighQualityPlaybackEnabled
    && !isProxySufficientForTarget(compositionWidth, compositionHeight, currentZoomScale || maxZoomScale || 1);

  // Fade calculations
  const localFrame = Math.max(0, Math.min(currentFrame - startFrame, durationFrames - 1));
  const { introFadeDuration, outroFadeDuration } = clipForVideo
    ? calculateClipFadeDurations(clipForVideo, fps, isGlowMode, false, false)
    : { introFadeDuration: 0, outroFadeDuration: 0 };
  const fadeOpacity = calculateClipFadeOpacity({ localFrame, durationFrames, introFadeDuration, outroFadeDuration });

  // Opacity
  const isPreloading = currentFrame < startFrame;
  const baseOpacity = isPreloading ? 0 : (introFadeDuration > 0 || outroFadeDuration > 0 ? fadeOpacity : 1);
  const effectiveOpacity = visible && hasSource && (isVideoReady || isPlaying) ? baseOpacity : 0;

  if (!shouldRender) return null;

  return (
    <div style={{
      width: needsHighRes ? (recording?.width || '100%') : '100%',
      height: needsHighRes ? (recording?.height || '100%') : '100%',
      transform: needsHighRes
        ? `scale(${drawWidth / (recording?.width || drawWidth)}, ${drawHeight / (recording?.height || drawHeight)})`
        : undefined,
      transformOrigin: '0 0',
      position: 'absolute',
      top: 0,
      left: 0,
      opacity: effectiveOpacity,
    }}>
      {!isVideoReady && visible && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(30,30,30,0.9) 0%, rgba(20,20,20,0.95) 100%)',
          borderRadius: `${cornerRadius}px`,
        }}>
          <div style={{
            width: 32, height: 32,
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: 'rgba(255,255,255,0.5)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <AudioEnhancerWrapper enabled={Boolean(enhanceAudio && !isGlowMode)}>
        <video
          ref={videoRef}
          playsInline
          muted={effectiveMuted}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover', // Match ImageClipRenderer and VideoClipRenderer
            position: 'absolute', top: 0, left: 0,
            borderRadius: `${cornerRadius}px`,
            pointerEvents: 'none',
          }}
        />
      </AudioEnhancerWrapper>
    </div>
  );
});
