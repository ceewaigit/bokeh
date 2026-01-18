/**
 * WebcamClipRenderer - Single <video> overlay with stable playback across speed changes
 *
 * Architecture:
 * - Single <video> element per webcam recording (no remount at clip boundaries)
 * - Playback-rate changes do NOT trigger seeks (prevents replay/glitch when speeds differ)
 * - Hard seeks only on user jumps / true discontinuities; drift is corrected via mild rate nudging
 *
 * The frame-layout system groups clips by playback rate, so clips with the
 * same rate belong to the same group and share continuous source timing.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { Video, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion';
import type { WebcamLayoutData, Recording } from '@/types/project';
import type { VideoResources } from '@/types';
import { OverlayAnchor } from '@/types/overlays';
import type { PlaybackSettings } from '@/features/rendering/renderer/types';
import type { WebcamFrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout';
import { DEFAULT_WEBCAM_DATA, WEBCAM_POSITION_PRESETS } from '@/features/media/webcam/config';
import { getWebcamLayout } from '@/features/effects/utils/webcam-layout';
import { clampCropData, DEFAULT_CROP_DATA, isFullFrameCrop } from '@/features/rendering/canvas/math/transforms/crop-transform';
import { useVideoPosition } from '../../context/layout/VideoPositionContext';
import { calculateWebcamAnimations } from '@/features/effects/utils/webcam-animations';
import { useOverlayContext } from '@/features/rendering/overlays/overlay-context';
import { useComposition } from '../../context/CompositionContext';
import { useVideoUrl } from '../../hooks/media/useVideoUrl';
import { useVideoContainerCleanup } from '../../hooks/media/useVTDecoderCleanup';
import { useProjectStore } from '@/features/core/stores/project-store';
import { isProxySufficientForTarget } from '@/shared/utils/resolution-utils';
import { msToFrame } from '@/features/rendering/renderer/compositions/utils/time/frame-time';
import { ClipUtils } from '@/features/ui/timeline/time/clip-utils';
import { findActiveWebcamFrameLayoutItem, getWebcamVideoStartFrom } from '@/features/ui/timeline/utils/frame-layout';

interface WebcamClipRendererProps {
    /** All webcam frame layout items for this recording */
    items: WebcamFrameLayoutItem[];
    recording: Recording;
    resources: VideoResources;
    playback: PlaybackSettings;
    fps: number;
    globalOpacity?: number;
}

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
    items,
    recording,
    resources,
    playback,
    fps,
    globalOpacity = 1,
}: WebcamClipRendererProps) => {
    const { videoWidth, videoHeight } = useComposition();
    const isPlaying = useProjectStore(s => s.isPlaying);
    const isScrubbing = useProjectStore(s => s.isScrubbing);
    const frame = useCurrentFrame();
    const { width: compositionWidth, height: compositionHeight } = useVideoConfig();
    const { displacedEffectIds, resolvedAnchors } = useOverlayContext();
    const videoPosition = useVideoPosition();
    const { zoomTransform } = videoPosition;
    const { isRendering } = getRemotionEnvironment();

    const videoRef = useRef<HTMLVideoElement>(null);
    const lastFrameRef = useRef<number>(-1);
    const lastExpectedTimeRef = useRef<number>(-1);
    const lastHardSeekAtMsRef = useRef<number>(0);
    const isCorrectingRef = useRef<boolean>(false);
    const driftTooLargeSinceMsRef = useRef<number | null>(null);
    const seekTokenRef = useRef<number>(0);
    const waitingForCanPlayTokenRef = useRef<number | null>(null);
    const shouldPlayRef = useRef<boolean>(false);

    // Extract clips from items for convenience
    const clips = useMemo(() => items.map(item => item.clip), [items]);

    // Find active item at current frame
    const activeItem = useMemo(() => findActiveWebcamFrameLayoutItem(items, frame), [items, frame]);
    const activeClip = activeItem?.clip ?? null;

    const expectedSourceTime = useMemo(() => {
        if (!activeItem) return null;
        return getWebcamVideoStartFrom(frame, activeItem, fps);
    }, [activeItem, frame, fps]);

    const basePlaybackRate = useMemo(() => {
        const rate = activeClip ? ClipUtils.getPlaybackRate(activeClip) : 1;
        return rate > 0 ? rate : 1;
    }, [activeClip]);

    const isPlaybackMode = isPlaying && !isScrubbing && !isRendering;

    const effectiveVolume = Math.max(0, Math.min(1, playback.previewVolume ?? 1));
    const shouldMuteAudio = (!isRendering && (playback.previewMuted || effectiveVolume <= 0)) || !recording.hasAudio;

    useEffect(() => {
        shouldPlayRef.current = isPlaybackMode && expectedSourceTime != null;
    }, [isPlaybackMode, expectedSourceTime]);

    // Sync timing:
    // - In playback: avoid seeking on clip boundaries and playbackRate changes.
    // - Seek only on user jumps / true discontinuities; otherwise use mild rate nudging.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const nowMs = Date.now();

        const lastFrame = lastFrameRef.current;
        const frameDelta = lastFrame >= 0 ? Math.abs(frame - lastFrame) : 0;
        lastFrameRef.current = frame;

        // No active item: hide overlay via opacity; keep video paused to avoid runaway playback.
        if (expectedSourceTime == null) {
            driftTooLargeSinceMsRef.current = null;
            isCorrectingRef.current = false;
            video.pause();
            return;
        }

        const lastExpected = lastExpectedTimeRef.current;
        const expectedDelta = lastExpected >= 0 ? Math.abs(expectedSourceTime - lastExpected) : 0;
        lastExpectedTimeRef.current = expectedSourceTime;

        // Detect replay: large backward jump in expected time (user clicked play from beginning)
        const isReplay = lastExpected >= 0 && (lastExpected - expectedSourceTime) > 0.5;

        // Always keep base playback rate updated (this is cheap and doesn't force a seek).
        // During playback we may temporarily nudge around this rate for drift correction.
        const setPlaybackRate = (rate: number) => {
            const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
            if (Math.abs(video.playbackRate - safeRate) > 0.001) {
                video.playbackRate = safeRate;
            }
        };

        const playIfAllowed = (token: number) => {
            if (token !== seekTokenRef.current) return;
            if (!shouldPlayRef.current) return;
            if (video.seeking) return;
            if (!video.paused) return;

            const tryPlay = () => {
                if (token !== seekTokenRef.current) return;
                if (!shouldPlayRef.current) return;
                if (video.seeking) return;
                if (!video.paused) return;
                video.play().catch(err => {
                    if (err?.name === 'NotAllowedError') {
                        console.debug('[WebcamClipRenderer] Autoplay blocked:', err.message);
                    }
                });
            };

            // Avoid starting playback until we have future data after a seek.
            // This prevents Chromium/Electron from stuttering heavily right after a discontinuity.
            if (video.readyState >= 3) {
                tryPlay();
                return;
            }

            if (waitingForCanPlayTokenRef.current === token) return;
            waitingForCanPlayTokenRef.current = token;

            const onCanPlay = () => {
                if (waitingForCanPlayTokenRef.current === token) {
                    waitingForCanPlayTokenRef.current = null;
                }
                tryPlay();
            };

            video.addEventListener('canplay', onCanPlay, { once: true });
        };

        const hardSeek = (targetSeconds: number) => {
            if (video.seeking) return;
            const safeTarget = Number.isFinite(targetSeconds) ? Math.max(0, targetSeconds) : 0;

            // Cancel any pending "play when ready" from older seeks.
            const token = ++seekTokenRef.current;
            waitingForCanPlayTokenRef.current = null;
            driftTooLargeSinceMsRef.current = null;

            // Force a clean discontinuity: pause, seek, then resume after seek completes.
            // Playing while seeking is a reliable way to trigger severe stutter in Chromium.
            video.pause();
            setPlaybackRate(basePlaybackRate);

            video.addEventListener('seeked', () => playIfAllowed(token), { once: true });

            try {
                // Prefer accuracy over "fast" keyframe approximation for sync correctness.
                video.currentTime = safeTarget;
            } catch {
                // Best-effort; some browsers throw if currentTime isn't seekable yet.
            }

            lastHardSeekAtMsRef.current = nowMs;
        };

        const driftSeconds = expectedSourceTime - video.currentTime;
        const absDrift = Math.abs(driftSeconds);

        // In paused/scrubbing/rendering: frame-accurate sync is preferred.
        if (!isPlaybackMode) {
            driftTooLargeSinceMsRef.current = null;
            setPlaybackRate(basePlaybackRate);
            if (!video.seeking && absDrift > 0.02) {
                hardSeek(expectedSourceTime);
            }
            video.pause();
            return;
        }

        // Playback mode: avoid seek storms.
        // Treat big frame/expected deltas or replay as an explicit jump (timeline click/skip).
        const isLikelyUserJump = frameDelta > 2 || expectedDelta > 0.5 || isReplay;

        // If we just hard-seeked, give the browser a moment to settle/buffer.
        const inSeekGracePeriod = nowMs - lastHardSeekAtMsRef.current < 800;

        // If user jumped (including replay) or we hit "ended", do a single clean resync.
        if (!video.seeking && (isLikelyUserJump || video.ended)) {
            isCorrectingRef.current = false; // Reset hysteresis on jump
            setPlaybackRate(basePlaybackRate);
            hardSeek(expectedSourceTime);
            return;
        }

        // If drift stays very large for a sustained period, do one resync.
        // This avoids turning transient buffering into a seek storm (which looks like ~1fps).
        if (!video.seeking && !inSeekGracePeriod && absDrift > 1.25) {
            if (driftTooLargeSinceMsRef.current == null) {
                driftTooLargeSinceMsRef.current = nowMs;
            } else if (nowMs - driftTooLargeSinceMsRef.current > 1000) {
                isCorrectingRef.current = false;
                setPlaybackRate(basePlaybackRate);
                hardSeek(expectedSourceTime);
                return;
            }
        } else {
            driftTooLargeSinceMsRef.current = null;
        }

        // Soft drift correction: nudge playbackRate instead of seeking.
        // Keeps smooth playback across clip boundaries and speed changes.
        // Use hysteresis to prevent oscillation when drift hovers around threshold
        const DRIFT_ENABLE_THRESHOLD = 0.15;  // Start correcting at 150ms
        const DRIFT_DISABLE_THRESHOLD = 0.08; // Stop correcting at 80ms

        if (absDrift > DRIFT_ENABLE_THRESHOLD) {
            isCorrectingRef.current = true;
        } else if (absDrift < DRIFT_DISABLE_THRESHOLD) {
            isCorrectingRef.current = false;
        }

        if (!video.seeking && !inSeekGracePeriod && isCorrectingRef.current) {
            const maxNudge = 0.10; // ±10% (gentler than before)
            const k = 0.20; // proportional gain - lower for smoother corrections
            const factor = Math.max(1 - maxNudge, Math.min(1 + maxNudge, 1 + driftSeconds * k));
            setPlaybackRate(basePlaybackRate * factor);
        } else {
            setPlaybackRate(basePlaybackRate);
        }

        // Ensure playback is actually running (but never start playback while seeking).
        playIfAllowed(seekTokenRef.current);
    }, [expectedSourceTime, frame, isPlaybackMode, basePlaybackRate]);

    // Volume control
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.volume = effectiveVolume;
        video.muted = shouldMuteAudio;
    }, [effectiveVolume, shouldMuteAudio]);

    const overlayScale = useMemo(() => {
        const scaleFactor = videoPosition.scaleFactor;
        if (typeof scaleFactor === 'number' && Number.isFinite(scaleFactor) && scaleFactor > 0) {
            return scaleFactor;
        }
        return 1;
    }, [videoPosition.scaleFactor]);

    // Layout data from active clip
    const data: WebcamLayoutData = useMemo(() => {
        const layout = activeClip?.layout ?? clips[0]?.layout ?? DEFAULT_WEBCAM_DATA;
        const clipId = activeClip?.id;
        if (!clipId) return layout;

        const resolvedAnchor = resolvedAnchors.get(clipId);
        if (resolvedAnchor && resolvedAnchor !== layout.position.anchor) {
            const preset = WEBCAM_POSITION_PRESETS[resolvedAnchor];
            if (preset) {
                return {
                    ...layout,
                    position: { ...layout.position, x: preset.x, y: preset.y, anchor: preset.anchor }
                };
            }
        }
        return layout;
    }, [activeClip, clips, resolvedAnchors]);

    // Webcam target size for proxy
    const webcamTargetSize = useMemo(() => {
        const fallback = getWebcamLayout(DEFAULT_WEBCAM_DATA, videoWidth, videoHeight).size;
        const maxSize = clips.length
            ? Math.max(...clips.map(c => getWebcamLayout(c.layout ?? DEFAULT_WEBCAM_DATA, videoWidth, videoHeight).size))
            : fallback;
        return { width: Math.round(maxSize * 1.2), height: Math.round(maxSize * 1.2) };
    }, [clips, videoWidth, videoHeight]);

    const forceProxy = useMemo(() => {
        return isProxySufficientForTarget(webcamTargetSize.width, webcamTargetSize.height, 1);
    }, [webcamTargetSize]);

    const videoUrl = useVideoUrl({
        recording,
        resources,
        clipId: recording.id,
        targetWidth: webcamTargetSize.width,
        targetHeight: webcamTargetSize.height,
        isHighQualityPlaybackEnabled: playback.isHighQualityPlaybackEnabled,
        forceProxy,
        isPlaying,
        isScrubbing,
    });

    // VTDecoder cleanup for macOS - prevents memory accumulation after repeated play/pause
    const containerRef = useVideoContainerCleanup(videoUrl);

    // Animation
    const activeStartFrame = activeItem?.startFrame ?? 0;
    const activeEndFrame = activeItem?.endFrame ?? 0;

    const { scale: animationScale, opacity: animationOpacity, translateY } = useMemo(() => {
        if (!activeItem) return { scale: 1, opacity: 0, translateY: 0 };
        return calculateWebcamAnimations(data, frame, fps, activeStartFrame, activeEndFrame);
    }, [data, frame, fps, activeItem, activeStartFrame, activeEndFrame]);

    // Layout
    const layout = useMemo(() => {
        const scaledPadding = (data.padding ?? 0) * overlayScale;
        return getWebcamLayout({ ...data, padding: scaledPadding }, compositionWidth, compositionHeight);
    }, [data, compositionWidth, compositionHeight, overlayScale]);

    const webcamSize = Math.round(layout.size);
    const position = { x: Math.round(layout.x), y: Math.round(layout.y) };

    // Source dimensions
    const sourceWidth = recording.width || 1280;
    const sourceHeight = recording.height || 720;

    // Crop
    const cropStyle = useMemo(() => {
        let sourceCrop = clampCropData(data.sourceCrop ?? DEFAULT_CROP_DATA);
        if (isFullFrameCrop(sourceCrop) && sourceWidth > 0 && sourceHeight > 0) {
            const sourceAspect = sourceWidth / sourceHeight;
            if (Math.abs(sourceAspect - 1) > 0.01) {
                let cropW = 1, cropH = 1;
                if (sourceAspect > 1) cropW = 1 / sourceAspect;
                else cropH = sourceAspect;
                sourceCrop = { width: cropW, height: cropH, x: (1 - cropW) / 2, y: (1 - cropH) / 2 };
            }
        }
        const scaleX = 1 / sourceCrop.width;
        const scaleY = 1 / sourceCrop.height;
        const translateX = -sourceCrop.x * scaleX * 100;
        const translateY = -sourceCrop.y * scaleY * 100;
        return { scaleX, scaleY, translateX, translateY, mirror: data.mirror };
    }, [data.sourceCrop, data.mirror, sourceWidth, sourceHeight]);

    // Styles
    const scaledCornerRadius = (data.cornerRadius ?? 0) * overlayScale;
    const scaledBorderWidth = (data.borderWidth ?? 0) * overlayScale;
    const scaledShadowBlur = (data.shadowBlur ?? 0) * overlayScale;
    const scaledShadowOffsetX = (data.shadowOffsetX ?? 0) * overlayScale;
    const scaledShadowOffsetY = (data.shadowOffsetY ?? 0) * overlayScale;

    const webcamTransform = useMemo(() => {
        const { scaleX, scaleY, translateX, translateY, mirror } = cropStyle;
        let t = `translate(${translateX}%, ${translateY}%) scale(${scaleX}, ${scaleY})`;
        if (mirror) t += ' scaleX(-1)';
        return t;
    }, [cropStyle]);

    if (!videoUrl || items.length === 0) return null;

    // Final opacity
    const isDisplaced = activeClip?.id ? displacedEffectIds.has(activeClip.id) : false;
    const displacedOpacity = isDisplaced ? 0 : 1;
    const activeOpacity = activeItem ? 1 : 0;

    const inverseCameraScale = zoomTransform?.scale ? 1 / zoomTransform.scale : 1;
    const zoomInfluence = data.zoomInfluence ?? 1;
    const effectiveScale = 1 + (inverseCameraScale - 1) * zoomInfluence;
    const finalScale = animationScale * effectiveScale;
    const finalOpacity = animationOpacity * globalOpacity * displacedOpacity * activeOpacity;
    const finalTranslateY = translateY * overlayScale;

    const videoStyle: React.CSSProperties = {
        position: 'absolute',
        width: '100%',
        height: '100%',
        objectFit: 'fill',
        transform: webcamTransform,
        transformOrigin: cropStyle.mirror ? 'center' : 'top left',
        backgroundColor: '#000',
    };

    // Export correctness: use Remotion's <Video> so the renderer can deterministically
    // seek and wait for frames (plain <video> seeks won't be awaited during export).
    const exportSourceFrame = expectedSourceTime != null
        ? msToFrame(expectedSourceTime * 1000, fps)
        : 0;
    const exportStartFromFrames = expectedSourceTime != null
        ? Math.max(0, exportSourceFrame - Math.round(frame * basePlaybackRate))
        : 0;

    return (
        <div
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: compositionWidth,
                height: compositionHeight,
                pointerEvents: 'none',
                zIndex: 20,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    left: position.x,
                    top: position.y,
                    width: webcamSize,
                    height: webcamSize,
                    transformOrigin: getTransformOrigin(data.position.anchor),
                    borderRadius: data.shape === 'circle' ? '50%' : scaledCornerRadius,
                    overflow: 'hidden',
                    backgroundColor: 'transparent',
                    transform: `scale(${finalScale}) translateY(${finalTranslateY}px)`,
                    opacity: finalOpacity,
                    ...(data.borderEnabled ? { border: `${scaledBorderWidth}px solid ${data.borderColor}` } : {}),
                    ...(data.shadowEnabled ? { boxShadow: `${scaledShadowOffsetX}px ${scaledShadowOffsetY}px ${scaledShadowBlur}px ${data.shadowColor}` } : {}),
                }}
                data-webcam-overlay="true"
            >
                {isRendering ? (
                    <Video
                        src={videoUrl}
                        style={{
                            ...videoStyle,
                            pointerEvents: 'none',
                        }}
                        crossOrigin="anonymous"
                        preload="auto"
                        playsInline
                        pauseWhenBuffering={false}
                        playbackRate={basePlaybackRate}
                        startFrom={exportStartFromFrames}
                        muted={shouldMuteAudio || expectedSourceTime == null}
                        volume={() => (shouldMuteAudio || expectedSourceTime == null ? 0 : effectiveVolume)}
                    />
                ) : (
                    <div ref={containerRef} style={{ display: 'contents' }}>
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            style={{
                                ...videoStyle,
                                pointerEvents: 'none',
                            }}
                            crossOrigin="anonymous"
                            preload="auto"
                            playsInline
                            muted={shouldMuteAudio || expectedSourceTime == null}
                        />
                    </div>
                )}
            </div>
        </div>
    );
});

WebcamClipRenderer.displayName = 'WebcamClipRenderer';
