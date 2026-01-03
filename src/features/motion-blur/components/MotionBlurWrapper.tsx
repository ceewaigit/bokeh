/**
 * MotionBlurWrapper.tsx
 *
 * Wrapper component that adds motion blur to a video element.
 * Uses Remotion's onVideoFrame pattern for export, DOM fallback for preview.
 *
 * Key principles:
 * - Video always renders (graceful degradation)
 * - Motion blur canvas overlays when active
 * - Export: uses onVideoFrame callback
 * - Preview: falls back to DOM discovery + requestVideoFrameCallback
 */

import React, { useRef } from 'react';
import { MotionBlurCanvas } from './MotionBlurCanvas';

export interface MotionBlurWrapperProps {
    /** Whether motion blur is enabled for this clip */
    enabled: boolean;
    /** Camera velocity in pixels per frame */
    velocity: { x: number; y: number };
    /** Intensity multiplier (0-1) */
    intensity?: number;
    /** Output color space for the motion blur layer */
    colorSpace?: PredefinedColorSpace;
    /** Gamma correction factor */
    gamma?: number;
    /** Manual black level adjustment */
    blackLevel?: number;
    /** Saturation adjustment */
    saturation?: number;
    /** Samples count (optional override) */
    samples?: number;
    /** Whether to premultiply alpha on upload */
    unpackPremultiplyAlpha?: boolean;
    /** Split-screen debug: hide left half of the motion blur canvas */
    debugSplit?: boolean;
    /** Draw dimensions */
    drawWidth: number;
    drawHeight: number;
    /** Additional scale applied to the video container (e.g. zoom) */
    renderScale?: number;
    /** Video frame from onVideoFrame callback (export mode) */
    videoFrame?: CanvasImageSource | null;
    /** Children (the video element) */
    children: React.ReactNode;
    /** Velocity threshold in pixels/frame - blur only activates above this speed */
    velocityThreshold?: number;
    /** Soft knee ramp range (0-1) - controls transition smoothness */
    rampRange?: number;
    /** Maximum blur radius clamp */
    clampRadius?: number;
    /** Smoothing window in frames - higher = longer blur fade */
    smoothWindow?: number;
}

/**
 * Wraps a video element and adds motion blur overlay when active.
 * Video is never hidden - blur overlays on top.
 */
export const MotionBlurWrapper: React.FC<MotionBlurWrapperProps> = ({
    enabled,
    velocity,
    intensity = 1.0,
    colorSpace,
    gamma,
    blackLevel,
    saturation,
    samples,
    unpackPremultiplyAlpha,
    debugSplit,
    drawWidth,
    drawHeight,
    videoFrame,
    renderScale,
    children,
    velocityThreshold,
    rampRange,
    clampRadius,
    smoothWindow,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* Video always renders */}
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    clipPath: debugSplit ? 'inset(0 50% 0 0)' : undefined,
                }}
            >
                {children}
            </div>

            {/* Motion blur canvas overlays when active */}
            {enabled && (
                <MotionBlurCanvas
                    enabled={true}
                    velocity={velocity}
                    intensity={intensity}
                    samples={samples}
                    colorSpace={colorSpace}
                    gamma={gamma}
                    blackLevel={blackLevel}
                    saturation={saturation}
                    unpackPremultiplyAlpha={unpackPremultiplyAlpha}
                    debugSplit={debugSplit}
                    videoFrame={videoFrame}
                    containerRef={containerRef}
                    drawWidth={drawWidth}
                    drawHeight={drawHeight}
                    offsetX={0}
                    offsetY={0}
                    renderScale={renderScale}
                    velocityThreshold={velocityThreshold}
                    rampRange={rampRange}
                    clampRadius={clampRadius}
                    smoothWindow={smoothWindow}
                />
            )}
        </div>
    );
};

MotionBlurWrapper.displayName = 'MotionBlurWrapper';
