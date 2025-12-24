/**
 * VideoClipRenderer.tsx
 *
 * Renders video clips within a Remotion composition for EXPORT rendering.
 * Uses Remotion's Sequence component for precise frame timing.
 */
import React from 'react';
import { Sequence } from 'remotion';
import { useVideoUrl, isProxySufficientForTarget } from '@/remotion/hooks/useVideoUrl';
import { usePlaybackSettings } from '@/remotion/context/PlaybackSettingsContext';
import { useClipRenderState } from '@/remotion/hooks/useClipRenderState';
import { useVideoContainerCleanup } from '@/remotion/hooks/useVTDecoderCleanup';
import { AudioEnhancerWrapper } from '@/remotion/components/video-helpers';
import type { Clip, Recording } from '@/types/project';
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';
import type { SyntheticEvent } from 'react';

interface VideoClipRendererProps {
  clipForVideo: Clip;
  recording: Recording | undefined;
  startFrame: number;
  durationFrames: number;
  groupStartFrame: number;
  renderStartFrom: number;
  groupDuration: number;
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  cornerRadius: number;
  drawWidth: number;
  drawHeight: number;
  compositionWidth: number;
  compositionHeight: number;
  maxZoomScale: number;
  currentZoomScale: number;
  mockupEnabled?: boolean;
  activeLayoutItem: FrameLayoutItem | null;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
  overlapFrames: number;
  markRenderReady: (source?: string) => void;
  handleVideoReady: (e: SyntheticEvent<HTMLVideoElement>) => void;
  VideoComponent: any;
  premountFor: number;
  postmountFor: number;
}

export const VideoClipRenderer: React.FC<VideoClipRendererProps> = React.memo(({
  clipForVideo, recording, startFrame, durationFrames,
  groupStartFrame, renderStartFrom, groupDuration,
  currentFrame, fps, isRendering,
  cornerRadius, drawWidth, drawHeight,
  compositionWidth, compositionHeight, maxZoomScale, currentZoomScale, mockupEnabled,
  activeLayoutItem, prevLayoutItem, nextLayoutItem, shouldHoldPrevFrame,
  isNearBoundaryEnd, overlapFrames, markRenderReady, handleVideoReady,
  VideoComponent, premountFor, postmountFor,
}) => {
  // Get settings from context
  const { playback, renderSettings, resources } = usePlaybackSettings();
  const { isPlaying, isHighQualityPlaybackEnabled } = playback;
  const { isGlowMode, preferOffthreadVideo, enhanceAudio } = renderSettings;

  // Video URL resolution
  const videoUrl = useVideoUrl({
    recording, resources, preferOffthreadVideo,
    targetWidth: compositionWidth, targetHeight: compositionHeight,
    maxZoomScale, currentZoomScale, isGlowMode, isHighQualityPlaybackEnabled, isPlaying,
  });

  // VTDecoder cleanup
  const containerRef = useVideoContainerCleanup(videoUrl);

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

  // Opacity adjustment for generated active clip
  const isActiveClipGenerated = activeLayoutItem?.clip.recordingId?.startsWith('generated-');
  const isThisClipActive = activeLayoutItem?.clip.id === clipForVideo.id;
  const shouldHideForGeneratedActive = isActiveClipGenerated && !isThisClipActive;
  const effectiveOpacity = shouldHideForGeneratedActive ? 0 : renderState.effectiveOpacity;

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
          <AudioEnhancerWrapper enabled={enhanceAudio && !isRendering}>
            <VideoComponent
              key={videoUrl}
              src={videoUrl || ''}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover', // Match ImageClipRenderer behavior (was mockupEnabled ? 'cover' : 'contain')
                position: 'absolute', top: 0, left: 0,
                borderRadius: `${cornerRadius}px`,
                pointerEvents: 'none',
              }}
              volume={1}
              muted={false}
              pauseWhenBuffering={false}
              startFrom={renderStartFrom}
              playbackRate={playbackRate}
              {...(isRendering ? { onLoadedData: handleVideoReady, onCanPlay: handleVideoReady, onSeeked: handleVideoReady } : {})}
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
