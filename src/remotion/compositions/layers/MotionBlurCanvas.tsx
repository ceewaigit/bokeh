/**
 * MotionBlurLayer.tsx
 *
 * Directional motion blur using RAW WEBGL.
 * Replaces PixiJS to ensure exact color matching and no initialization race conditions.
 *
 * Key features:
 * - Raw WebGL 2.0 context
 * - Manual texture management with UNPACK_COLORSPACE_CONVERSION_WEBGL: NONE
 * * Custom shader for directional blur with cinematic shutter weighting
 * - Optional velocity smoothing for stable motion trails
 */

import React, { useEffect, useRef, useState } from 'react';
import { useCurrentFrame } from 'remotion';
import { clamp01, smootherStep } from '@/lib/core/math';
import { MotionBlurController } from './MotionBlurController';
export interface MotionBlurCanvasProps {
    /** Whether motion blur feature is enabled (layout check) */
    enabled?: boolean;
    /** Velocity vector in pixels per frame */
    velocity: { x: number; y: number };

    /** Intensity multiplier (0-1) */
    intensity?: number;
    /** Debug mode */
    debugSplit?: boolean;
    /** Samples count (optional override) */
    samples?: number;

    /** Video element to use as texture source (legacy - prefer containerRef) */
    videoElement?: HTMLVideoElement | null;
    /** Container ref to search for video element */
    containerRef?: React.RefObject<HTMLElement | null>;

    /** Dimensions of the rendered video */
    drawWidth: number;
    drawHeight: number;
    /** Position offset */
    offsetX: number;
    offsetY: number;
}

export const MotionBlurCanvas: React.FC<MotionBlurCanvasProps> = ({
    enabled: enabledProp = true, // Default to true if not passed
    velocity,
    intensity = 1.0,
    debugSplit = false,
    samples,
    videoElement: propsVideoElement,
    containerRef,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
}) => {
    // START: CONSTANT CONFIG (Could be props if we need them dynamic per-clip)
    // For now, we keep these static as they are rarely changed in UI
    const config = {
        maxBlurRadius: 40,
        velocityThreshold: 10,
    };

    const maxBlurRadius = config.maxBlurRadius;
    const velocityThreshold = config.velocityThreshold;

    const rampRange = 0.5;
    const clamp = 60;
    const gamma = 1.0;
    const blackLevel = 0;
    const saturation = 1.0;
    const force = false;
    // END: CONSTANT CONFIG

    // Layout check implies enabled
    const enabled = enabledProp && intensity > 0;

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    // Force re-render on video events
    const [tick, setTick] = useState(0);
    const frame = useCurrentFrame();

    // Observe for video element changes (clips switching) to force re-render
    useEffect(() => {
        if (!containerRef?.current) return;
        const observer = new MutationObserver(() => setTick(t => t + 1));
        observer.observe(containerRef.current, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [containerRef]);

    // 2. Render Loop (Delegated to Controller)
    React.useLayoutEffect(() => {
        // Resolve video element synchronously to avoid React state delay (Critical for Export)
        // Support both <video> (Preview/Standard) and <img> (OffthreadVideo/Export)
        const mediaElement = containerRef?.current?.querySelector('video, img') as (HTMLVideoElement | HTMLImageElement) | null || propsVideoElement;

        if (!canvasRef.current) return;
        let ctx = ctxRef.current;
        if (!ctx) {
            ctx = canvasRef.current.getContext('2d');
            ctxRef.current = ctx;
        }

        if (!ctx || !mediaElement) return;

        // Unified readiness check
        const isVideo = mediaElement instanceof HTMLVideoElement;

        if (isVideo) {
            if (mediaElement.readyState < 2) return;
        } else {
            // Check for Image (OffthreadVideo)
            if (!(mediaElement as HTMLImageElement).complete) return;
            if ((mediaElement as HTMLImageElement).naturalWidth === 0) return;
        }

        let handle: number;
        if (isVideo && 'requestVideoFrameCallback' in mediaElement) {
            handle = (mediaElement as any).requestVideoFrameCallback(() => setTick(t => t + 1));
        }

        // DETERMINISTIC: Use passed-in velocity directly (already smoothed by controller)
        // This ensures export/multi-thread consistency.
        // Sanitize to prevent NaN
        const smoothVx = Number.isFinite(velocity.x) ? velocity.x : 0;
        const smoothVy = Number.isFinite(velocity.y) ? velocity.y : 0;

        const speed = Math.sqrt(smoothVx * smoothVx + smoothVy * smoothVy);
        // Sanitize threshold and ramp to prevent NaN
        const validThreshold = Number.isFinite(velocityThreshold) ? velocityThreshold : 1;
        const validRamp = Number.isFinite(rampRange) ? rampRange : 0.5;
        const excess = Math.max(0, speed - validThreshold);
        const softKneeRange = Math.max(1, validThreshold * validRamp);
        let rampFactor = smootherStep(clamp01(excess / softKneeRange));

        // Sanitize intensity
        const validIntensity = Number.isFinite(intensity) ? intensity : 0;

        if (force) {
            rampFactor = 1.0;
        }

        const maxRadius = clamp > 0 ? clamp : maxBlurRadius;

        let effectiveRadius: number;
        if (force) {
            effectiveRadius = 600 * rampFactor;
        } else {
            // Velocity-proportional scaling with natural cinematic falloff
            const velocityRange = maxRadius * 2.0;
            const velocityRatio = clamp01(excess / Math.max(1, velocityRange));

            const cinematicCurve = Math.pow(velocityRatio, 1.1);
            const targetRadius = cinematicCurve * validIntensity * maxRadius;

            effectiveRadius = Math.min(maxRadius, targetRadius) * rampFactor;
        }
        const rawSpeed = Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0);

        // OPACITY MODULATION
        const opacityRamp = clamp01(effectiveRadius / 2.0);

        if (canvasRef.current) {
            canvasRef.current.style.opacity = opacityRamp.toFixed(3);
        }

        const isIdle = !force && rawSpeed < 0.1 && opacityRamp < 0.01;

        if (isIdle) {
            // Clear the canvas if idle to prevent stuck frames
            ctx.clearRect(0, 0, drawWidth, drawHeight);
            return (() => {
                if (handle && isVideo && 'cancelVideoFrameCallback' in mediaElement) (mediaElement as any).cancelVideoFrameCallback(handle);
            }) as any;
        }

        // --- SINGLETON RENDER ---
        let dirX = 0; let dirY = 0;
        if (force) {
            dirX = 1.0; dirY = 0.5;
        } else if (speed > 0.01) {
            dirX = smoothVx / speed; dirY = smoothVy / speed;
        }
        const uvVelocityX = (dirX * effectiveRadius) / drawWidth;
        const uvVelocityY = (dirY * effectiveRadius) / drawHeight;

        // Cap samples
        const calculatedSamples = Math.max(8, Math.min(64, Math.ceil(effectiveRadius)));
        const finalSamples = Math.min(64, samples ?? calculatedSamples);

        // SAFETY
        const rawBlack = Number.isFinite(blackLevel) ? blackLevel : 0;
        const safeBlackLevel = Math.max(-0.02, Math.min(0.99, rawBlack));
        const safeSaturation = Number.isFinite(saturation) ? saturation : 1.0;

        // Render to shared WebGL context (Offscreen)
        // Note: MotionBlurController.render accepts TexImageSource which includes both Video and Image
        const resultCanvas = MotionBlurController.instance.render(
            mediaElement,
            drawWidth,
            drawHeight,
            {
                uvVelocityX: Number.isFinite(uvVelocityX) ? uvVelocityX : 0,
                uvVelocityY: Number.isFinite(uvVelocityY) ? uvVelocityY : 0,
                intensity: 1.0, // Intensity is pre-calculated in uvVelocity
                samples: finalSamples,
                debugSplit,
                gamma: Number.isFinite(gamma) ? gamma : 1.0,
                blackLevel: safeBlackLevel,
                saturation: safeSaturation
            }
        );

        // Copy result to local 2D canvas
        if (resultCanvas) {
            // Ensure 2D context is ready for simple copy
            if (ctx.canvas.width !== drawWidth || ctx.canvas.height !== drawHeight) {
                ctx.canvas.width = drawWidth;
                ctx.canvas.height = drawHeight;
            }

            ctx.globalCompositeOperation = 'copy'; // Faster, replaces content
            ctx.drawImage(resultCanvas, 0, 0, drawWidth, drawHeight);
        }

        return () => {
            if (handle && isVideo && 'cancelVideoFrameCallback' in mediaElement) (mediaElement as any).cancelVideoFrameCallback(handle);
        };
    }, [frame, velocity, intensity, debugSplit, drawWidth, drawHeight, rampRange, velocityThreshold, clamp, maxBlurRadius, tick, gamma, samples, blackLevel, saturation, force]);

    if (!enabled) return null;

    return (
        <canvas
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
                zIndex: 10,
                opacity: 0,
            }}
        />
    );
};
