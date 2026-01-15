/**
 * MotionBlurCanvas.tsx
 *
 * Directional motion blur using raw WebGL.
 * - Uses DOM discovery + requestVideoFrameCallback for both preview and export
 *
 * Key features:
 * - Raw WebGL 2.0 context via MotionBlurController singleton
 * - DOM-based video element discovery (reliable across all modes)
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { clamp01 } from '@/features/rendering/canvas/math';
import { MotionBlurController } from '../logic/MotionBlurController';

export interface MotionBlurCanvasProps {
    /** Whether motion blur feature is enabled */
    enabled?: boolean;
    /** Velocity vector in pixels per frame */
    velocity: { x: number; y: number };
    /** Intensity multiplier (0-1) */
    intensity?: number;
    /** Blur mix factor (0 = sharp, 1 = full blur) */
    mix?: number;
    /** Samples count (optional override) */
    samples?: number;
    /** Output color space for the motion blur layer (defaults to 'srgb') */
    colorSpace?: PredefinedColorSpace;
    /** Gamma correction factor (1 = no change) */
    gamma?: number;
    /** Manual black level adjustment (-0.2 to 0.2, app will clamp) */
    blackLevel?: number;
    /** Saturation adjustment (0-2) */
    saturation?: number;
    /** Force render even when blur is inactive */
    forceRender?: boolean;
    /** Whether to premultiply alpha on upload (helps avoid dark fringes on transparent sources) */
    unpackPremultiplyAlpha?: boolean;
    /** Video frame from onVideoFrame callback (export mode) */
    videoFrame?: CanvasImageSource | null;
    /** Container ref for DOM fallback (preview mode) */
    containerRef?: React.RefObject<HTMLDivElement | null>;
    /** Dimensions of the rendered video */
    drawWidth: number;
    drawHeight: number;
    /** Position offset */
    offsetX: number;
    offsetY: number;
    /** Additional scale applied to the video container (e.g. zoom), for resolution matching */
    renderScale?: number;
    /** Velocity threshold in pixels/frame - blur only activates above this speed */
    velocityThreshold?: number;
    /** Soft knee ramp range (0-1) - controls transition smoothness */
    rampRange?: number;
    /** Maximum blur radius clamp */
    clampRadius?: number;
    /** Smoothing window in frames - higher = longer blur fade */
    smoothWindow?: number;
    /** Notify when a frame is rendered to the canvas */
    onRender?: () => void;
    /** Notify when the canvas is visually active (non-zero blend) */
    onVisibilityChange?: (visible: boolean) => void;
    /** Refocus blur intensity (0-1) for omnidirectional blur during zoom transitions */
    refocusBlurIntensity?: number;
}

export const MotionBlurCanvas: React.FC<MotionBlurCanvasProps> = ({
    enabled: enabledProp = true,
    velocity,
    intensity = 1.0,
    mix = 1.0,
    samples,
    colorSpace,
    gamma = 1.0,
    blackLevel = 0,
    saturation = 1.0,
    forceRender = false,
    onRender,
    onVisibilityChange,
    unpackPremultiplyAlpha = false,
    videoFrame,
    containerRef,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
    renderScale = 1,
    velocityThreshold: _velocityThresholdProp = 0,
    rampRange: _rampRangeProp = 0.5,
    clampRadius: _clampRadiusProp = 30,
    smoothWindow: _smoothWindowProp = 6,
    refocusBlurIntensity = 0,
}) => {
    // PERFORMANCE: Track allocated canvas dimensions to avoid resize thrashing during zoom-follow-mouse
    const allocatedSizeRef = useRef({ width: 0, height: 0 });

    const enabled = enabledProp && (intensity > 0 || refocusBlurIntensity > 0 || forceRender);
    // Force sRGB to match video color space - P3 causes visible color mismatch
    const desiredColorSpace: PredefinedColorSpace = colorSpace ?? 'srgb';

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const bitmapCtxRef = useRef<ImageBitmapRenderingContext | null>(null);
    const videoCanvasRef = useRef<OffscreenCanvas | HTMLCanvasElement | null>(null);
    const videoCtxRef = useRef<CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null>(null);
    const hasRenderedRef = useRef(false); // Track if we've ever rendered successfully

    // Frame sync: Use refs instead of state to avoid React rerenders on every video frame
    // The render function is called directly from requestVideoFrameCallback
    const frameCallbackIdRef = useRef<number | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    // Store props in refs so render callback can access latest values without causing rerenders
    const propsRef = useRef({
        enabled,
        velocity,
        intensity,
        mix,
        samples,
        desiredColorSpace,
        gamma,
        blackLevel,
        saturation,
        forceRender,
        onRender,
        unpackPremultiplyAlpha,
        drawWidth,
        drawHeight,
        renderScale,
        onVisibilityChange,
        refocusBlurIntensity,
        videoFrame,
    });
    // Keep props ref up to date
    propsRef.current = {
        enabled,
        velocity,
        intensity,
        mix,
        samples,
        desiredColorSpace,
        gamma,
        blackLevel,
        saturation,
        forceRender,
        onRender,
        unpackPremultiplyAlpha,
        drawWidth,
        drawHeight,
        renderScale,
        onVisibilityChange,
        refocusBlurIntensity,
        videoFrame,
    };

    // BATTERY OPTIMIZATION: Render function called directly from requestVideoFrameCallback
    // This avoids React rerenders (30-60/sec) by using refs instead of state
    const renderFrame = useCallback((mediaSource: CanvasImageSource | null) => {
        const canvasEl = canvasRef.current;
        if (!canvasEl) return;

        const props = propsRef.current;
        const {
            enabled: enabledProp,
            velocity,
            intensity,
            samples,
            desiredColorSpace,
            gamma,
            blackLevel,
            saturation,
            onRender,
            unpackPremultiplyAlpha,
            drawWidth,
            drawHeight,
            renderScale,
            onVisibilityChange,
            refocusBlurIntensity,
        } = props;

        // Recalculate enabled based on current props
        const isEnabled = enabledProp && (intensity > 0 || refocusBlurIntensity > 0 || props.forceRender);

        // When disabled, show video element - don't trust stale canvas content
        if (!isEnabled) {
            canvasEl.style.visibility = 'hidden';
            onVisibilityChange?.(false);
            return;
        }

        // If the canvas element was remounted, ensure we refresh the context.
        if (bitmapCtxRef.current && (bitmapCtxRef.current as any).canvas !== canvasEl) {
            bitmapCtxRef.current = null;
        }

        if (!mediaSource) {
            canvasEl.style.visibility = 'hidden';
            onVisibilityChange?.(false);
            return;
        }

        // Use bitmaprenderer context - it preserves colors better than 2D context drawImage
        let bitmapCtx = bitmapCtxRef.current;
        if (!bitmapCtx) {
            bitmapCtx = canvasEl.getContext('bitmaprenderer', { alpha: true });
            bitmapCtxRef.current = bitmapCtx;
        }
        if (!bitmapCtx) return;
        const actualColorSpace = desiredColorSpace;

        const pixelRatio = 1;
        const clampedRenderScale = Number.isFinite(renderScale)
            ? Math.max(0.25, Math.min(4, renderScale))
            : 1;
        const outputScale = pixelRatio * clampedRenderScale;

        const targetOutputWidth = Math.max(1, Math.round(drawWidth * outputScale));
        const targetOutputHeight = Math.max(1, Math.round(drawHeight * outputScale));

        // MOTION BLUR - PHYSICALLY CORRECT
        const SHUTTER_ANGLE = 0.45;
        const vx = Number.isFinite(velocity.x) ? velocity.x : 0;
        const vy = Number.isFinite(velocity.y) ? velocity.y : 0;
        const rawSpeed = Math.hypot(vx, vy);

        // PERFORMANCE OPTIMIZATION: Skip WebGL entirely when there's no blur to apply
        // This saves significant CPU/GPU cycles on static scenes or low-movement frames
        const hasRefocus = (refocusBlurIntensity ?? 0) > 0.01;
        const VELOCITY_THRESHOLD = 0.5; // pixels per frame - below this, blur is imperceptible
        if (rawSpeed < VELOCITY_THRESHOLD && !hasRefocus && !props.forceRender) {
            // No blur needed - hide canvas and show video directly
            canvasEl.style.visibility = 'hidden';
            onVisibilityChange?.(false);
            return;
        }

        const KNEE_PX = 20;
        const kneeSq = KNEE_PX * KNEE_PX;
        const speedSq = rawSpeed * rawSpeed;
        const responseMultiplier = speedSq / (speedSq + kneeSq);

        const scaledVx = vx * responseMultiplier;
        const scaledVy = vy * responseMultiplier;

        const validIntensity = Number.isFinite(intensity) ? intensity : 1.0;
        const blurVx = scaledVx * SHUTTER_ANGLE * validIntensity;
        const blurVy = scaledVy * SHUTTER_ANGLE * validIntensity;

        const uvVelocityX = blurVx / drawWidth;
        const uvVelocityY = blurVy / drawHeight;
        const blurMagnitude = Math.hypot(uvVelocityX, uvVelocityY);

        const blurLengthPx = Math.hypot(blurVx, blurVy);
        const calculatedSamples = Math.max(16, Math.min(64, Math.ceil(blurLengthPx * 1.5)));
        const finalSamples = samples ?? calculatedSamples;

        const rawMix = blurMagnitude * 60;
        const mixRamp = clamp01(rawMix * rawMix / (rawMix * rawMix + 1));

        const glPixelRatio = outputScale;

        // Route video through a 2D canvas for hysteresis resize optimization
        const quantizeSize = (size: number) => Math.ceil(size / 64) * 64;
        const shouldResize = (current: number, target: number) => {
            if (current === 0) return true;
            const diff = Math.abs(current - target);
            const percentDiff = diff / Math.max(current, 1);
            return diff > 64 || percentDiff > 0.05;
        };

        let webglSource: TexImageSource = mediaSource as TexImageSource;
        if (mediaSource && 'videoWidth' in mediaSource) {
            const targetWidth = quantizeSize(targetOutputWidth);
            const targetHeight = quantizeSize(targetOutputHeight);

            if (!videoCanvasRef.current) {
                if (typeof OffscreenCanvas !== 'undefined') {
                    videoCanvasRef.current = new OffscreenCanvas(targetWidth, targetHeight);
                } else if (typeof document !== 'undefined') {
                    const canvas = document.createElement('canvas');
                    canvas.width = targetWidth;
                    canvas.height = targetHeight;
                    videoCanvasRef.current = canvas;
                }
                allocatedSizeRef.current = { width: targetWidth, height: targetHeight };
            }
            if (videoCanvasRef.current) {
                const allocated = allocatedSizeRef.current;
                if (
                    shouldResize(allocated.width, targetWidth) ||
                    shouldResize(allocated.height, targetHeight)
                ) {
                    (videoCanvasRef.current as OffscreenCanvas).width = targetWidth;
                    (videoCanvasRef.current as OffscreenCanvas).height = targetHeight;
                    allocatedSizeRef.current = { width: targetWidth, height: targetHeight };
                    videoCtxRef.current = null;
                }
                if (!videoCtxRef.current) {
                    videoCtxRef.current = (videoCanvasRef.current as any).getContext('2d', {
                        alpha: true,
                        colorSpace: 'srgb',
                    });
                }
                if (videoCtxRef.current) {
                    try {
                        (videoCtxRef.current as any).imageSmoothingEnabled = true;
                        (videoCtxRef.current as any).imageSmoothingQuality = 'high';
                    } catch {
                        // Ignore if unsupported.
                    }
                    const currentWidth = allocatedSizeRef.current.width;
                    const currentHeight = allocatedSizeRef.current.height;
                    videoCtxRef.current.drawImage(mediaSource, 0, 0, currentWidth, currentHeight);
                    webglSource = videoCanvasRef.current as TexImageSource;
                }
            }
        }

        const resultCanvas = MotionBlurController.instance.render(
            webglSource,
            drawWidth,
            drawHeight,
            {
                uvVelocityX: Number.isFinite(uvVelocityX) ? uvVelocityX : 0,
                uvVelocityY: Number.isFinite(uvVelocityY) ? uvVelocityY : 0,
                intensity: 1.0,
                samples: finalSamples,
                mix: mixRamp,
                gamma: Number.isFinite(gamma) ? gamma : 1.0,
                blackLevel: Math.max(-0.02, Math.min(0.99, blackLevel)),
                saturation: Number.isFinite(saturation) ? saturation : 1.0,
                colorSpace: actualColorSpace,
                unpackPremultiplyAlpha,
                linearize: actualColorSpace === 'srgb',
                pixelRatio: glPixelRatio,
                refocusBlur: refocusBlurIntensity,
            }
        );

        if (resultCanvas && 'transferToImageBitmap' in resultCanvas) {
            const targetWidth = targetOutputWidth;
            const targetHeight = targetOutputHeight;
            if (canvasEl.width !== targetWidth || canvasEl.height !== targetHeight) {
                canvasEl.width = targetWidth;
                canvasEl.height = targetHeight;
            }
            const bitmap = (resultCanvas as OffscreenCanvas).transferToImageBitmap();
            bitmapCtx.transferFromImageBitmap(bitmap);
            const closable = (bitmap as { close?: () => void }).close;
            if (typeof closable === 'function') {
                closable.call(bitmap);
            }
            canvasEl.style.visibility = 'visible';
            canvasEl.style.opacity = '1';
            hasRenderedRef.current = true;
            onVisibilityChange?.(true);
            if (onRender) onRender();
        } else {
            canvasEl.style.visibility = 'hidden';
            onVisibilityChange?.(false);
        }
    }, []); // Empty deps - reads from propsRef

    // Store renderFrame in a ref so requestVideoFrameCallback can access it
    const renderFrameRef = useRef(renderFrame);
    renderFrameRef.current = renderFrame;

    // Register requestVideoFrameCallback to sync canvas updates with video frames
    // BATTERY OPTIMIZATION: Calls renderFrame directly instead of triggering React rerenders
    useEffect(() => {
        // Don't return early if containerRef.current is null - let polling find it later
        let cancelled = false;
        let pollIntervalId: ReturnType<typeof setInterval> | null = null;

        const setupCallback = (video: HTMLVideoElement) => {
            if (cancelled) return;
            videoRef.current = video;

            const requestFrame = () => {
                if (cancelled) return;
                if ('requestVideoFrameCallback' in video) {
                    frameCallbackIdRef.current = (video as any).requestVideoFrameCallback(() => {
                        if (!cancelled) {
                            // BATTERY OPTIMIZATION: Call render directly instead of setState
                            // Check video readiness and call render
                            if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.seeking) {
                                renderFrameRef.current(video);
                            }
                            requestFrame(); // Request next frame callback
                        }
                    });
                }
            };

            requestFrame();
        };

        const findVideo = () => {
            // Use optional chaining - containerRef.current may be null initially
            const video = containerRef?.current?.querySelector('video') as HTMLVideoElement | null;
            if (video && video !== videoRef.current) {
                setupCallback(video);
                if (pollIntervalId) {
                    clearInterval(pollIntervalId);
                    pollIntervalId = null;
                }
            }
        };

        // Try immediately
        findVideo();

        // If not found, poll until we find it (handles initial mount when containerRef.current is null)
        if (!videoRef.current) {
            pollIntervalId = setInterval(findVideo, 100);
        }

        return () => {
            cancelled = true;
            if (pollIntervalId) {
                clearInterval(pollIntervalId);
            }
            if (frameCallbackIdRef.current !== null && videoRef.current && 'cancelVideoFrameCallback' in videoRef.current) {
                (videoRef.current as any).cancelVideoFrameCallback(frameCallbackIdRef.current);
            }
            videoRef.current = null;
        };
    }, [containerRef]);

    // Export mode: Render when videoFrame prop changes (export provides frames directly)
    // Preview mode rendering is handled by requestVideoFrameCallback above (no React rerenders)
    React.useLayoutEffect(() => {
        // Only run for export mode (when videoFrame is provided)
        // Preview mode uses requestVideoFrameCallback to avoid React rerenders
        if (videoFrame) {
            renderFrame(videoFrame);
        }
    }, [videoFrame, renderFrame]);

    // Handle enabled state changes and initial render
    React.useLayoutEffect(() => {
        const canvasEl = canvasRef.current;
        if (!canvasEl) return;

        if (!enabled) {
            canvasEl.style.visibility = 'hidden';
            onVisibilityChange?.(false);
        }
    }, [enabled, onVisibilityChange]);

    // Cleanup GPU resources only on unmount
    React.useEffect(() => {
        const currentCanvas = canvasRef.current;
        const currentVideoCanvas = videoCanvasRef.current;
        return () => {
            if (currentCanvas) {
                currentCanvas.width = 0;
                currentCanvas.height = 0;
            }
            if (currentVideoCanvas) {
                currentVideoCanvas.width = 0;
                currentVideoCanvas.height = 0;
                videoCanvasRef.current = null;
                videoCtxRef.current = null;
            }
            bitmapCtxRef.current = null;
            hasRenderedRef.current = false; // Reset on unmount
        };
    }, []);

    // Don't unmount when disabled - keep canvas in DOM to preserve rendered content
    // Just hide it visually. This prevents flash when enabled toggles rapidly.
    return (
        <canvas
            key={desiredColorSpace}
            ref={canvasRef}
            width={drawWidth}
            height={drawHeight}
            style={{
                position: 'absolute',
                left: offsetX,
                top: offsetY,
                width: drawWidth,
                height: drawHeight,
                pointerEvents: 'none',
                zIndex: 50,  // Below AnnotationLayer (z-index 100) - annotations should always be visible
                // Canvas starts HIDDEN - only becomes visible after successful render
                // This prevents showing black/stale content when render fails or hasn't completed
                visibility: 'hidden', // Will be set to 'visible' by effect after successful render
                clipPath: undefined,
            }}
        />
    );
};
