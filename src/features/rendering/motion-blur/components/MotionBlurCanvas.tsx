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

import React, { useRef } from 'react';
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
    clampRadius: _clampRadiusProp = 60,
    smoothWindow: _smoothWindowProp = 6,
    refocusBlurIntensity = 0,
}) => {
    // Velocity smoothing ref - persists across renders for fade effect
    const prevVelocityRef = useRef({ x: 0, y: 0 });

    const enabled = enabledProp && (intensity > 0 || refocusBlurIntensity > 0 || forceRender);
    // Force sRGB to match video color space - P3 causes visible color mismatch
    const desiredColorSpace: PredefinedColorSpace = colorSpace ?? 'srgb';

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const bitmapCtxRef = useRef<ImageBitmapRenderingContext | null>(null);
    const videoCanvasRef = useRef<OffscreenCanvas | HTMLCanvasElement | null>(null);
    const videoCtxRef = useRef<CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null>(null);


    // Render effect when the Remotion frame advances (preview/export) or when `videoFrame` changes (export mode).
    React.useLayoutEffect(() => {
        const canvasEl = canvasRef.current;
        if (!canvasEl) return;

        // If the canvas element was remounted, ensure we refresh the context.
        if (bitmapCtxRef.current && (bitmapCtxRef.current as any).canvas !== canvasEl) {
            bitmapCtxRef.current = null;
        }

        // Determine media source: export uses videoFrame, preview uses DOM fallback
        let mediaSource: CanvasImageSource | null = videoFrame ?? null;

        if (!mediaSource && containerRef?.current) {
            const video = containerRef.current.querySelector('video') as HTMLVideoElement | null;
            if (video && video.readyState >= 2) {
                mediaSource = video;
            }
        }

        if (!mediaSource) {
            // If we can't resolve a media source (e.g. during a seek), avoid hiding when
            // forcing WebGL video so the last good frame stays visible.
            if (!forceRender) {
                canvasEl.style.opacity = '0';
                onVisibilityChange?.(false);
            }
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

        // IMPORTANT: `drawWidth/drawHeight` are already in composition pixels.
        // Multiplying by `devicePixelRatio` here effectively supersamples the blur layer (2× on Retina),
        // which can explode GPU memory during zoom/follow-mouse. Export uses 1× pixels as well.
        const pixelRatio = 1;
        // `renderScale` is a resolution multiplier. Allow < 1 to downscale in preview (huge perf win),
        // but cap to avoid absurd allocations either way.
        const clampedRenderScale = Number.isFinite(renderScale)
            ? Math.max(0.25, Math.min(4, renderScale))
            : 1;
        const outputScale = pixelRatio * clampedRenderScale;

        // No need to resolve source element dimensions anymore; we render in output space.

        // Source-size resolution logic was previously used to decide whether to render at source size.
        // We now always render in output space to prevent GPU memory blowups, so this is intentionally removed.

        const targetOutputWidth = Math.max(1, Math.round(drawWidth * outputScale));
        const targetOutputHeight = Math.max(1, Math.round(drawHeight * outputScale));
        // Keep for future diagnostics/debugging if needed.
        // const sourceSize = resolveSourceSize(mediaSource);

        // ========================================================================
        // MOTION BLUR - PHYSICALLY CORRECT
        // Physics: blur_length = velocity × shutter_angle
        // 180° shutter (0.5) is industry standard for natural motion blur
        // ========================================================================
        const SHUTTER_ANGLE = 0.5;

        // Get raw velocity (already in pixels from use-frame-snapshot.ts)
        const rawVx = Number.isFinite(velocity.x) ? velocity.x : 0;
        const rawVy = Number.isFinite(velocity.y) ? velocity.y : 0;

        // Light smoothing to reduce jitter (simple symmetric EMA)
        const smoothFactor = 0.3;
        const smoothVx = prevVelocityRef.current.x + (rawVx - prevVelocityRef.current.x) * smoothFactor;
        const smoothVy = prevVelocityRef.current.y + (rawVy - prevVelocityRef.current.y) * smoothFactor;
        prevVelocityRef.current = { x: smoothVx, y: smoothVy };

        // Calculate speed for response curve
        const rawSpeed = Math.hypot(smoothVx, smoothVy);

        // Non-linear response curve: compress small movements, preserve large ones
        // Formula: response = speed² / (speed² + knee²) - soft knee curve
        // This suppresses micro-movements while preserving physics for fast motion
        const KNEE_PX = 15;  // Velocities << 15px are compressed, >> 15px approach 1:1
        const kneeSq = KNEE_PX * KNEE_PX;
        const speedSq = rawSpeed * rawSpeed;
        const responseMultiplier = speedSq / (speedSq + kneeSq);

        // Apply response curve to velocity (preserving direction)
        const scaledVx = smoothVx * responseMultiplier;
        const scaledVy = smoothVy * responseMultiplier;

        // Physical motion blur: velocity × shutter × user_intensity
        const validIntensity = Number.isFinite(intensity) ? intensity : 1.0;
        const blurVx = scaledVx * SHUTTER_ANGLE * validIntensity;
        const blurVy = scaledVy * SHUTTER_ANGLE * validIntensity;

        // Convert to UV space for shader (blur direction + magnitude in texture coordinates)
        const uvVelocityX = blurVx / drawWidth;
        const uvVelocityY = blurVy / drawHeight;

        // Visibility: hide canvas when blur is negligible
        const blurMagnitude = Math.hypot(uvVelocityX, uvVelocityY);
        const hasRefocusBlur = refocusBlurIntensity > 0.001;
        const isVisible = blurMagnitude > 0.0005 || hasRefocusBlur || forceRender;

        canvasEl.style.visibility = isVisible ? 'visible' : 'hidden';
        canvasEl.style.opacity = isVisible ? '1' : '0';
        onVisibilityChange?.(isVisible);

        if (!isVisible) return;

        // Sample count based on blur length (more samples for longer blur)
        const blurLengthPx = Math.hypot(blurVx, blurVy);
        const calculatedSamples = Math.max(8, Math.min(64, Math.ceil(blurLengthPx)));
        const finalSamples = samples ?? calculatedSamples;

        // Mix: scale blur blend based on magnitude (full blur when moving)
        const mixRamp = clamp01(blurMagnitude * 100);

        // Render via WebGL controller.
        // IMPORTANT: Render the blur output in *output space* (drawWidth/drawHeight), not source space.
        // Rendering at the source resolution (e.g. 4K/6K) and then downscaling explodes GPU memory
        // and is the primary cause of “zoomed in = laggy”.
        const glPixelRatio = outputScale;

        // Route video through a 2D canvas to match browser color-managed display.
        // PERF: Don’t re-rasterize at full source resolution in preview; only render enough pixels
        // for the output canvas (drawWidth/drawHeight × DPR × renderScale).
        let webglSource: TexImageSource = mediaSource as TexImageSource;
        if (mediaSource && 'videoWidth' in mediaSource) {
            const targetWidth = targetOutputWidth;
            const targetHeight = targetOutputHeight;
            if (!videoCanvasRef.current) {
                if (typeof OffscreenCanvas !== 'undefined') {
                    videoCanvasRef.current = new OffscreenCanvas(targetWidth, targetHeight);
                } else if (typeof document !== 'undefined') {
                    const canvas = document.createElement('canvas');
                    canvas.width = targetWidth;
                    canvas.height = targetHeight;
                    videoCanvasRef.current = canvas;
                }
            }
            if (videoCanvasRef.current) {
                if (
                    (videoCanvasRef.current as OffscreenCanvas).width !== targetWidth ||
                    (videoCanvasRef.current as OffscreenCanvas).height !== targetHeight
                ) {
                    (videoCanvasRef.current as OffscreenCanvas).width = targetWidth;
                    (videoCanvasRef.current as OffscreenCanvas).height = targetHeight;
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
                    videoCtxRef.current.drawImage(mediaSource, 0, 0, targetWidth, targetHeight);
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

        // Transfer result to display canvas using ImageBitmap (preserves colors without conversion)
        if (resultCanvas && 'transferToImageBitmap' in resultCanvas) {
            const targetWidth = targetOutputWidth;
            const targetHeight = targetOutputHeight;
            if (canvasEl.width !== targetWidth || canvasEl.height !== targetHeight) {
                canvasEl.width = targetWidth;
                canvasEl.height = targetHeight;
            }
            // transferToImageBitmap is synchronous and preserves exact colors
            const bitmap = (resultCanvas as OffscreenCanvas).transferToImageBitmap();
            bitmapCtx.transferFromImageBitmap(bitmap);
            const closable = (bitmap as { close?: () => void }).close;
            if (typeof closable === 'function') {
                closable.call(bitmap);
            }
            onVisibilityChange?.(true);
            if (onRender) onRender();
        }
        // No per-frame cleanup - let resources persist across frames for performance.
        // Cleanup only happens on unmount (separate effect below).
    }, [
        videoFrame,
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
        containerRef,
        onVisibilityChange,
        refocusBlurIntensity,
    ]);

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
        };
    }, []);

    if (!enabled) return null;

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
                opacity: 0,
                clipPath: undefined,
            }}
        />
    );
};
