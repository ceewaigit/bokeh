/**
 * VideoClipRenderer.tsx
 *
 * Renders video clips within a Remotion composition.
 * Uses Remotion's Sequence and Video components for frame-accurate timing.
 * Works for both preview and export modes.
 *
 * REFACTORED: Now uses useFrameSnapshot (Zero Prop Pattern)
 * Layout, transform, and boundary state are sourced directly from the hook.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sequence, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion';
import { useVideoUrl } from '@/features/rendering/renderer/hooks/media/useVideoUrl';
import { usePlaybackSettings } from '@/features/rendering/renderer/context/playback/PlaybackSettingsContext';
import { useClipRenderState } from '@/features/rendering/renderer/hooks/render/useClipRenderState';
import { useVideoContainerCleanup } from '@/features/rendering/renderer/hooks/media/useVTDecoderCleanup';
import { AudioEnhancerWrapper } from '@/features/rendering/renderer/components/video-helpers';
import { msToFrame } from '@/features/rendering/renderer/compositions/utils/time/frame-time';
import { devAssert } from '@/shared/utils/invariant';
import { useComposition } from '@/features/rendering/renderer/context/CompositionContext';
import { useProjectStore } from '@/features/core/stores/project-store';
import type { Clip, Recording } from '@/types/project';
import type { SyntheticEvent } from 'react';
import { createVideoStreamUrl } from '@/features/media/recording/components/library/utils/recording-paths';
import { MotionBlurWrapper } from '@/features/rendering/motion-blur/components/MotionBlurWrapper';
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext';

interface VideoClipRendererProps {
  // Identity and Source (Minimal Props)
  clipForVideo: Clip;
  recording: Recording | undefined;

  // Sequence / Timing Props (Specific to instance)
  startFrame: number;
  durationFrames: number;
  groupStartFrame: number;
  groupStartSourceIn: number;
  groupDuration: number;

  // Render Coordination (Callbacks)
  markRenderReady: (source?: string) => void;
  handleVideoReady: (e: SyntheticEvent<HTMLVideoElement>) => void;
  VideoComponent: any;
  premountFor: number;
  postmountFor: number;
  onVideoRef?: (video: HTMLVideoElement | null) => void;
  isScrubbing?: boolean;
}

export const VideoClipRenderer: React.FC<VideoClipRendererProps> = React.memo(({
  clipForVideo, recording, startFrame, durationFrames,
  groupStartFrame, groupStartSourceIn, groupDuration,
  handleVideoReady, VideoComponent,
  premountFor, postmountFor, onVideoRef, isScrubbing,
}) => {
  // Remotion hooks
  const currentFrame = useCurrentFrame();
  const { width: compositionWidth, height: compositionHeight } = useVideoConfig();
  const { isRendering } = getRemotionEnvironment();
  const { fps } = useComposition();
  const setPreviewReady = useProjectStore((s) => s.setPreviewReady);

  // Consume VideoPositionContext (Zero-Prop Pattern)
  const videoPosition = useVideoPosition();
  const {
    drawWidth,
    drawHeight,
    cornerRadius,
    zoomTransform,
    motionBlur,
    maxZoomScale,
    // useParentFade removed - each renderer calculates its own opacity via useClipRenderState
    refocusBlurPx,
  } = videoPosition;

  // Derive current zoom scale from transform
  const currentZoomScale = (zoomTransform as any)?.scale ?? 1;

  // Get settings from context
  const { playback, renderSettings, resources } = usePlaybackSettings();
  const { isHighQualityPlaybackEnabled, previewMuted, previewVolume } = playback;
  // Read isPlaying directly from store for consistency
  // NOTE: The playback context has hardcoded isPlaying: false (for Remotion internal use),
  // but we need the actual playback state for URL locking
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const { isGlowMode, preferOffthreadVideo, enhanceAudio } = renderSettings;
  const preload = 'auto';

  // Video URL resolution
  const videoUrl = useVideoUrl({
    recording, resources, clipId: clipForVideo.id, preferOffthreadVideo,
    targetWidth: compositionWidth, targetHeight: compositionHeight,
    maxZoomScale: maxZoomScale ?? 1, currentZoomScale, isGlowMode, isHighQualityPlaybackEnabled, isPlaying,
    isScrubbing
  });

  // Self-healing: track if current URL failed, fallback to original source
  const [urlFailed, setUrlFailed] = useState(false);

  // Reset failure state when URL changes (e.g. proxy generated)
  useEffect(() => {
    setUrlFailed(false);
  }, [videoUrl]);

  const effectiveUrl = useMemo(() => {
    if (!urlFailed || !recording?.filePath) return videoUrl;
    // Fallback to original source file when proxy fails
    return createVideoStreamUrl(recording.filePath);
  }, [urlFailed, videoUrl, recording?.filePath]);

  // VTDecoder cleanup
  const containerRef = useVideoContainerCleanup(videoUrl);

  // Track video element reference for external consumers (e.g., tooling/debug).
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Export-safe video frame source for MotionBlurCanvas.
  // Avoids relying on DOM discovery of <video> elements inside Remotion's renderer.
  const motionBlurFrameRef = useRef<CanvasImageSource | null>(null);
  const closeMotionBlurFrame = useCallback((frame: CanvasImageSource | null) => {
    if (!frame) return;
    const closable = (frame as { close?: () => void }).close;
    if (typeof closable === 'function') {
      closable.call(frame);
    }
  }, []);

  const handleVideoFrame = useCallback((frame: CanvasImageSource) => {
    // Keep only the latest frame; don't trigger React renders.
    closeMotionBlurFrame(motionBlurFrameRef.current);
    motionBlurFrameRef.current = frame;
  }, [closeMotionBlurFrame]);

  useEffect(() => {
    return () => {
      closeMotionBlurFrame(motionBlurFrameRef.current);
      motionBlurFrameRef.current = null;
    };
  }, [closeMotionBlurFrame]);

  // Find and expose video element when container mounts/updates
  useEffect(() => {
    if (!onVideoRef || !containerRef.current) return;

    // Find the video element inside the container
    const videoElement = containerRef.current.querySelector('video');
    if (videoElement !== videoElementRef.current) {
      videoElementRef.current = videoElement;
      onVideoRef(videoElement);
    }

    // Use MutationObserver to detect when video element is added/removed
    const observer = new MutationObserver(() => {
      const video = containerRef.current?.querySelector('video');
      if (video !== videoElementRef.current) {
        videoElementRef.current = video ?? null;
        onVideoRef(video ?? null);
      }
    });

    observer.observe(containerRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (videoElementRef.current) {
        videoElementRef.current = null;
        onVideoRef(null);
      }
    };
  }, [onVideoRef, containerRef]);

  // Handle video loaded event (for preview readiness)
  const handleLoaded = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    videoElementRef.current = video;

    if (isRendering) {
      handleVideoReady(e);
      return;
    }
    if (video.readyState >= 2) {
      setPreviewReady(true);
    }
  }, [isRendering, handleVideoReady, setPreviewReady]);

  useEffect(() => {
    if (isRendering) return;
    const video = videoElementRef.current;
    if (video && video.readyState >= 2) {
      setPreviewReady(true);
    }
  }, [isRendering, videoUrl, setPreviewReady]);

  // Shared render state
  const renderState = useClipRenderState({
    clip: clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
    currentFrame, fps, isRendering
  });

  // Early return for invalid recordings
  if (!recording || recording.sourceType === 'generated' || !recording.filePath) {
    return null;
  }

  // Sizing: Only use native resolution for export. Preview quality is handled by useVideoUrl.
  // Previously this also checked isHighQualityPlaybackEnabled but that caused frame sync
  // issues with CSS scaling. The useVideoUrl hook handles quality selection correctly.
  const useHighResSizing = isRendering;
  const playbackRate = clipForVideo.playbackRate && clipForVideo.playbackRate > 0 ? clipForVideo.playbackRate : 1;

  const baseWidth = useHighResSizing ? (recording?.width ?? drawWidth) : null;
  const baseHeight = useHighResSizing ? (recording?.height ?? drawHeight) : null;

  // Export correctness: the video is rendered at native size and then CSS-scaled into the
  // composition. The motion blur canvas must live in the same pre-transform coordinate
  // space or it will appear as a "second image" overlaid on top.
  const motionBlurDrawWidth = isRendering
    ? (recording?.width ?? drawWidth)
    : (motionBlur?.drawWidth ?? drawWidth)
  const motionBlurDrawHeight = isRendering
    ? (recording?.height ?? drawHeight)
    : (motionBlur?.drawHeight ?? drawHeight)

  // Preview perf: don't scale motion-blur buffer resolution by zoom (it explodes GPU memory under zoom-follow-mouse).
  const motionBlurRenderScale = 1;

  // Validate critical timing data in dev mode
  devAssert(groupStartSourceIn !== undefined, `groupStartSourceIn is undefined for clip ${clipForVideo.id}`)
  devAssert(fps > 0, `fps must be positive, got ${fps}`)

  const startFromFrames = msToFrame(groupStartSourceIn ?? 0, fps);
  // endAt is exclusive in Remotion (video shows frames startFrom to endAt-1)
  // So we use groupDuration directly without subtracting 1
  const endAtFrames = Math.max(startFromFrames + 1, startFromFrames + Math.max(1, groupDuration));

  // Opacity: purely based on render state (intro/outro/glow).
  // Each renderer calculates its own opacity via useClipRenderState - no parent fade needed.
  const effectiveOpacity = renderState.effectiveOpacity;
  const effectiveVolume = Math.max(0, Math.min(1, previewVolume ?? 1)) * effectiveOpacity;
  const shouldMuteAudio = (!isRendering && (previewMuted || effectiveVolume <= 0 || renderState.isPreloading))
    || !recording?.hasAudio;

  // Corner radius for letterboxed/pillarboxed clips in preview:
  // the stable frame corners may not intersect the visible video pixels, so we clip to the
  // contained content rect and apply rounding there.
  const contentClipPath = useMemo(() => {
    if (isRendering) return undefined;
    if (!cornerRadius || cornerRadius <= 0) return undefined;

    const sourceW = recording?.width ?? 0;
    const sourceH = recording?.height ?? 0;
    if (!sourceW || !sourceH || sourceW <= 0 || sourceH <= 0) return undefined;
    if (!drawWidth || !drawHeight || drawWidth <= 0 || drawHeight <= 0) return undefined;

    const scale = Math.min(drawWidth / sourceW, drawHeight / sourceH);
    if (!Number.isFinite(scale) || scale <= 0) return undefined;

    const contentW = sourceW * scale;
    const contentH = sourceH * scale;

    const insetX = Math.max(0, (drawWidth - contentW) / 2);
    const insetY = Math.max(0, (drawHeight - contentH) / 2);
    const aspectMismatch = insetX > 0.0001 || insetY > 0.0001;
    if (!aspectMismatch) return undefined;

    return `inset(${insetY}px ${insetX}px ${insetY}px ${insetX}px round ${cornerRadius}px)`;
  }, [cornerRadius, drawHeight, drawWidth, isRendering, recording?.height, recording?.width]);

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>

      <Sequence from={groupStartFrame} durationInFrames={renderState.finalDuration} premountFor={premountFor} postmountFor={postmountFor}>
        {/* Video content container with opacity control */}
        {/* Use uniform scaling to maintain aspect ratio (letterbox/pillarbox) */}
        <div style={{
          width: useHighResSizing ? (baseWidth ?? '100%') : '100%',
          height: useHighResSizing ? (baseHeight ?? '100%') : '100%',
          transform: useHighResSizing
            ? (() => {
                const bw = baseWidth ?? drawWidth;
                const bh = baseHeight ?? drawHeight;
                const scaleX = drawWidth / (bw || drawWidth);
                const scaleY = drawHeight / (bh || drawHeight);
                const uniformScale = Math.min(scaleX, scaleY);
                const scaledW = bw * uniformScale;
                const scaledH = bh * uniformScale;
                const offsetX = (drawWidth - scaledW) / 2;
                const offsetY = (drawHeight - scaledH) / 2;
                return `translate(${offsetX}px, ${offsetY}px) scale(${uniformScale})`;
              })()
            : undefined,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: effectiveOpacity,
        }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              clipPath: contentClipPath,
              WebkitClipPath: contentClipPath,
            }}
          >
          {/* Motion blur dimensions must match video render dimensions:
              - Export: video renders at native res, scaled via CSS -> use native dims
              - Preview: video renders at display size -> use drawWidth/Height */}
          <MotionBlurWrapper
            enabled={motionBlur?.enabled ?? (refocusBlurPx ?? 0) > 0}
            isRendering={isRendering}
            velocity={motionBlur?.velocity ?? { x: 0, y: 0 }}
            intensity={motionBlur?.intensity ?? 1.0}
            colorSpace={motionBlur?.colorSpace}
            gamma={motionBlur?.gamma}
            blackLevel={motionBlur?.blackLevel}
            saturation={motionBlur?.saturation}
            useWebglVideo={motionBlur?.useWebglVideo}
            samples={motionBlur?.samples}
            unpackPremultiplyAlpha={motionBlur?.unpackPremultiplyAlpha}
            drawWidth={motionBlurDrawWidth}
            drawHeight={motionBlurDrawHeight}
            renderScale={motionBlurRenderScale}
            videoFrame={isRendering ? motionBlurFrameRef.current : undefined}
            velocityThreshold={motionBlur?.velocityThreshold}
            rampRange={motionBlur?.rampRange}
            clampRadius={motionBlur?.clampRadius}
            smoothWindow={motionBlur?.smoothWindow}
            refocusBlurIntensity={
              // Motion blur takes priority over refocus blur - disable refocus when velocity > 5px
              Math.hypot(motionBlur?.velocity?.x ?? 0, motionBlur?.velocity?.y ?? 0) > 5
                ? 0
                : Math.min(1, (refocusBlurPx ?? 0) / 12)
            }
            isScrubbing={isScrubbing}
          >
            <AudioEnhancerWrapper enabled={enhanceAudio && !isRendering && !shouldMuteAudio}>
              <div style={{ display: 'contents' }}>
                <VideoComponent
                  key={`${recording.id}-${clipForVideo.id}-${effectiveUrl || 'no-url'}`}
                  src={effectiveUrl || ''}
                  crossOrigin="anonymous"
                  style={{
                    width: '100%', height: '100%',
                    objectFit: 'contain',
                    position: 'absolute', top: 0, left: 0,
                    borderRadius: `${cornerRadius}px`,
                    pointerEvents: 'none',
                    // Allow the stable framing background to show through letterbox/pillarbox areas
                    backgroundColor: 'transparent',
                    // Opacity applied on parent wrapper only to avoid double-application
                  }}
                  volume={() => effectiveVolume}
                  muted={shouldMuteAudio}
                  preload={preload}
                  playsInline={true}
                  pauseWhenBuffering={false}
                  startFrom={startFromFrames}
                  endAt={endAtFrames}
                  playbackRate={playbackRate}
                  onLoadedData={handleLoaded}
                  onCanPlay={handleLoaded}
                  onVideoFrame={isRendering && (motionBlur?.enabled ?? false) ? handleVideoFrame : undefined}
                  onError={(e: any) => {
                    // CRITICAL: Always signal "ready" to Remotion/Thumbnail generator even on error,
                    // otherwise delayRender() will time out and crash the app/export.
                    if (typeof handleVideoReady === 'function') {
                      // Safe to cast - we just need it to stop waiting
                      handleVideoReady(e as any);
                    }

                    // Self-healing: fallback to original source instead of crashing
                    if (!urlFailed) {
                      console.warn(`[VideoClipRenderer] Video error, falling back to source: ${recording.id}`, e?.target?.error);
                      setUrlFailed(true);
                    } else {
                      // Both proxy and source failed - log error but don't crash
                      console.error(`[VideoClipRenderer] Both proxy and source failed for ${recording.id}:`, e?.target?.error);
                    }
                  }}
                />
              </div>
            </AudioEnhancerWrapper>
          </MotionBlurWrapper>
          </div>
        </div>
      </Sequence>
    </div>
  );
});

VideoClipRenderer.displayName = 'VideoClipRenderer'
