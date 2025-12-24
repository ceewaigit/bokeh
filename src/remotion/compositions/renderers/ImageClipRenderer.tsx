/**
 * ImageClipRenderer.tsx
 *
 * Renders image clips (freeze frames, imported images) within a Remotion composition.
 * Similar to VideoClipRenderer but for static images.
 *
 * Key responsibilities:
 * - Loads image from file path or data URL
 * - Wraps in Remotion Sequence for proper timing
 * - Handles fade-in/out transitions
 * - Applies corner radius and other styling
 * - Scales image to match target dimensions
 *
 * Used for:
 * - Cursor return freeze frames (freeze frame + synthetic cursor animation)
 * - Imported static images (PNG, JPG, etc.)
 *
 * @see GeneratedClipRenderer for plugin-based clips
 * @see VideoClipRenderer for video-based clips
 */
import React, { useMemo, useState, useEffect } from 'react';
import { Sequence, Img, staticFile } from 'remotion';
import type { ImageClipRendererProps } from '@/types';
import {
  calculateClipFadeDurations,
  calculateClipFadeOpacity,
  calculateGlowCrossfadeOpacity,
} from '../utils/clip-fade';

// ============================================================================
// COMPONENT
// ============================================================================
export const ImageClipRenderer: React.FC<ImageClipRendererProps> = ({
  clipForVideo,
  recording,
  startFrame,
  durationFrames,
  groupStartFrame,
  groupDuration,
  currentFrame,
  fps,
  isRendering,
  cornerRadius,
  drawWidth,
  drawHeight,
  compositionWidth,
  compositionHeight,
  activeLayoutItem,
  prevLayoutItem,
  nextLayoutItem,
  shouldHoldPrevFrame,
  isNearBoundaryEnd,
  overlapFrames,
  resources,
  renderSettings,
}) => {
  const { isGlowMode } = renderSettings;

  // ==========================================================================
  // IMAGE URL RESOLUTION
  // ==========================================================================
  const [imageUrl, setImageUrl] = useState<string | null>(() => {
    return recording.filePath?.startsWith('data:') ? recording.filePath : null;
  });

  useEffect(() => {
    const resolveImageUrl = async () => {
      // Check if it's already a data URL
      if (recording.filePath?.startsWith('data:')) {
        setImageUrl(recording.filePath);
        return;
      }

      // Check imageSource for the path
      const imagePath = recording.imageSource?.imagePath || recording.filePath;

      if (!imagePath) {
        console.warn('[ImageClipRenderer] No image path found');
        setImageUrl(null);
        return;
      }

      // For export mode, use staticFile if path is relative
      if (isRendering) {
        // In export, images should be available via staticFile or absolute URL
        // If it's a file:// URL or absolute path, convert it
        if (imagePath.startsWith('file://')) {
          setImageUrl(imagePath);
        } else if (imagePath.startsWith('/') || imagePath.startsWith('data:')) {
          setImageUrl(imagePath);
        } else {
          // Assume it's in public folder for export
          setImageUrl(staticFile(imagePath));
        }
        return;
      }

      // For preview mode, get URL from Electron API
      try {
        if (window.electronAPI?.getVideoUrl) {
          // Reuse getVideoUrl for images (works with any file path)
          const url = await window.electronAPI.getVideoUrl(imagePath);
          setImageUrl(url || null);
        } else {
          // Fallback for non-Electron environments
          setImageUrl(imagePath);
        }
      } catch (err) {
        console.error('[ImageClipRenderer] Failed to resolve image URL:', err);
        setImageUrl(null);
      }
    };

    resolveImageUrl();
  }, [recording.filePath, recording.imageSource?.imagePath, isRendering]);

  // ==========================================================================
  // SEQUENCE TIMING CALCULATIONS
  // ==========================================================================
  const currentClipEndFrame = startFrame + durationFrames;
  const durationFromGroupStart = currentClipEndFrame - groupStartFrame;

  // Determine if this clip should hold its last frame during transitions
  const isHoldPrevClip = !isRendering && shouldHoldPrevFrame && prevLayoutItem?.clip.id === clipForVideo.id;
  const isHoldActiveClipAtEnd = !isRendering && isNearBoundaryEnd && activeLayoutItem?.clip.id === clipForVideo.id;
  const isHoldClip = isHoldPrevClip || isHoldActiveClipAtEnd;

  // Calculate gap between this clip and the next
  const gapFrames = nextLayoutItem ? Math.max(0, nextLayoutItem.startFrame - currentClipEndFrame) : 0;
  const finalDuration = Math.max(groupDuration, durationFromGroupStart + (isHoldClip ? overlapFrames : gapFrames));

  // Calculate local frame position
  const localFrameRaw = currentFrame - startFrame;
  const localFrame = isHoldClip ? Math.min(localFrameRaw, durationFrames - 1) : localFrameRaw;

  // ==========================================================================
  // FADE & CROSSFADE CALCULATIONS
  // ==========================================================================
  const isNextContiguous = nextLayoutItem && nextLayoutItem.groupId === activeLayoutItem?.groupId;
  const isPrevContiguous = prevLayoutItem && prevLayoutItem.groupId === activeLayoutItem?.groupId;

  // Glow mode intro/outro triggers
  const wantsGlowIntro = isGlowMode && (
    (clipForVideo.id === activeLayoutItem?.clip.id && shouldHoldPrevFrame && !isPrevContiguous) ||
    (clipForVideo.id === nextLayoutItem?.clip.id && !isNextContiguous)
  );
  const wantsGlowOutro = isGlowMode && (
    (clipForVideo.id === activeLayoutItem?.clip.id && isNearBoundaryEnd && !isNextContiguous) ||
    (clipForVideo.id === prevLayoutItem?.clip.id && !isPrevContiguous)
  );

  const { introFadeDuration, outroFadeDuration } = calculateClipFadeDurations(
    clipForVideo, fps, isGlowMode, wantsGlowIntro, wantsGlowOutro
  );

  const fadeOpacity = calculateClipFadeOpacity({ localFrame, durationFrames, introFadeDuration, outroFadeDuration });
  const glowOpacityOverride = calculateGlowCrossfadeOpacity({
    isGlowMode, clipId: clipForVideo.id, currentFrame, fps, shouldHoldPrevFrame,
    isNearBoundaryEnd, prevLayoutItem, activeLayoutItem, nextLayoutItem,
  });

  // ==========================================================================
  // OPACITY CALCULATION
  // ==========================================================================
  const needsFade = introFadeDuration > 0 || outroFadeDuration > 0;
  const isPreloading = currentFrame < startFrame;
  const effectiveOpacity = isPreloading
    ? 0
    : (glowOpacityOverride ?? (needsFade ? fadeOpacity : 1));

  // ==========================================================================
  // SCALING
  // ==========================================================================
  const baseWidth = recording.width || drawWidth;
  const baseHeight = recording.height || drawHeight;
  const scaleX = baseWidth > 0 ? drawWidth / baseWidth : 1;
  const scaleY = baseHeight > 0 ? drawHeight / baseHeight : 1;

  // ==========================================================================
  // RENDER
  // ==========================================================================
  if (!imageUrl) {
    // Render placeholder while loading
    return (
      <Sequence from={groupStartFrame} durationInFrames={finalDuration}>
        <div
          style={{
            width: drawWidth,
            height: drawHeight,
            backgroundColor: '#1a1a1a',
            opacity: effectiveOpacity,
            borderRadius: cornerRadius,
          }}
        />
      </Sequence>
    );
  }

  return (
    <Sequence from={groupStartFrame} durationInFrames={finalDuration}>
      <div
        style={{
          width: baseWidth,
          height: baseHeight,
          transform: `scale(${scaleX}, ${scaleY})`,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: effectiveOpacity,
          borderRadius: cornerRadius / Math.min(scaleX, scaleY), // Adjust for scaling
          overflow: 'hidden',
        }}
      >
        {isRendering ? (
          // Use Remotion's Img for export (frame-accurate)
          <Img
            src={imageUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          // Use native img for preview (faster)
          <img
            src={imageUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              pointerEvents: 'none',
            }}
            draggable={false}
          />
        )}
      </div>
    </Sequence>
  );
};
