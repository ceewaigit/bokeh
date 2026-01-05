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
import type { WebcamLayoutData, Clip, Recording } from '@/types/project';
import { DEFAULT_WEBCAM_DATA, WEBCAM_POSITION_PRESETS } from '@/features/media/webcam/config';
import { getWebcamLayout } from '@/features/effects/utils/webcam-layout';
import { clampCropData, DEFAULT_CROP_DATA } from '@/features/rendering/canvas/math/transforms/crop-transform';
import { useVideoPosition } from '../../context/layout/VideoPositionContext';
import { useVideoContainerCleanup } from '@/features/rendering/renderer/hooks/media/useVTDecoderCleanup';
import { usePlaybackSettings } from '@/features/rendering/renderer/context/playback/PlaybackSettingsContext';
import { calculateWebcamAnimations } from '@/features/effects/utils/webcam-animations';
import { useOverlayContext } from '@/features/rendering/overlays/overlay-context';
import { useComposition } from '../../context/CompositionContext';

interface WebcamLayerProps {
  webcamVideoUrl?: string;
  webcamClip?: Clip;      // Source of truth for timing and layout
  webcamRecording?: Recording;
  opacity?: number;       // External opacity control (e.g. for global skips)
  isSkipped?: boolean;
}

/**
 * Get transform origin based on anchor position for natural scaling
 * Webcam should scale towards its anchor point
 */
function getTransformOrigin(anchor: WebcamLayoutData['position']['anchor']): string {
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
  webcamVideoUrl,
  webcamClip,
  webcamRecording,
  opacity = 1,
  isSkipped = false,
}: WebcamLayerProps) => {
  const { videoWidth, videoHeight } = useComposition();


  const frame = useCurrentFrame();
  const { fps, width: compositionWidth, height: compositionHeight } = useVideoConfig();
  const { playback } = usePlaybackSettings();
  const { displacedEffectIds, resolvedAnchors } = useOverlayContext();
  const preload = 'auto';
  const effectiveVolume = Math.max(0, Math.min(1, playback.previewVolume ?? 1));
  const shouldMuteAudio = playback.previewMuted || effectiveVolume <= 0 || !webcamRecording?.hasAudio;

  // Timeline-Centric: clip.layout is the single source of truth for webcam styling
  const data: WebcamLayoutData = useMemo(() => {
    const layout = webcamClip?.layout ?? DEFAULT_WEBCAM_DATA;
    const resolvedAnchor = webcamClip ? resolvedAnchors.get(webcamClip.id) : undefined;

    if (resolvedAnchor && resolvedAnchor !== layout.position.anchor) {
      const preset = WEBCAM_POSITION_PRESETS[resolvedAnchor];
      if (preset) {
        return {
          ...layout,
          position: {
            ...layout.position,
            x: preset.x,
            y: preset.y,
            anchor: preset.anchor
          }
        };
      }
    }
    return layout;
  }, [webcamClip, resolvedAnchors]);

  // Timeline-Centric: clip timing is the source of truth
  const timing = useMemo(() => {
    if (webcamClip) {
      return { start: webcamClip.startTime, end: webcamClip.startTime + webcamClip.duration };
    }
    return { start: 0, end: 0 };
  }, [webcamClip]);

  // Calculate frames from timing
  const effectStartFrame = Math.floor((timing.start / 1000) * fps);
  const effectEndFrame = Math.ceil((timing.end / 1000) * fps);

  // Source offset comes from the clip (for video playback sync)
  const sourceInFrame = webcamClip
    ? Math.round((webcamClip.sourceIn / 1000) * fps)
    : 0;

  // Get entry/exit/pip animations
  const { scale: animationScale, opacity: animationOpacity, translateY } = calculateWebcamAnimations(
    data,
    frame,
    fps,
    effectStartFrame,
    effectEndFrame
  );

  const webcamContainerRef = useVideoContainerCleanup(webcamVideoUrl);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const { zoomTransform } = useVideoPosition();

  // Don't render if no webcam video or valid source, or if displaced
  const isDisplaced = webcamClip ? displacedEffectIds.has(webcamClip.id) : false;
  const hasWebcam = Boolean(webcamVideoUrl && webcamClip && !isDisplaced);

  // PERF: Memoize layout calculations - only recompute when data or composition size changes
  const layout = useMemo(() => {
    if (!hasWebcam) return null;
    return getWebcamLayout(data, compositionWidth, compositionHeight);
  }, [data, compositionWidth, compositionHeight, hasWebcam]);

  const webcamSize = layout ? Math.round(layout.size) : 0;
  const position = layout ? { x: Math.round(layout.x), y: Math.round(layout.y) } : { x: 0, y: 0 };

  // PERF: Memoize static overlay container style
  const overlayContainerStyle = useMemo<React.CSSProperties>(() => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: compositionWidth,
    height: compositionHeight,
    pointerEvents: 'none',
    zIndex: 20,
  }), [compositionWidth, compositionHeight]);

  // PERF: Memoize static container style properties (excluding animated transform/opacity)
  const staticContainerStyle = useMemo<React.CSSProperties>(() => ({
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: webcamSize,
    height: webcamSize,
    transformOrigin: getTransformOrigin(data.position.anchor),
    borderRadius: data.shape === 'circle' ? '50%' : (data.shape === 'squircle' ? '20%' : data.cornerRadius),
    overflow: 'hidden',
    backgroundColor: 'transparent',
    backfaceVisibility: 'hidden',
  }), [position.x, position.y, webcamSize, data.position.anchor, data.shape, data.cornerRadius]);

  // PERF: Memoize source crop calculations
  const sourceWidth = webcamRecording?.width || webcamSize;
  const sourceHeight = webcamRecording?.height || webcamSize;

  const cropData = useMemo(() => {
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
    return {
      cropTransformStr: `translate3d(${cropTranslateX}px, ${cropTranslateY}px, 0) scale3d(${scale}, ${scale}, 1)`,
      mirrorTransform: data.mirror ? 'scaleX(-1)' : 'none',
    };
  }, [data.sourceCrop, data.mirror, sourceWidth, sourceHeight, webcamSize]);

  // PERF: Memoize source style
  const sourceStyle = useMemo<React.CSSProperties>(() => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: sourceWidth,
    height: sourceHeight,
    transform: cropData.cropTransformStr,
    transformOrigin: 'top left',
    willChange: 'transform',
  }), [sourceWidth, sourceHeight, cropData.cropTransformStr]);

  // PERF: Memoize webcam video style
  const webcamStyle = useMemo<React.CSSProperties>(() => ({
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    transform: cropData.mirrorTransform,
    transformOrigin: 'center',
    display: 'block',
    backgroundColor: 'transparent',
    backfaceVisibility: 'hidden',
    outline: 'none',
  }), [cropData.mirrorTransform]);

  // PERF: Memoize border and shadow styles
  const borderStyle = useMemo<React.CSSProperties>(() =>
    data.borderEnabled ? {
      border: `${data.borderWidth}px solid ${data.borderColor}`,
    } : {},
    [data.borderEnabled, data.borderWidth, data.borderColor]);

  const shadowStyle = useMemo<React.CSSProperties>(() =>
    data.shadowEnabled ? {
      boxShadow: `${data.shadowOffsetX}px ${data.shadowOffsetY}px ${data.shadowBlur}px ${data.shadowColor}`,
    } : {},
    [data.shadowEnabled, data.shadowOffsetX, data.shadowOffsetY, data.shadowBlur, data.shadowColor]);

  // Early return after all hooks
  // OPTIMIZATION: If skipped or fully transparent, UNMOUNT to save GPU decoder
  if (!hasWebcam || !webcamClip || !webcamRecording) {
    return null;
  }

  // ANIMATED VALUES - These change per frame and are applied inline
  const inverseCameraScale = zoomTransform?.scale ? 1 / zoomTransform.scale : 1;
  const zoomInfluence = data.zoomInfluence ?? 1;
  const effectiveScale = 1 + (inverseCameraScale - 1) * zoomInfluence;
  const finalScale = animationScale * effectiveScale;
  const finalOpacity = animationOpacity * opacity;

  // Calculate duration in frames for the Sequence (using effect timing)
  const durationFrames = Math.max(1, effectEndFrame - effectStartFrame);

  return (
    <div style={overlayContainerStyle}>
      <div
        style={{
          ...staticContainerStyle,
          ...borderStyle,
          ...shadowStyle,
          // Animated properties applied inline (change per frame)
          transform: `scale(${finalScale}) translateY(${translateY}px)`,
          opacity: finalOpacity,
        }}
        data-webcam-overlay="true"
      >
        <div style={sourceStyle} ref={webcamContainerRef}>
          {/* Wrap Video in Sequence so it has its own frame context starting from 0 */}
          {/* premountFor/postmountFor: Pre-load video 30 frames before/after visibility
              This fixes the scrubbing issue where webcam disappears when seeking to middle of clip */}
          {/* @ts-expect-error - Remotion types might be missing these props but they are supported and required for scrubbing */}
          <Sequence from={effectStartFrame} durationInFrames={durationFrames} layout="none" premountFor={30} postmountFor={30}>
            <Video
              src={webcamVideoUrl}
              style={webcamStyle}
              startFrom={sourceInFrame}
              volume={effectiveVolume}
              muted={shouldMuteAudio}
              preload={preload}
              playsInline={true}
              ref={videoRef}
              onError={(e) => {
                console.warn('[WebcamLayer] Video error, attempting recovery:', e);
                // Attempt to recover by reloading using the ref
                if (videoRef.current) {
                  const videoEl = videoRef.current;
                  setTimeout(() => {
                    videoEl.load();
                  }, 1000);
                }
              }}
            />
          </Sequence>
        </div>
      </div>
    </div>
  );
});

WebcamLayer.displayName = 'WebcamLayer';
