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
import { Video, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Effect, WebcamEffectData, Clip, Recording } from '@/types/project';
import { DEFAULT_WEBCAM_DATA } from '@/features/webcam/config';
import { getWebcamLayout } from '@/features/effects/utils/webcam-layout';
import { clampCropData, DEFAULT_CROP_DATA } from '@/features/canvas/math/transforms/crop-transform';
import { useVideoPosition } from '../../context/layout/VideoPositionContext';
import { useVideoContainerCleanup } from '@/features/renderer/hooks/media/useVTDecoderCleanup';
import { usePlaybackSettings } from '@/features/renderer/context/playback/PlaybackSettingsContext';
import { calculateWebcamAnimations } from '@/features/effects/utils/webcam-animations';

interface WebcamLayerProps {
  webcamEffect?: Effect;  // Active webcam effect (timing source of truth)
  webcamVideoUrl?: string;
  webcamClip?: Clip;      // Used only for recordingId and sourceIn
  webcamRecording?: Recording;
}
/**
 * Get transform origin based on anchor position for natural scaling
 * Webcam should scale towards its anchor point
 */
function getTransformOrigin(anchor: WebcamEffectData['position']['anchor']): string {
  switch (anchor) {
    case 'top-left': return 'top left';
    case 'top-center': return 'top center';
    case 'top-right': return 'top right';
    case 'center-left': return 'center left';
    case 'center': return 'center center';
    case 'center-right': return 'center right';
    case 'bottom-left': return 'bottom left';
    case 'bottom-center': return 'bottom center';
    case 'bottom-right': return 'bottom right';
    default: return 'center center';
  }
}

export const WebcamLayer = React.memo(({
  webcamEffect,
  webcamVideoUrl,
  webcamClip,
  webcamRecording,
}: WebcamLayerProps) => {
  const frame = useCurrentFrame();
  const { fps, width: compositionWidth, height: compositionHeight } = useVideoConfig();
  const { playback } = usePlaybackSettings();
  const preload = 'auto';
  const effectiveVolume = Math.max(0, Math.min(1, playback.previewVolume ?? 1));
  const shouldMuteAudio = playback.previewMuted || effectiveVolume <= 0 || !webcamRecording?.hasAudio;

  const { zoomTransform } = useVideoPosition();
  const inverseCameraScale = zoomTransform?.scale ? 1 / zoomTransform.scale : 1;

  // Anchor to the full composition instead of the transformed video content.

  // Use the time-aware effect passed in from the composition.
  const effectToUse = webcamEffect;
  const data: WebcamEffectData = useMemo(
    () => (effectToUse?.data as WebcamEffectData) ?? DEFAULT_WEBCAM_DATA,
    [effectToUse]
  );

  // Calculate frames from EFFECT timing (single source of truth for visibility)
  const effectStartFrame = effectToUse
    ? Math.floor((effectToUse.startTime / 1000) * fps)
    : 0;
  const effectEndFrame = effectToUse
    ? Math.ceil((effectToUse.endTime / 1000) * fps)
    : 0;

  // Source offset comes from the clip (for video playback sync)
  const sourceInFrame = webcamClip
    ? Math.round((webcamClip.sourceIn / 1000) * fps)
    : 0;

  // Get entry/exit/pip animations (use effect timing)
  const { scale: animationScale, opacity: animationOpacity, translateY } = calculateWebcamAnimations(
    data,
    frame,
    fps,
    effectStartFrame,
    effectEndFrame
  );

  const webcamContainerRef = useVideoContainerCleanup(webcamVideoUrl);

  // Don't render if no webcam video, clip, or effect
  const hasWebcam = Boolean(webcamVideoUrl && webcamClip && effectToUse?.enabled !== false);
  if (!hasWebcam || !webcamClip) {
    return null;
  }

  // Calculate size and position relative to the full composition.
  const layout = getWebcamLayout(data, compositionWidth, compositionHeight);
  const webcamSize = Math.round(layout.size);
  const position = { x: Math.round(layout.x), y: Math.round(layout.y) };

  const finalScale = animationScale * inverseCameraScale;

  const finalOpacity = animationOpacity;

  // Container that covers the full composition so webcam is anchored to all layers.
  const overlayContainerStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: compositionWidth,
    height: compositionHeight,
    pointerEvents: 'none',
    zIndex: 20, // Sit above video (usually 0-10) and overlays (10-20)
  };

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: webcamSize,
    height: webcamSize,
    transform: `scale(${finalScale}) translateY(${translateY}px)`,
    transformOrigin: getTransformOrigin(data.position.anchor), // Scale towards anchor for natural feel
    opacity: finalOpacity,
    transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease-out', // Snappy animations
    // Use clip-path for true squircle (superellipse), fallback to border-radius for others
    borderRadius: data.shape === 'circle' ? '50%' : (data.shape === 'squircle' ? 0 : data.cornerRadius),
    clipPath: data.shape === 'squircle'
      ? 'path("M 0,50 C 0,0 0,0 50,0 S 100,0 100,50 100,100 50,100 0,100 0,50")' // Crude approximation, usually requires complex path based on size.
      // Better relative clip-path for squircle:
      : undefined,
    // Note: Standard CSS clip-path path() uses absolute units (px), which breaks resizing.
    // For responsive squircle we should use `mask-image` or an SVG reference, OR `inset() round` (which is just rounded rect).
    // Let's use a specific 'super-ellipse' style border-radius/clip-path technique if possible, or sticking to `cornerRadius` but ensuring it's not overriding to 50%.
    // Actually, the issue might be that `cornerRadius` IS 50% in the data? Re-checking config.
    // Config says squircle cornerRadius is 32.
    // Let's stick to border-radius for now but ensure it is applied.
    // User reported it looks like circle. Maybe `cornerRadius` is being treated as %, or is just too big relative to size?
    // If size is small, 32px might be close to circle.
    // Let's use a percentage for squircle to be safe? 
    // Apple icon is ~22%.
    overflow: 'hidden',
    backgroundColor: 'transparent',
    backfaceVisibility: 'hidden',
  };

  // Correct Squircle Implementation:
  // If shape is squircle, we override borderRadius to be relative to size for consistent look
  if (data.shape === 'squircle') {
    containerStyle.borderRadius = '20%'; // ~Apple squircle curvature
  }

  const sourceWidth = webcamRecording?.width || webcamSize;
  const sourceHeight = webcamRecording?.height || webcamSize;
  const sourceCrop = clampCropData(data.sourceCrop ?? DEFAULT_CROP_DATA);
  const renderCrop = data.mirror
    ? clampCropData({
      ...sourceCrop,
      x: 1 - sourceCrop.x - sourceCrop.width,
    })
    : sourceCrop;
  const cropCenterX = (renderCrop.x + renderCrop.width / 2) * sourceWidth;
  const cropCenterY = (renderCrop.y + renderCrop.height / 2) * sourceHeight;
  const cropWidthPx = Math.max(1, renderCrop.width * sourceWidth);
  const cropHeightPx = Math.max(1, renderCrop.height * sourceHeight);
  const scaleX = webcamSize / cropWidthPx;
  const scaleY = webcamSize / cropHeightPx;
  const scale = Math.max(scaleX, scaleY);
  const cropTranslateX = Math.round((webcamSize / 2 - cropCenterX * scale) * 1000) / 1000;
  const cropTranslateY = Math.round((webcamSize / 2 - cropCenterY * scale) * 1000) / 1000;
  const cropTransformStr = `translate3d(${cropTranslateX}px, ${cropTranslateY}px, 0) scale3d(${scale}, ${scale}, 1)`;
  const mirrorTransform = data.mirror ? 'scaleX(-1)' : 'none';

  const sourceStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: sourceWidth,
    height: sourceHeight,
    transform: cropTransformStr,
    transformOrigin: 'top left',
    willChange: 'transform',
  };

  const webcamStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    transform: mirrorTransform,
    transformOrigin: 'center',
    display: 'block',
    backgroundColor: 'transparent',
    backfaceVisibility: 'hidden',
    outline: 'none',
  };

  const borderStyle: React.CSSProperties = data.borderEnabled ? {
    border: `${data.borderWidth}px solid ${data.borderColor}`,
  } : {};

  const shadowStyle: React.CSSProperties = data.shadowEnabled ? {
    boxShadow: `${data.shadowOffsetX}px ${data.shadowOffsetY}px ${data.shadowBlur}px ${data.shadowColor}`,
  } : {};

  // Calculate duration in frames for the Sequence (using effect timing)
  const durationFrames = Math.max(1, effectEndFrame - effectStartFrame);

  return (
    <div style={overlayContainerStyle}>
      <div
        style={{
          ...containerStyle,
          ...borderStyle,
          ...shadowStyle,
        }}
        data-webcam-overlay="true"
      >
        <div style={sourceStyle} ref={webcamContainerRef}>
          {/* Wrap Video in Sequence so it has its own frame context starting from 0 */}
          <Sequence from={effectStartFrame} durationInFrames={durationFrames} layout="none">
            <Video
              src={webcamVideoUrl}
              style={webcamStyle}
              startFrom={sourceInFrame}
              volume={effectiveVolume}
              muted={shouldMuteAudio}
              preload={preload}
              playsInline={true}
            />
          </Sequence>
        </div>
      </div>
    </div>
  );
});

WebcamLayer.displayName = 'WebcamLayer';
