/**
 * ImageClipRenderer.tsx
 *
 * Renders image clips (freeze frames, imported images) within a Remotion composition.
 */
import React, { useState, useEffect } from 'react';
import { Sequence, Img, staticFile } from 'remotion';
import { useClipRenderState } from '@/remotion/hooks/useClipRenderState';
import { useVideoUrl } from '@/remotion/hooks/useVideoUrl';
import { usePlaybackSettings } from '@/remotion/context/PlaybackSettingsContext';
import type { Clip, Recording } from '@/types/project';
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';

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
  cornerRadius: number;
  drawWidth: number;
  drawHeight: number;
  compositionWidth: number;
  compositionHeight: number;
  activeLayoutItem: FrameLayoutItem | null;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
  overlapFrames: number;
}

export const ImageClipRenderer: React.FC<ImageClipRendererProps> = ({
  clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
  currentFrame, fps, isRendering, cornerRadius, drawWidth, drawHeight,
  compositionWidth, compositionHeight,
  activeLayoutItem, prevLayoutItem, nextLayoutItem, shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
}) => {
  // Shared render state
  const renderState = useClipRenderState({
    clip: clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
    currentFrame, fps, isRendering, drawWidth, drawHeight,
    activeLayoutItem, prevLayoutItem, nextLayoutItem, shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
  });

  // Get settings from context for URL resolution
  const { resources } = usePlaybackSettings();

  // Unified URL resolution using shared hook
  // This handles video-stream:// protocol, proxy logic, and file paths consistently
  const imageUrl = useVideoUrl({
    recording,
    resources,
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
          opacity: renderState.effectiveOpacity,
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
        opacity: renderState.effectiveOpacity,
        borderRadius: effectiveRadius,
        overflow: 'hidden',
      }}>
        {isRendering ? (
          <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} draggable={false} />
        )}
      </div>
    </Sequence>
  );
};
