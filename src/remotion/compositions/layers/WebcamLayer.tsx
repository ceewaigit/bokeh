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
import { Video, Sequence, useCurrentFrame, interpolate, useVideoConfig, getRemotionEnvironment } from 'remotion';
import type { Effect, WebcamEffectData, Clip, Recording } from '@/types/project';
import { getWebcamEffect } from '@/lib/effects/effect-filters';
import { DEFAULT_WEBCAM_DATA } from '@/lib/constants/default-effects';
import { getWebcamLayout } from '@/lib/effects/utils/webcam-layout';
import { clampCropData, DEFAULT_CROP_DATA } from '../utils/transforms/crop-transform';
import { useVideoPosition } from '../../context/layout/VideoPositionContext';
import { useVideoContainerCleanup } from '@/remotion/hooks/media/useVTDecoderCleanup';
import { SafeVideo } from '@/remotion/components/video-helpers';
import { usePlaybackSettings } from '@/remotion/context/playback/PlaybackSettingsContext';
import { calculateWebcamAnimations } from '@/lib/effects/utils/webcam-animations';

interface WebcamLayerProps {
  effects: Effect[];
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
  effects,
  webcamEffect,
  webcamVideoUrl,
  webcamClip,
  webcamRecording,
}: WebcamLayerProps) => {
  const frame = useCurrentFrame();
  const { fps, width: compositionWidth, height: compositionHeight } = useVideoConfig();
  const { playback } = usePlaybackSettings();
  const { isRendering } = getRemotionEnvironment();
  // Keep component type stable during preview to avoid VTDecoder churn/blink.
  const useSafeVideo = isRendering;
  const WebcamVideo = useSafeVideo ? SafeVideo : Video;
  const preload = 'auto';
  const effectiveVolume = Math.max(0, Math.min(1, playback.previewVolume ?? 1));
  const shouldMuteAudio = playback.previewMuted || effectiveVolume <= 0 || !webcamRecording?.hasAudio;

  // Get zoom scale from VideoPositionContext for inverse scaling
  const { zoomTransform } = useVideoPosition();

  // Get webcam effect data (use passed-in effect, or find from effects array for backwards compat)
  const effectToUse = webcamEffect ?? getWebcamEffect(effects);
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

  // Visibility is controlled by parent (TimelineComposition) based on effect timing
  // No need to check frame range here - if we have an active effect, render it

  const containerRect = {
    x: 0,
    y: 0,
    width: compositionWidth,
    height: compositionHeight,
  };

  // Calculate size and position inside the actual video rect
  const layout = getWebcamLayout(data, containerRect.width, containerRect.height);
  const webcamSize = Math.round(layout.size);
  const position = { x: Math.round(layout.x), y: Math.round(layout.y) };

  // Zoom-responsive inverse scaling: shrink webcam when zooming in to focus on content
  // When zoomScale > 1 (zoomed in), webcam gets smaller
  // When zoomScale = 1 (normal), webcam is at full size (or slightly larger for prominence)
  const zoomScale = zoomTransform?.scale ?? 1;
  // Map zoom scale inversely: higher zoom = smaller webcam
  // At scale 1.0 -> webcam at 1.1 (slightly prominent)
  // At scale 2.0 -> webcam at 0.7 (smaller, out of the way)
  // At scale 3.0+ -> webcam at 0.55 (minimum size)
  const inverseZoomScale = interpolate(
    zoomScale,
    [1, 2, 3],
    [1.1, 0.7, 0.55],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Combine animation scale with zoom-responsive scale
  const finalScale = animationScale * inverseZoomScale;

  // Opacity reduction when zoomed in (optional setting)
  let finalOpacity = animationOpacity;
  if (data.reduceOpacityOnZoom && zoomScale > 1) {
    // Reduce opacity when zoomed in: at 2x zoom -> 60% opacity, at 3x+ -> 40%
    const zoomOpacityFactor = interpolate(
      zoomScale,
      [1, 2, 3],
      [1, 0.6, 0.4],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
    finalOpacity = animationOpacity * zoomOpacityFactor;
  }

  const overlayContainerStyle: React.CSSProperties = {
    position: 'absolute',
    left: containerRect.x,
    top: containerRect.y,
    width: containerRect.width,
    height: containerRect.height,
    pointerEvents: 'none'
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
    zIndex: 100,
    transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease-out', // Snappy animations
    // Always apply corner radius to container for consistent clipping
    borderRadius: data.shape === 'circle' ? '50%' : data.cornerRadius,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    backfaceVisibility: 'hidden',
  };

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
            <WebcamVideo
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
