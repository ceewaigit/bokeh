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
}

export const MotionBlurCanvas: React.FC<MotionBlurCanvasProps> = ({
    enabled: enabledProp = true,
    velocity,
    intensity = 1.0,
    mix = 1.0,
    samples,
    videoFrame,
    containerRef,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
}) => {
    // Config
    const maxBlurRadius = 40;
    const velocityThreshold = 10;
    const rampRange = 0.5;
    const clampRadius = 60;
    const gamma = 1.0;
    const blackLevel = 0;
    const saturation = 1.0;

    const enabled = enabledProp && intensity > 0;

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const frame = useCurrentFrame();

    // Render effect when the Remotion frame advances (preview/export) or when `videoFrame` changes (export mode).
    React.useLayoutEffect(() => {
        const canvasEl = canvasRef.current;
        if (!canvasEl) return;

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
            if (ctxRef.current) {
                ctxRef.current.clearRect(0, 0, ctxRef.current.canvas.width, ctxRef.current.canvas.height);
            }
            return;
        }

        let ctx = ctxRef.current;
        if (!ctx) {
            ctx = canvasEl.getContext('2d');
            ctxRef.current = ctx;
        }
        if (!ctx) return;

        // Calculate blur parameters from velocity
        const smoothVx = Number.isFinite(velocity.x) ? velocity.x : 0;
        const smoothVy = Number.isFinite(velocity.y) ? velocity.y : 0;
        const speed = Math.hypot(smoothVx, smoothVy);

        const validThreshold = Number.isFinite(velocityThreshold) ? velocityThreshold : 1;
        const validRamp = Number.isFinite(rampRange) ? rampRange : 0.5;
        const excess = Math.max(0, speed - validThreshold);
        const softKneeRange = Math.max(1, validThreshold * validRamp);
        const rampFactor = smootherStep(clamp01(excess / softKneeRange));

        const validIntensity = Number.isFinite(intensity) ? intensity : 0;
        const maxRadius = clampRadius > 0 ? clampRadius : maxBlurRadius;

        // Velocity-proportional scaling with cinematic falloff
        const velocityRange = maxRadius * 2.0;
        const velocityRatio = clamp01(excess / Math.max(1, velocityRange));
        const cinematicCurve = Math.pow(velocityRatio, 1.1);
        const targetRadius = cinematicCurve * validIntensity * maxRadius;
        const effectiveRadius = Math.min(maxRadius, targetRadius) * rampFactor;

        // Opacity modulation
        const opacityRamp = clamp01(effectiveRadius / 2.0);
        canvasEl.style.opacity = opacityRamp.toFixed(3);

        // If the blur is effectively invisible, skip the expensive WebGL pass.
        if (opacityRamp < 0.01) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
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
        const resultCanvas = MotionBlurController.instance.render(
            mediaSource as TexImageSource,
            drawWidth,
            drawHeight,
            {
                uvVelocityX: Number.isFinite(uvVelocityX) ? uvVelocityX : 0,
                uvVelocityY: Number.isFinite(uvVelocityY) ? uvVelocityY : 0,
                intensity: 1.0,
                samples: finalSamples,
                mix: Number.isFinite(mix) ? mix : 1.0,
                gamma: Number.isFinite(gamma) ? gamma : 1.0,
                blackLevel: Math.max(-0.02, Math.min(0.99, blackLevel)),
                saturation: Number.isFinite(saturation) ? saturation : 1.0,
            }
        );

        // Copy result to display canvas
        if (resultCanvas) {
            if (ctx.canvas.width !== drawWidth || ctx.canvas.height !== drawHeight) {
                ctx.canvas.width = drawWidth;
                ctx.canvas.height = drawHeight;
            }
            ctx.globalCompositeOperation = 'copy';
            ctx.drawImage(resultCanvas, 0, 0, drawWidth, drawHeight);
        }
    }, [frame, videoFrame, velocity, intensity, mix, samples, drawWidth, drawHeight, containerRef]);

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
                zIndex: 50,  // Below AnnotationLayer (z-index 100) - annotations should always be visible
                opacity: 0,
            }}
        />
    );
};
