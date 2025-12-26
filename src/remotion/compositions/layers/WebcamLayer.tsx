/**
 * WebcamLayer - Renders webcam video as a Picture-in-Picture overlay
 *
 * Features:
 * - Multiple shape options (circle, rounded-rect, squircle, rectangle)
 * - Border and shadow styling
 * - Entry/exit/PiP animations
 * - Position and size controls
 * - Mirror option
 */

import React, { useMemo } from 'react';
import { AbsoluteFill, Video, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import type { Effect, WebcamEffectData, Clip, TrackType } from '@/types/project';
import { EffectType } from '@/types/project';
import { getWebcamEffect } from '@/lib/effects/effect-filters';
import { DEFAULT_WEBCAM_DATA } from '@/lib/constants/default-effects';

interface WebcamLayerProps {
  effects: Effect[];
  videoWidth: number;
  videoHeight: number;
  webcamVideoUrl?: string;
  webcamClip?: Clip;
}

/**
 * Generate CSS clip-path for different shapes
 */
function getClipPath(shape: WebcamEffectData['shape'], cornerRadius: number, size: number): string {
  switch (shape) {
    case 'circle':
      return 'circle(50% at 50% 50%)';
    case 'squircle':
      // Squircle approximation using superellipse-like path
      return `inset(0 round ${Math.min(cornerRadius, size / 2)}px)`;
    case 'rounded-rect':
      return `inset(0 round ${cornerRadius}px)`;
    case 'rectangle':
    default:
      return 'none';
  }
}

/**
 * Calculate position based on anchor and percentage values
 */
function calculatePosition(
  position: WebcamEffectData['position'],
  size: number,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  const webcamWidth = (size / 100) * containerWidth;
  const webcamHeight = webcamWidth; // Square aspect for PiP

  let x = (position.x / 100) * containerWidth;
  let y = (position.y / 100) * containerHeight;

  // Adjust based on anchor
  switch (position.anchor) {
    case 'top-left':
      break;
    case 'top-center':
      x -= webcamWidth / 2;
      break;
    case 'top-right':
      x -= webcamWidth;
      break;
    case 'center-left':
      y -= webcamHeight / 2;
      break;
    case 'center':
      x -= webcamWidth / 2;
      y -= webcamHeight / 2;
      break;
    case 'center-right':
      x -= webcamWidth;
      y -= webcamHeight / 2;
      break;
    case 'bottom-left':
      y -= webcamHeight;
      break;
    case 'bottom-center':
      x -= webcamWidth / 2;
      y -= webcamHeight;
      break;
    case 'bottom-right':
      x -= webcamWidth;
      y -= webcamHeight;
      break;
  }

  return { x, y };
}

/**
 * Calculate animation values
 */
function useWebcamAnimations(
  data: WebcamEffectData,
  startFrame: number,
  endFrame: number
): { scale: number; opacity: number; translateY: number } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryFrames = Math.round((data.animations.entry.durationMs / 1000) * fps);
  const exitFrames = Math.round((data.animations.exit.durationMs / 1000) * fps);

  let scale = 1;
  let opacity = data.opacity;
  let translateY = 0;

  // Entry animation
  if (frame < startFrame + entryFrames) {
    const progress = (frame - startFrame) / entryFrames;

    switch (data.animations.entry.type) {
      case 'fade':
        opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateRight: 'clamp' });
        break;
      case 'scale':
        const fromScale = data.animations.entry.from ?? 0.8;
        scale = interpolate(progress, [0, 1], [fromScale, 1], { extrapolateRight: 'clamp' });
        opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateRight: 'clamp' });
        break;
      case 'slide':
        translateY = interpolate(progress, [0, 1], [50, 0], { extrapolateRight: 'clamp' });
        opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateRight: 'clamp' });
        break;
      case 'bounce':
        scale = spring({
          frame: frame - startFrame,
          fps,
          config: { damping: 10, stiffness: 100 },
        });
        opacity = interpolate(progress, [0, 0.5], [0, data.opacity], { extrapolateRight: 'clamp' });
        break;
    }
  }

  // Exit animation
  if (frame > endFrame - exitFrames) {
    const progress = (endFrame - frame) / exitFrames;

    switch (data.animations.exit.type) {
      case 'fade':
        opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateLeft: 'clamp' });
        break;
      case 'scale':
        scale = interpolate(progress, [0, 1], [0.8, 1], { extrapolateLeft: 'clamp' });
        opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateLeft: 'clamp' });
        break;
    }
  }

  // PiP animation (subtle continuous motion)
  if (data.animations.pip.type !== 'none' && frame >= startFrame + entryFrames && frame <= endFrame - exitFrames) {
    const period = data.animations.pip.period ?? 3000;
    const amplitude = data.animations.pip.amplitude ?? 3;
    const periodFrames = (period / 1000) * fps;
    const cycleProgress = ((frame - startFrame) % periodFrames) / periodFrames;

    switch (data.animations.pip.type) {
      case 'float':
        translateY = Math.sin(cycleProgress * Math.PI * 2) * amplitude;
        break;
      case 'breathe':
        scale = 1 + Math.sin(cycleProgress * Math.PI * 2) * (amplitude / 100);
        break;
    }
  }

  return { scale, opacity, translateY };
}

export const WebcamLayer = React.memo(({
  effects,
  videoWidth,
  videoHeight,
  webcamVideoUrl,
  webcamClip,
}: WebcamLayerProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Get webcam effect data
  const webcamEffect = useMemo(() => getWebcamEffect(effects), [effects]);
  const data: WebcamEffectData = useMemo(
    () => (webcamEffect?.data as WebcamEffectData) ?? DEFAULT_WEBCAM_DATA,
    [webcamEffect]
  );

  // Don't render if no webcam video or effect is disabled
  if (!webcamVideoUrl || !webcamClip || webcamEffect?.enabled === false) {
    return null;
  }

  // Calculate frames for the webcam clip
  const clipStartFrame = Math.round((webcamClip.startTime / 1000) * fps);
  const clipEndFrame = Math.round(((webcamClip.startTime + webcamClip.duration) / 1000) * fps);

  // Don't render outside the clip range
  if (frame < clipStartFrame || frame >= clipEndFrame) {
    return null;
  }

  // Calculate size and position
  const webcamSize = (data.size / 100) * videoWidth;
  const position = calculatePosition(data.position, data.size, videoWidth, videoHeight);

  // Get animations
  const { scale, opacity, translateY } = useWebcamAnimations(data, clipStartFrame, clipEndFrame);

  // Build styles
  const clipPath = getClipPath(data.shape, data.cornerRadius, webcamSize);

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: webcamSize,
    height: webcamSize,
    transform: `scale(${scale}) translateY(${translateY}px)`,
    opacity,
    zIndex: 100,
  };

  const webcamStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    clipPath,
    transform: data.mirror ? 'scaleX(-1)' : 'none',
    borderRadius: data.shape === 'circle' ? '50%' : data.cornerRadius,
  };

  const borderStyle: React.CSSProperties = data.borderEnabled ? {
    border: `${data.borderWidth}px solid ${data.borderColor}`,
    borderRadius: data.shape === 'circle' ? '50%' : data.cornerRadius,
  } : {};

  const shadowStyle: React.CSSProperties = data.shadowEnabled ? {
    boxShadow: `${data.shadowOffsetX}px ${data.shadowOffsetY}px ${data.shadowBlur}px ${data.shadowColor}`,
  } : {};

  return (
    <div
      style={{
        ...containerStyle,
        ...borderStyle,
        ...shadowStyle,
        overflow: 'hidden',
      }}
    >
      <Video
        src={webcamVideoUrl}
        style={webcamStyle}
        startFrom={Math.round((webcamClip.sourceIn / 1000) * fps)}
        muted
      />
    </div>
  );
});

WebcamLayer.displayName = 'WebcamLayer';
