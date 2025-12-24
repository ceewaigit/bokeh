/**
 * ImageClipRenderer.tsx
 *
 * Renders image clips (freeze frames, imported images) within a Remotion composition.
 */
import React, { useState, useEffect } from 'react';
import { Sequence, Img, staticFile } from 'remotion';
import { useClipRenderState } from '@/remotion/hooks/useClipRenderState';
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

  // Image URL resolution
  const [imageUrl, setImageUrl] = useState<string | null>(() => {
    return recording.filePath?.startsWith('data:') ? recording.filePath : null;
  });

  useEffect(() => {
    const resolveImageUrl = async () => {
      if (recording.filePath?.startsWith('data:')) {
        setImageUrl(recording.filePath);
        return;
      }

      const imagePath = recording.imageSource?.imagePath || recording.filePath;
      if (!imagePath) {
        setImageUrl(null);
        return;
      }

      if (isRendering) {
        if (imagePath.startsWith('file://') || imagePath.startsWith('/') || imagePath.startsWith('data:')) {
          setImageUrl(imagePath);
        } else {
          setImageUrl(staticFile(imagePath));
        }
        return;
      }

      try {
        if (window.electronAPI?.getVideoUrl) {
          const url = await window.electronAPI.getVideoUrl(imagePath);
          setImageUrl(url || null);
        } else {
          setImageUrl(imagePath);
        }
      } catch (err) {
        console.error('[ImageClipRenderer] Failed to resolve image URL:', err);
        setImageUrl(null);
      }
    };
    resolveImageUrl();
  }, [recording.filePath, recording.imageSource?.imagePath, isRendering]);

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
