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
import { MotionBlurController } from '../logic/MotionBlurController';

export interface MotionBlurCanvasProps {
    /** Whether motion blur feature is enabled */
    enabled?: boolean;
    /** Velocity vector normalized (0-1) - converted to pixels internally using drawWidth/Height */
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
    velocityThreshold = 0,
    rampRange = 0.5,
    clampRadius = 30,
    smoothWindow = 6,
    refocusBlurIntensity = 0,
}) => {
    // PERFORMANCE: Track allocated canvas dimensions to avoid resize thrashing during zoom-follow-mouse
    const _allocatedSizeRef = useRef({ width: 0, height: 0 });

    const enabled = enabledProp && (intensity > 0 || refocusBlurIntensity > 0 || forceRender);
    // Use sRGB to match how video is typically encoded - avoids P3↔sRGB conversion darkening
    const desiredColorSpace: PredefinedColorSpace = colorSpace ?? 'srgb';

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
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
        velocityThreshold,
        rampRange,
        clampRadius,
        smoothWindow,
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
        velocityThreshold,
        rampRange,
        clampRadius,
        smoothWindow,
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
            clampRadius,
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
        if (ctx2dRef.current && (ctx2dRef.current as any).canvas !== canvasEl) {
            ctx2dRef.current = null;
        }

        if (!mediaSource) {
            canvasEl.style.visibility = 'hidden';
            onVisibilityChange?.(false);
            return;
        }

        // Use 2D context with display-p3 colorSpace to match video element display
        // bitmaprenderer has no colorSpace control, causing color mismatch on P3 displays
        let ctx2d = ctx2dRef.current;
        if (!ctx2d) {
            ctx2d = canvasEl.getContext('2d', {
                alpha: true,
                colorSpace: desiredColorSpace,
            });
            ctx2dRef.current = ctx2d;
        }
        if (!ctx2d) return;
        const actualColorSpace = desiredColorSpace;

        const pixelRatio = 1;
        const clampedRenderScale = Number.isFinite(renderScale)
            ? Math.max(0.25, Math.min(4, renderScale))
            : 1;
        const outputScale = pixelRatio * clampedRenderScale;

        const targetOutputWidth = Math.max(1, Math.round(drawWidth * outputScale));
        const targetOutputHeight = Math.max(1, Math.round(drawHeight * outputScale));

        // MOTION BLUR - FILM-ACCURATE SHUTTER ANGLE
        // Velocity comes in as NORMALIZED (0-1) for resolution independence.
        // Convert to pixels using actual render dimensions (drawWidth/Height).
        // This ensures preview at 1080p matches export at 4K exactly.
        //
        // Shutter angle: intensity (0-1) maps to 0-180° shutter angle
        // At 180° (100%), shutter is open for half the frame → blur = velocity * 0.5
        // This matches how real film cameras work.
        const shutterAngleDegrees = (Number.isFinite(intensity) ? intensity : 0.5) * 180;
        const shutterAngleFraction = shutterAngleDegrees / 360;  // 0-0.5 range

        const vx = (Number.isFinite(velocity.x) ? velocity.x : 0) * drawWidth;
        const vy = (Number.isFinite(velocity.y) ? velocity.y : 0) * drawHeight;
        const rawSpeed = Math.hypot(vx, vy);

        // Always render through WebGL for consistent color output
        // This ensures no visible color shift when transitioning between motion/no-motion states
        const _hasRefocus = (refocusBlurIntensity ?? 0) > 0.01;

        // VELOCITY RAMP - Smooth blur fade-in to avoid jarring appearance
        // Blur fades in from threshold to full strength over a range
        const BLUR_RAMP_START = 3.0;   // Blur starts fading in
        const BLUR_RAMP_END = 10.0;    // Blur reaches full strength
        const velocityFactor = rawSpeed <= BLUR_RAMP_START
            ? 0
            : Math.min(1, (rawSpeed - BLUR_RAMP_START) / (BLUR_RAMP_END - BLUR_RAMP_START));

        // SIMPLE LINEAR: Apply shutter angle directly to velocity (no knee curve)
        // blur_length = velocity × shutter_fraction - matches real camera physics
        // No non-linear curves that cause unpredictable/jerky behavior
        const blurVx = vx * shutterAngleFraction;
        const blurVy = vy * shutterAngleFraction;

        // Clamp blur length to max radius from UI settings
        const rawBlurLengthPx = Math.hypot(blurVx, blurVy);
        const maxBlurPx = clampRadius > 0 ? clampRadius : 60;  // Default 60px max
        const blurScale = rawBlurLengthPx > maxBlurPx ? maxBlurPx / rawBlurLengthPx : 1;
        // Apply velocity ramp to blur vectors for smooth fade-in
        const clampedBlurVx = blurVx * blurScale * velocityFactor;
        const clampedBlurVy = blurVy * blurScale * velocityFactor;

        const uvVelocityX = clampedBlurVx / drawWidth;
        const uvVelocityY = clampedBlurVy / drawHeight;

        const blurLengthPx = Math.hypot(clampedBlurVx, clampedBlurVy);
        const calculatedSamples = Math.max(16, Math.min(64, Math.ceil(blurLengthPx * 1.5)));
        const finalSamples = samples ?? calculatedSamples;

        // FILM-ACCURATE: Always use full blur blend (mix = 1.0)
        // Real film cameras don't "blend" - they accumulate light continuously.
        // At low speeds, blur samples are close together, naturally producing a sharp result.
        // At high speeds, samples spread out, naturally producing motion blur.
        // No artificial mixing/fading needed - the physics handles it.
        const mixRamp = 1.0;

        const glPixelRatio = outputScale;

        // BYPASS intermediate 2D canvas - pass video directly to WebGL
        // The 2D canvas with colorSpace: 'srgb' was causing color darkening
        // WebGL can accept HTMLVideoElement directly via texImage2D
        const webglSource: TexImageSource = mediaSource as TexImageSource;

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
                // Disable linearization to preserve raw sRGB values through the pipeline
                // This ensures 1:1 color matching with the video element
                linearize: false,
                pixelRatio: glPixelRatio,
                refocusBlur: refocusBlurIntensity,
            }
        );

        if (resultCanvas) {
            const targetWidth = targetOutputWidth;
            const targetHeight = targetOutputHeight;
            if (canvasEl.width !== targetWidth || canvasEl.height !== targetHeight) {
                canvasEl.width = targetWidth;
                canvasEl.height = targetHeight;
                // Reset context after resize
                ctx2dRef.current = canvasEl.getContext('2d', {
                    alpha: true,
                    colorSpace: desiredColorSpace,
                });
                ctx2d = ctx2dRef.current;
                if (!ctx2d) return;
            }
            // Use drawImage instead of bitmaprenderer for colorSpace control
            ctx2d.drawImage(resultCanvas, 0, 0, targetWidth, targetHeight);
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
    // BATTERY OPTIMIZATION: Uses MutationObserver instead of polling for video element discovery
    useEffect(() => {
        let cancelled = false;
        let observer: MutationObserver | null = null;

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
            const video = containerRef?.current?.querySelector('video') as HTMLVideoElement | null;
            if (video && video !== videoRef.current) {
                setupCallback(video);
                observer?.disconnect();
                observer = null;
                return true;
            }
            return false;
        };

        // Try immediately
        if (!findVideo() && containerRef?.current) {
            // BATTERY OPTIMIZATION: Use MutationObserver instead of polling
            // This is event-driven and doesn't wake the CPU unnecessarily
            observer = new MutationObserver(() => {
                findVideo();
            });
            observer.observe(containerRef.current, { childList: true, subtree: true });
        }

        return () => {
            cancelled = true;
            observer?.disconnect();
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
            ctx2dRef.current = null;
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
