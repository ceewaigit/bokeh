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
import { useCurrentFrame } from 'remotion';
import { clamp01, smootherStep } from '@/features/canvas/math';
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
    /** Whether to premultiply alpha on upload (helps avoid dark fringes on transparent sources) */
    unpackPremultiplyAlpha?: boolean;
    /** Split-screen debug: hide left half of the motion blur canvas */
    debugSplit?: boolean;
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
    unpackPremultiplyAlpha = false,
    debugSplit = false,
    videoFrame,
    containerRef,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
    renderScale = 1,
    velocityThreshold: velocityThresholdProp = 0,
    rampRange: rampRangeProp = 0.5,
    clampRadius: clampRadiusProp = 60,
    smoothWindow: smoothWindowProp = 6,
}) => {
    // Config - use props instead of hard-coded values
    const maxBlurRadius = clampRadiusProp > 0 ? clampRadiusProp : 60;
    const velocityThreshold = velocityThresholdProp;  // Default 0 = most sensitive
    const rampRange = rampRangeProp;
    const clampRadius = clampRadiusProp;

    // Velocity smoothing ref - persists across renders for fade effect
    const prevVelocityRef = useRef({ x: 0, y: 0 });

    const enabled = enabledProp && intensity > 0;
    // Force sRGB to match video color space - P3 causes visible color mismatch
    const desiredColorSpace: PredefinedColorSpace = colorSpace ?? 'srgb';

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const bitmapCtxRef = useRef<ImageBitmapRenderingContext | null>(null);
    const frame = useCurrentFrame();

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
            // If we can't resolve a media source (e.g. during a seek), ensure the overlay
            // doesn't cover the underlying video with a stale/blank frame.
            canvasEl.style.opacity = '0';
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

        const pixelRatio = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;
        const clampedRenderScale = Number.isFinite(renderScale) ? Math.max(1, renderScale) : 1;
        const outputScale = pixelRatio * clampedRenderScale;

        const resolveLength = (
            value: number | SVGAnimatedLength | undefined,
            fallback: number
        ): number => {
            if (typeof value === 'number') {
                return Number.isFinite(value) ? value : fallback;
            }
            if (value && typeof value === 'object' && 'baseVal' in value) {
                const baseValue = value.baseVal?.value;
                return Number.isFinite(baseValue) ? baseValue : fallback;
            }
            return fallback;
        };

        const resolveSourceSize = (source: CanvasImageSource) => {
            const fallback = { width: drawWidth, height: drawHeight };
            if (!source) return fallback;
            if ('videoWidth' in source && 'videoHeight' in source) {
                const width = Number.isFinite(source.videoWidth) ? source.videoWidth : fallback.width;
                const height = Number.isFinite(source.videoHeight) ? source.videoHeight : fallback.height;
                return { width, height };
            }
            if ('naturalWidth' in source && 'naturalHeight' in source) {
                const width = Number.isFinite(source.naturalWidth) ? source.naturalWidth : fallback.width;
                const height = Number.isFinite(source.naturalHeight) ? source.naturalHeight : fallback.height;
                return { width, height };
            }
            if ('codedWidth' in source && 'codedHeight' in source) {
                const width = Number.isFinite(source.codedWidth) ? source.codedWidth : fallback.width;
                const height = Number.isFinite(source.codedHeight) ? source.codedHeight : fallback.height;
                return { width, height };
            }
            if ('width' in source && 'height' in source) {
                const width = resolveLength(source.width, fallback.width);
                const height = resolveLength(source.height, fallback.height);
                return { width, height };
            }
            return fallback;
        };

        const sourceSize = resolveSourceSize(mediaSource);
        const useSourceSize = sourceSize.width !== drawWidth || sourceSize.height !== drawHeight;
        const targetOutputWidth = Math.max(1, Math.round(drawWidth * outputScale));
        const targetOutputHeight = Math.max(1, Math.round(drawHeight * outputScale));
        const sourceScale = Math.max(
            targetOutputWidth / Math.max(1, sourceSize.width),
            targetOutputHeight / Math.max(1, sourceSize.height)
        );

        // Apply velocity smoothing for gradual fade effect
        const rawVx = Number.isFinite(velocity.x) ? velocity.x : 0;
        const rawVy = Number.isFinite(velocity.y) ? velocity.y : 0;
        const smoothFactor = 1 / Math.max(1, smoothWindowProp);  // Higher window = slower fade

        // Lerp toward current velocity (creates trailing fade-out effect)
        const smoothVx = prevVelocityRef.current.x + (rawVx - prevVelocityRef.current.x) * smoothFactor;
        const smoothVy = prevVelocityRef.current.y + (rawVy - prevVelocityRef.current.y) * smoothFactor;
        prevVelocityRef.current = { x: smoothVx, y: smoothVy };

        const speed = Math.hypot(smoothVx, smoothVy);

        canvasEl.style.visibility = 'visible';

        const validThreshold = Number.isFinite(velocityThreshold) ? velocityThreshold : 0;
        const validRamp = Number.isFinite(rampRange) ? rampRange : 0.5;
        const excess = Math.max(0, speed - validThreshold);
        // For zero threshold, use a small soft knee range to prevent abrupt on/off
        const softKneeRange = validThreshold > 0 ? Math.max(1, validThreshold * validRamp) : 5;
        const rampFactor = smootherStep(clamp01(excess / softKneeRange));

        const validIntensity = Number.isFinite(intensity) ? intensity : 0;
        const maxRadius = clampRadius > 0 ? clampRadius : maxBlurRadius;

        // Velocity-proportional scaling with reduced cinematic falloff
        const velocityRange = maxRadius * 2.0;
        const velocityRatio = clamp01(excess / Math.max(1, velocityRange));
        // Reduced exponent (0.8 instead of 1.1) for more linear response at lower velocities
        const cinematicCurve = Math.pow(velocityRatio, 0.8);
        const targetRadius = cinematicCurve * validIntensity * maxRadius;
        const effectiveRadius = Math.min(maxRadius, targetRadius) * rampFactor;

        // Opacity modulation - increased threshold for better quality when blur is subtle
        const opacityRamp = clamp01(effectiveRadius / 2.0);
        const canvasOpacity = debugSplit ? 1 : opacityRamp;
        canvasEl.style.opacity = canvasOpacity.toFixed(3);

        // If the blur is too subtle, skip rendering to avoid unnecessary work
        if (!debugSplit && opacityRamp < 0.01) {
            canvasEl.style.visibility = 'hidden';
            return;
        }

        // Calculate blur direction
        let dirX = 0, dirY = 0;
        if (speed > 0.01) {
            dirX = smoothVx / speed;
            dirY = smoothVy / speed;
        }
        const uvVelocityX = (dirX * effectiveRadius) / drawWidth;
        const uvVelocityY = (dirY * effectiveRadius) / drawHeight;

        // Dynamic sample count
        const calculatedSamples = Math.max(8, Math.min(64, Math.ceil(effectiveRadius)));
        const finalSamples = Math.min(64, samples ?? calculatedSamples);

        // Render via WebGL controller
        const glPixelRatio = useSourceSize ? Math.max(1, sourceScale) : outputScale;
        const resultCanvas = MotionBlurController.instance.render(
            mediaSource as TexImageSource,
            sourceSize.width,
            sourceSize.height,
            {
                uvVelocityX: Number.isFinite(uvVelocityX) ? uvVelocityX : 0,
                uvVelocityY: Number.isFinite(uvVelocityY) ? uvVelocityY : 0,
                intensity: 1.0,
                samples: finalSamples,
                mix: Number.isFinite(mix) ? mix : 1.0,
                gamma: Number.isFinite(gamma) ? gamma : 1.0,
                blackLevel: Math.max(-0.02, Math.min(0.99, blackLevel)),
                saturation: Number.isFinite(saturation) ? saturation : 1.0,
                colorSpace: actualColorSpace,
                unpackPremultiplyAlpha,
                pixelRatio: glPixelRatio,
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
        }
    }, [
        frame,
        videoFrame,
        velocity,
        intensity,
        mix,
        samples,
        desiredColorSpace,
        gamma,
        blackLevel,
        saturation,
        unpackPremultiplyAlpha,
        drawWidth,
        drawHeight,
        renderScale,
        containerRef,
        debugSplit,
        maxBlurRadius,
        velocityThreshold,
        rampRange,
        clampRadius,
        smoothWindowProp,
    ]);

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
                clipPath: debugSplit ? 'inset(0 0 0 50%)' : undefined,
            }}
        />
    );
};
