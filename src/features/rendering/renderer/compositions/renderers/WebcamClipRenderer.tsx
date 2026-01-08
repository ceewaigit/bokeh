/**
 * WebcamClipRenderer - Renders a single webcam clip with stable Sequence timing
 *
 * Architecture: Each webcam clip gets its own renderer instance with:
 * - Stable Sequence timing (doesn't change)
 * - Own video URL resolution
 * - premountFor/postmountFor for smooth seeking
 *
 * This matches the VideoClipRenderer architecture, preventing the unmount/remount
 * issues that occurred with the single-instance WebcamLayer approach.
 */

import React, { useMemo } from 'react';
import { Video, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { WebcamLayoutData, Clip, Recording } from '@/types/project';
import type { VideoResources } from '@/types';
import { OverlayAnchor } from '@/types/overlays';
import type { PlaybackSettings } from '@/features/rendering/renderer/types';
import { DEFAULT_WEBCAM_DATA, WEBCAM_POSITION_PRESETS } from '@/features/media/webcam/config';
import { getWebcamLayout } from '@/features/effects/utils/webcam-layout';
import { clampCropData, DEFAULT_CROP_DATA, isFullFrameCrop } from '@/features/rendering/canvas/math/transforms/crop-transform';
import { useVideoPosition } from '../../context/layout/VideoPositionContext';
import { useVideoContainerCleanup } from '@/features/rendering/renderer/hooks/media/useVTDecoderCleanup';
import { calculateWebcamAnimations } from '@/features/effects/utils/webcam-animations';
import { useOverlayContext } from '@/features/rendering/overlays/overlay-context';
import { useComposition } from '../../context/CompositionContext';
import { useVideoUrl } from '../../hooks/media/useVideoUrl';
import { useProjectStore } from '@/features/core/stores/project-store';
import { isProxySufficientForTarget } from '@/shared/utils/resolution-utils';

interface WebcamClipRendererProps {
    clip: Clip;
    recording: Recording;
    resources: VideoResources;
    playback: PlaybackSettings;
    fps: number;
    globalOpacity?: number;
}

/**
 * Get transform origin based on anchor position for natural scaling
 */
function getTransformOrigin(anchor: WebcamLayoutData['position']['anchor']): string {
    switch (anchor) {
        case OverlayAnchor.TopLeft: return 'top left';
        case OverlayAnchor.TopCenter: return 'top center';
        case OverlayAnchor.TopRight: return 'top right';
        case OverlayAnchor.CenterLeft: return 'center left';
        case OverlayAnchor.Center: return 'center center';
        case OverlayAnchor.CenterRight: return 'center right';
        case OverlayAnchor.BottomLeft: return 'bottom left';
        case OverlayAnchor.BottomCenter: return 'bottom center';
        case OverlayAnchor.BottomRight: return 'bottom right';
        default: return 'center center';
    }
}

export const WebcamClipRenderer = React.memo(({
    clip,
    recording,
    resources,
    playback,
    fps,
    globalOpacity = 1,
}: WebcamClipRendererProps) => {
    const { videoWidth, videoHeight } = useComposition();
    const isScrubbing = useProjectStore((s) => s.isScrubbing);
    const frame = useCurrentFrame();
    const { width: compositionWidth, height: compositionHeight } = useVideoConfig();
    const { displacedEffectIds, resolvedAnchors } = useOverlayContext();
    const { zoomTransform } = useVideoPosition();

    const preload = 'auto';
    const effectiveVolume = Math.max(0, Math.min(1, playback.previewVolume ?? 1));
    const shouldMuteAudio = playback.previewMuted || effectiveVolume <= 0 || !recording.hasAudio;

    // Stable timing from clip (doesn't change)
    const startFrame = Math.floor((clip.startTime / 1000) * fps);
    const endFrame = Math.ceil(((clip.startTime + clip.duration) / 1000) * fps);
    const durationFrames = Math.max(1, endFrame - startFrame);
    const sourceInFrame = Math.round(((clip.sourceIn ?? 0) / 1000) * fps);

    // Layout data from clip
    const data: WebcamLayoutData = useMemo(() => {
        const layout = clip.layout ?? DEFAULT_WEBCAM_DATA;
        const resolvedAnchor = resolvedAnchors.get(clip.id);

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
    }, [clip, resolvedAnchors]);

    // Calculate webcam target size for proxy selection
    const webcamTargetSize = useMemo(() => {
        const { size } = getWebcamLayout(data, videoWidth, videoHeight);
        const maxScale = 1.2;
        const targetSize = Math.max(1, Math.round(size * maxScale));
        return { width: targetSize, height: targetSize };
    }, [data, videoWidth, videoHeight]);

    // Video URL resolution with proxy logic
    // Note: Proxy availability is determined by useVideoUrl internally via the proxy store
    // The forceProxy flag is used to hint that proxy should be preferred for small target sizes
    const forceProxy = useMemo(() => {
        // For webcam overlays, proxy is almost always sufficient since they're small on screen
        // Let useVideoUrl resolve the actual proxy URL from the store
        return isProxySufficientForTarget(webcamTargetSize.width, webcamTargetSize.height, 1);
    }, [webcamTargetSize.width, webcamTargetSize.height]);

    const videoUrl = useVideoUrl({
        recording,
        resources,
        clipId: clip.id,
        targetWidth: webcamTargetSize.width,
        targetHeight: webcamTargetSize.height,
        isHighQualityPlaybackEnabled: playback.isHighQualityPlaybackEnabled,
        forceProxy,
        isPlaying: playback.isPlaying,
        isScrubbing,
    });

    const webcamContainerRef = useVideoContainerCleanup(videoUrl);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    // Check if displaced by overlay conflict resolution
    const isDisplaced = displacedEffectIds.has(clip.id);

    // Animation calculations
    const { scale: animationScale, opacity: animationOpacity, translateY } = calculateWebcamAnimations(
        data,
        frame,
        fps,
        startFrame,
        endFrame
    );

    // Layout calculations
    const layout = useMemo(() => {
        return getWebcamLayout(data, compositionWidth, compositionHeight);
    }, [data, compositionWidth, compositionHeight]);

    const webcamSize = Math.round(layout.size);
    const position = { x: Math.round(layout.x), y: Math.round(layout.y) };

    // Source dimensions (with fallback for loading)
    const sourceWidth = recording.width || 1280;
    const sourceHeight = recording.height || 720;

    // Crop calculations
    const cropData = useMemo(() => {
        let sourceCrop = clampCropData(data.sourceCrop ?? DEFAULT_CROP_DATA);

        // Smart Center Crop for non-square sources
        if (isFullFrameCrop(sourceCrop) && sourceWidth > 0 && sourceHeight > 0) {
            const sourceAspect = sourceWidth / sourceHeight;
            if (Math.abs(sourceAspect - 1) > 0.01) {
                let cropW = 1, cropH = 1;
                if (sourceAspect > 1) {
                    cropW = 1 / sourceAspect;
                } else {
                    cropH = sourceAspect;
                }
                sourceCrop = {
                    width: cropW,
                    height: cropH,
                    x: (1 - cropW) / 2,
                    y: (1 - cropH) / 2
                };
            }
        }

        return {
            mirrorTransform: data.mirror ? 'scaleX(-1)' : 'none',
        };
    }, [data.sourceCrop, data.mirror, sourceWidth, sourceHeight]);

    // Styles
    const overlayContainerStyle = useMemo<React.CSSProperties>(() => ({
        position: 'absolute',
        left: 0,
        top: 0,
        width: compositionWidth,
        height: compositionHeight,
        pointerEvents: 'none',
        zIndex: 20,
    }), [compositionWidth, compositionHeight]);

    const staticContainerStyle = useMemo<React.CSSProperties>(() => ({
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: webcamSize,
        height: webcamSize,
        transformOrigin: getTransformOrigin(data.position.anchor),
        borderRadius: data.shape === 'circle' ? '50%' : data.cornerRadius,
        overflow: 'hidden',
        backgroundColor: 'transparent',
        backfaceVisibility: 'hidden',
    }), [position.x, position.y, webcamSize, data.position.anchor, data.shape, data.cornerRadius]);

    const sourceStyle = useMemo<React.CSSProperties>(() => ({
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        transformOrigin: 'top left',
        willChange: 'transform',
    }), []);

    const webcamStyle = useMemo<React.CSSProperties>(() => ({
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: cropData.mirrorTransform,
        transformOrigin: 'center',
        display: 'block',
        backgroundColor: 'transparent',
        backfaceVisibility: 'hidden',
        outline: 'none',
    }), [cropData.mirrorTransform]);

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

    // Don't render if displaced or no video URL
    if (isDisplaced || !videoUrl) {
        return null;
    }

    // Animated values
    const inverseCameraScale = zoomTransform?.scale ? 1 / zoomTransform.scale : 1;
    const zoomInfluence = data.zoomInfluence ?? 1;
    const effectiveScale = 1 + (inverseCameraScale - 1) * zoomInfluence;
    const finalScale = animationScale * effectiveScale;
    const finalOpacity = animationOpacity * globalOpacity;

    return (
        // STABLE SEQUENCE: from/durationInFrames never change for this clip instance
        // premountFor/postmountFor allow video to preload before/after visibility
        // @ts-expect-error - Remotion types might be missing premountFor/postmountFor
        <Sequence from={startFrame} durationInFrames={durationFrames} layout="none" premountFor={60} postmountFor={30}>
            <div style={overlayContainerStyle}>
                <div
                    style={{
                        ...staticContainerStyle,
                        ...borderStyle,
                        ...shadowStyle,
                        transform: `scale(${finalScale}) translateY(${translateY}px)`,
                        opacity: finalOpacity,
                    }}
                    data-webcam-overlay="true"
                    data-webcam-clip-id={clip.id}
                >
                    <div style={sourceStyle} ref={webcamContainerRef}>
                        <Video
                            src={videoUrl}
                            style={webcamStyle}
                            startFrom={sourceInFrame}
                            volume={effectiveVolume}
                            muted={shouldMuteAudio}
                            preload={preload}
                            playsInline={true}
                            ref={videoRef}
                            onError={(e) => {
                                console.warn('[WebcamClipRenderer] Video error:', e);
                                if (videoRef.current) {
                                    setTimeout(() => videoRef.current?.load(), 1000);
                                }
                            }}
                        />
                    </div>
                </div>
            </div>
        </Sequence>
    );
});

WebcamClipRenderer.displayName = 'WebcamClipRenderer';
