/**
 * ImageClipRenderer.tsx
 *
 * Renders image clips (freeze frames, imported images) within a Remotion composition.
 */
import React from 'react';
import { Sequence, Img } from 'remotion';
import { useClipRenderState } from '@/features/renderer/hooks/render/useClipRenderState';
import { useVideoUrl } from '@/features/renderer/hooks/media/useVideoUrl';
import { usePlaybackSettings } from '@/features/renderer/context/playback/PlaybackSettingsContext';
import type { Clip, Recording } from '@/types/project';
import { useVideoPosition } from '@/features/renderer/context/layout/VideoPositionContext';

interface ImageClipRendererProps {
  clipForVideo: Clip;
  recording: Recording;
  startFrame: number;
  durationFrames: number;
  groupStartFrame: number;
  groupDuration: number;
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  compositionWidth: number;
  compositionHeight: number;
}

export const ImageClipRenderer: React.FC<ImageClipRendererProps> = ({
  clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
  currentFrame, fps, isRendering,
  compositionWidth, compositionHeight,
}) => {
  // Shared render state
  const renderState = useClipRenderState({
    clip: clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
    currentFrame, fps, isRendering
  });

  const { cornerRadius = 0, drawWidth, drawHeight, useParentFade } = useVideoPosition();
  const visualOpacity = useParentFade ? 1 : renderState.effectiveOpacity;

  // Get settings from context for URL resolution
  const { resources } = usePlaybackSettings();

  // Unified URL resolution using shared hook
  // This handles video-stream:// protocol, proxy logic, and file paths consistently
  const imageUrl = useVideoUrl({
    recording,
    resources,
    clipId: clipForVideo.id,
    preferOffthreadVideo: false,
    targetWidth: compositionWidth,
    targetHeight: compositionHeight,
    maxZoomScale: 1,
    currentZoomScale: 1,
    isGlowMode: false,
    isHighQualityPlaybackEnabled: false,
    isPlaying: isRendering
  });

  // Effective corner radius
  const effectiveRadius = cornerRadius / Math.min(renderState.scaleX, renderState.scaleY);

  if (!imageUrl) {
    return (
      <Sequence from={groupStartFrame} durationInFrames={renderState.finalDuration}>
        <div style={{
          width: drawWidth, height: drawHeight,
          backgroundColor: '#1a1a1a',
          opacity: visualOpacity,
          borderRadius: cornerRadius,
        }} />
      </Sequence>
    );
  }

  return (
    <Sequence from={groupStartFrame} durationInFrames={renderState.finalDuration}>
      <div style={{
        width: renderState.baseWidth,
        height: renderState.baseHeight,
        transform: renderState.scaleTransform,
        transformOrigin: '0 0',
        position: 'absolute',
        top: 0,
        left: 0,
        opacity: visualOpacity,
        borderRadius: effectiveRadius,
        overflow: 'hidden',
      }}>
        <Img
          src={imageUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: isRendering ? 'auto' : 'none'
          }}
          draggable={false}
        />
      </div>
    </Sequence>
  );
};
