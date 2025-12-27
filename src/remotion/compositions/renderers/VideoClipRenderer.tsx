/**
 * VideoClipRenderer.tsx
 *
 * Renders video clips within a Remotion composition.
 * Uses Remotion's Sequence and Video components for frame-accurate timing.
 * Works for both preview and export modes.
 *
 * NOTE: This component is rendered OUTSIDE VideoPositionProvider, so it receives
 * layout data via props from SharedVideoController.
 */
import React, { useCallback } from 'react';
import { Sequence, useCurrentFrame, useVideoConfig, getRemotionEnvironment, Video } from 'remotion';
import { useVideoUrl, isProxySufficientForTarget } from '@/remotion/hooks/media/useVideoUrl';
import { usePlaybackSettings } from '@/remotion/context/playback/PlaybackSettingsContext';
import { useClipRenderState } from '@/remotion/hooks/render/useClipRenderState';
import { useVideoContainerCleanup } from '@/remotion/hooks/media/useVTDecoderCleanup';
import { AudioEnhancerWrapper } from '@/remotion/components/video-helpers';
import { msToFrame } from '@/remotion/compositions/utils/time/frame-time';
import { devAssert } from '@/lib/utils/invariant';
import { useComposition } from '@/remotion/context/CompositionContext';
import type { Clip, Recording } from '@/types/project';
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';
import type { SyntheticEvent } from 'react';

interface VideoClipRendererProps {
  clipForVideo: Clip;
  recording: Recording | undefined;
  startFrame: number;
  durationFrames: number;
  groupStartFrame: number;
  groupStartSourceIn: number;
  groupDuration: number;
  // Layout props (from SharedVideoController - can't use context as we're outside VideoPositionProvider)
  cornerRadius: number;
  drawWidth: number;
  drawHeight: number;
  maxZoomScale: number;
  currentZoomScale: number;
  activeLayoutItem: FrameLayoutItem | null;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  // Boundary state
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
  overlapFrames: number;
  // Render coordination
  markRenderReady: (source?: string) => void;
  handleVideoReady: (e: SyntheticEvent<HTMLVideoElement>) => void;
  VideoComponent: any;
  premountFor: number;
  postmountFor: number;
}

export const VideoClipRenderer: React.FC<VideoClipRendererProps> = React.memo(({
  clipForVideo, recording, startFrame, durationFrames,
  groupStartFrame, groupStartSourceIn, groupDuration,
  cornerRadius, drawWidth, drawHeight, maxZoomScale, currentZoomScale,
  activeLayoutItem, prevLayoutItem, nextLayoutItem,
  shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
  markRenderReady, handleVideoReady, VideoComponent,
  premountFor, postmountFor,
}) => {
  // Remotion hooks
  const currentFrame = useCurrentFrame();
  const { width: compositionWidth, height: compositionHeight } = useVideoConfig();
  const { isRendering } = getRemotionEnvironment();
  const { fps } = useComposition();

  // Get settings from context
  const { playback, renderSettings, resources } = usePlaybackSettings();
  const { isPlaying, isHighQualityPlaybackEnabled, previewMuted, previewVolume } = playback;
  const { isGlowMode, preferOffthreadVideo, enhanceAudio } = renderSettings;
  // KISS: Just use the VideoComponent directly - Remotion handles playback natively
  const preload = 'auto';

  // Video URL resolution
  const videoUrl = useVideoUrl({
    recording, resources, clipId: clipForVideo.id, preferOffthreadVideo,
    targetWidth: compositionWidth, targetHeight: compositionHeight,
    maxZoomScale, currentZoomScale, isGlowMode, isHighQualityPlaybackEnabled, isPlaying,
  });

  // VTDecoder cleanup
  const containerRef = useVideoContainerCleanup(videoUrl);

  // Handle video loaded event
  const handleLoaded = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    if (isRendering) {
      handleVideoReady(e);
    }
  }, [isRendering, handleVideoReady]);

  // Early return for invalid recordings
  if (!recording || recording.sourceType === 'generated' || !recording.filePath) {
    return null;
  }

  // Shared render state
  const renderState = useClipRenderState({
    clip: clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
    currentFrame, fps, isRendering, drawWidth, drawHeight,
    activeLayoutItem, prevLayoutItem, nextLayoutItem, shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
  });

  // Sizing
  const needsHighRes = isHighQualityPlaybackEnabled
    && !isProxySufficientForTarget(compositionWidth, compositionHeight, currentZoomScale || maxZoomScale || 1);
  const useHighResSizing = isRendering || needsHighRes;
  const playbackRate = clipForVideo.playbackRate && clipForVideo.playbackRate > 0 ? clipForVideo.playbackRate : 1;

  // Validate critical timing data in dev mode
  devAssert(groupStartSourceIn !== undefined, `groupStartSourceIn is undefined for clip ${clipForVideo.id}`)
  devAssert(fps > 0, `fps must be positive, got ${fps}`)

  const startFromFrames = msToFrame(groupStartSourceIn ?? 0, fps);
  const endAtFrames = Math.max(startFromFrames, startFromFrames + Math.max(1, groupDuration) - 1);

  // Opacity adjustment for generated active clip
  const isActiveClipGenerated = activeLayoutItem?.clip.recordingId?.startsWith('generated-');
  const isThisClipActive = activeLayoutItem?.clip.id === clipForVideo.id;
  const shouldHideForGeneratedActive = isActiveClipGenerated && !isThisClipActive;

  // Opacity: hide if this clip should be hidden for generated overlay
  const effectiveOpacity = shouldHideForGeneratedActive ? 0 : renderState.effectiveOpacity;
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
          <AudioEnhancerWrapper enabled={enhanceAudio && !isRendering && !shouldMuteAudio}>
            <VideoComponent
              key={`${recording.id}-${groupStartFrame}`}
              src={videoUrl || ''}
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
              onCanPlay={handleLoaded}
              onSeeked={isRendering ? handleVideoReady : undefined}
              onError={(e: any) => {
                console.error('[VideoClipRenderer] Video error:', { error: e?.target?.error ?? e, videoUrl, recordingId: recording.id });
                markRenderReady('video-error');
              }}
            />
          </AudioEnhancerWrapper>
        </div>
      </Sequence>
    </div>
  );
});
