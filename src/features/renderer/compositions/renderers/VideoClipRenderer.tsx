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
import { useVideoUrl, isProxySufficientForTarget } from '@/features/renderer/hooks/media/useVideoUrl';
import { usePlaybackSettings } from '@/features/renderer/context/playback/PlaybackSettingsContext';
import { useClipRenderState } from '@/features/renderer/hooks/render/useClipRenderState';
import { useVideoContainerCleanup } from '@/features/renderer/hooks/media/useVTDecoderCleanup';
import { AudioEnhancerWrapper } from '@/features/renderer/components/video-helpers';
import { msToFrame } from '@/features/renderer/compositions/utils/time/frame-time';
import { devAssert } from '@/shared/utils/invariant';
import { useComposition } from '@/features/renderer/context/CompositionContext';
import { useProjectStore } from '@/features/stores/project-store';
import type { Clip, Recording } from '@/types/project';
import type { SyntheticEvent } from 'react';
import { createVideoStreamUrl } from '@/features/recording/components/library/utils/recording-paths';
import { MotionBlurWrapper } from '@/features/motion-blur/components/MotionBlurWrapper';
import { useVideoPosition } from '@/features/renderer/context/layout/VideoPositionContext';

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
  } = videoPosition;

  // Derive current zoom scale from transform
  const currentZoomScale = (zoomTransform as any)?.scale ?? 1;

  // Get settings from context
  const { playback, renderSettings, resources } = usePlaybackSettings();
  const { isPlaying, isHighQualityPlaybackEnabled, previewMuted, previewVolume } = playback;
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

  const effectiveUrl = useMemo(() => {
    if (!urlFailed || !recording?.filePath) return videoUrl;
    // Fallback to original source file when proxy fails
    return createVideoStreamUrl(recording.filePath);
  }, [urlFailed, videoUrl, recording?.filePath]);

  // VTDecoder cleanup
  const containerRef = useVideoContainerCleanup(videoUrl);

  // Track video element reference for MotionBlurLayer
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Video frame for motion blur effect (populated by onVideoFrame callback)
  const [videoFrame, setVideoFrame] = useState<CanvasImageSource | null>(null);

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

    if (isRendering) {
      handleVideoReady(e);
      return;
    }
    if (video.readyState >= 2) {
      setPreviewReady(true);
    }
  }, [isRendering, handleVideoReady, setPreviewReady]);

  // Handle metadata loaded - check for zombie proxy here (dimensions guaranteed)
  const handleMetadataLoaded = useCallback((_e: SyntheticEvent<HTMLVideoElement>) => {
    // RELAXED CHECK: Only fail if we have enough data to play but still no dimensions.
    // Some browsers/codecs might fire metadata before dimensions are fully parsed (rare but possible).
    // UPDATE: Even H.264 proxies can briefly report 0x0 on load. We will disable this check
    // for now because the "Zombie" issue was specific to the broken HEVC files.
    // If a video is truly 0x0, it just won't render, which is better than crashing RAM by forcing 6K source.
    /*
    if ((video.videoWidth === 0 || video.videoHeight === 0) && video.readyState >= 2) {
      // Double-check we're not already using fallback to prevent loops
      if (!urlFailed) {
        console.warn(`[VideoClipRenderer] Zombie proxy detected (0×0): ${recording?.id}, falling back to source`);
        setUrlFailed(true);
      }
    }
    */
  }, []);

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

  // Sizing
  const needsHighRes = isHighQualityPlaybackEnabled
    && !isProxySufficientForTarget(compositionWidth, compositionHeight, currentZoomScale || (maxZoomScale ?? 1) || 1);
  const useHighResSizing = isRendering || needsHighRes;
  const playbackRate = clipForVideo.playbackRate && clipForVideo.playbackRate > 0 ? clipForVideo.playbackRate : 1;

  // Validate critical timing data in dev mode
  devAssert(groupStartSourceIn !== undefined, `groupStartSourceIn is undefined for clip ${clipForVideo.id}`)
  devAssert(fps > 0, `fps must be positive, got ${fps}`)

  const startFromFrames = msToFrame(groupStartSourceIn ?? 0, fps);
  const endAtFrames = Math.max(startFromFrames, startFromFrames + Math.max(1, groupDuration) - 1);

  // Opacity: purely based on render state (intro/outro/glow).
  const effectiveOpacity = renderState.effectiveOpacity;
  const effectiveVolume = Math.max(0, Math.min(1, previewVolume ?? 1));
  const shouldMuteAudio = previewMuted || effectiveVolume <= 0 || !recording?.hasAudio || renderState.isPreloading;

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>

      <Sequence from={groupStartFrame} durationInFrames={renderState.finalDuration} premountFor={premountFor} postmountFor={postmountFor}>
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
          {/* Motion blur dimensions must match video render dimensions:
              - Export: video renders at native res, scaled via CSS -> use native dims
              - Preview: video renders at display size -> use drawWidth/Height */}
            <MotionBlurWrapper
            enabled={motionBlur?.enabled ?? false}
            velocity={motionBlur?.velocity ?? { x: 0, y: 0 }}
            intensity={motionBlur?.intensity ?? 1.0}
            colorSpace={motionBlur?.colorSpace}
            gamma={motionBlur?.gamma}
            blackLevel={motionBlur?.blackLevel}
            saturation={motionBlur?.saturation}
            useWebglVideo={motionBlur?.useWebglVideo}
            samples={motionBlur?.samples}
            unpackPremultiplyAlpha={motionBlur?.unpackPremultiplyAlpha}
            drawWidth={useHighResSizing ? (recording?.width ?? drawWidth) : (motionBlur?.drawWidth ?? drawWidth)}
            drawHeight={useHighResSizing ? (recording?.height ?? drawHeight) : (motionBlur?.drawHeight ?? drawHeight)}
            renderScale={currentZoomScale}
            videoFrame={videoFrame}
            velocityThreshold={motionBlur?.velocityThreshold}
            rampRange={motionBlur?.rampRange}
            clampRadius={motionBlur?.clampRadius}
            smoothWindow={motionBlur?.smoothWindow}
          >
            <AudioEnhancerWrapper enabled={enhanceAudio && !isRendering && !shouldMuteAudio}>
              <VideoComponent
                key={`${recording.id}-${urlFailed ? 'fallback' : 'primary'}`}
                src={effectiveUrl || ''}
                crossOrigin="anonymous"
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  position: 'absolute', top: 0, left: 0,
                  borderRadius: `${cornerRadius}px`,
                  pointerEvents: 'none',
                }}
                volume={effectiveVolume}
                muted={shouldMuteAudio}
                preload={preload}
                playsInline={true}
                pauseWhenBuffering={false}
                startFrom={startFromFrames}
                endAt={endAtFrames}
                playbackRate={playbackRate}
                onLoadedData={handleLoaded}
                onLoadedMetadata={handleMetadataLoaded}
                onCanPlay={handleLoaded}
                onSeeked={isRendering ? handleVideoReady : undefined}
                onVideoFrame={(frame: CanvasImageSource) => {
                  // Debug: Log when onVideoFrame fires during export
                  if (isRendering && currentFrame % 30 === 0) {
                    console.log(`[MotionBlur] onVideoFrame fired at frame ${currentFrame}, frame type: ${frame?.constructor?.name}`);
                  }
                  setVideoFrame(frame);
                }}
                onError={(e: any) => {
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
            </AudioEnhancerWrapper>
          </MotionBlurWrapper>
        </div>
      </Sequence>
    </div>
  );
});

VideoClipRenderer.displayName = 'VideoClipRenderer'
