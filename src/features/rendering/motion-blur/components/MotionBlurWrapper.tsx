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

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MotionBlurCanvas } from './MotionBlurCanvas';

export interface MotionBlurWrapperProps {
    /** Export mode (Remotion render) */
    isRendering?: boolean;
    /** Whether motion blur is enabled for this clip */
    enabled: boolean;
    /** Whether user is actively scrubbing the timeline */
    isScrubbing?: boolean;
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
    /** Render base video through WebGL for consistent pipeline */
    useWebglVideo?: boolean;
    /** Samples count (optional override) */
    samples?: number;
    /** Whether to premultiply alpha on upload */
    unpackPremultiplyAlpha?: boolean;
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
    /** Refocus blur intensity (0-1) for omnidirectional blur during zoom transitions */
    refocusBlurIntensity?: number;
}

/**
 * Wraps a video element and adds motion blur overlay when active.
 * Video is never hidden - blur overlays on top.
 */
export const MotionBlurWrapper: React.FC<MotionBlurWrapperProps> = ({
    isRendering = false,
    enabled,
    velocity,
    intensity = 1.0,
    colorSpace,
    gamma,
    blackLevel,
    saturation,
    useWebglVideo,
    samples,
    unpackPremultiplyAlpha,
    drawWidth,
    drawHeight,
    videoFrame,
    renderScale,
    children,
    velocityThreshold,
    rampRange,
    clampRadius,
    smoothWindow,
    refocusBlurIntensity,
    isScrubbing = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [webglReady, setWebglReady] = useState(false);
    const [hasFreshFrame, setHasFreshFrame] = useState(false);
    const [canvasVisible, setCanvasVisible] = useState(false);
    const freshFrameTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!useWebglVideo) {
            setWebglReady(false);
        }
    }, [useWebglVideo]);

    const hasRefocusBlur = (refocusBlurIntensity ?? 0) > 0.001;
    const forceRender = Boolean(isRendering && useWebglVideo);

    // Keep canvas mounted whenever blur is enabled - let canvas handle its own opacity via smoothing
    // This prevents smoothing ref destruction and allows natural fade-out
    const shouldRenderCanvas = Boolean(enabled && !isScrubbing && ((intensity ?? 1) > 0 || hasRefocusBlur || forceRender));
    const shouldHideVideo = Boolean(useWebglVideo && enabled && shouldRenderCanvas && !isScrubbing);

    useEffect(() => {
        if (!shouldHideVideo) {
            setWebglReady(false);
            setHasFreshFrame(false);
            setCanvasVisible(false);
            if (freshFrameTimeoutRef.current !== null) {
                window.clearTimeout(freshFrameTimeoutRef.current);
                freshFrameTimeoutRef.current = null;
            }
        }
    }, [shouldHideVideo]);

    const handleCanvasRender = useCallback(() => {
        setHasFreshFrame(true);
        if (freshFrameTimeoutRef.current !== null) {
            window.clearTimeout(freshFrameTimeoutRef.current);
        }
        // If WebGL rendering stalls (missing video element during seek, etc.),
        // fall back to the native <video> so preview never "disappears".
        // PERF: Increased from 120ms to 250ms to prevent flickering during frame drops
        freshFrameTimeoutRef.current = window.setTimeout(() => {
            setHasFreshFrame(false);
            freshFrameTimeoutRef.current = null;
        }, 250);
    }, []);

    useEffect(() => {
        return () => {
            if (freshFrameTimeoutRef.current !== null) {
                window.clearTimeout(freshFrameTimeoutRef.current);
                freshFrameTimeoutRef.current = null;
            }
        };
    }, []);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* Video always renders */}
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    opacity: shouldHideVideo
                        ? (
                            isRendering
                              ? (webglReady ? 0 : 1)
                              : (canvasVisible && hasFreshFrame ? 0 : 1)
                          )
                        : 1,
                }}
            >
                {children}
            </div>

            {/* Motion blur canvas overlays when active or when WebGL video is forced */}
            {shouldRenderCanvas && (
                <MotionBlurCanvas
                    enabled={true}
                    velocity={velocity}
                    intensity={intensity}
                    samples={samples}
                    colorSpace={colorSpace}
                    gamma={gamma}
                    blackLevel={blackLevel}
                    saturation={saturation}
                    forceRender={forceRender}
                    onRender={() => {
                        if (shouldHideVideo) {
                            setWebglReady(true);
                        }
                        if (!isRendering) {
                            handleCanvasRender();
                        }
                    }}
                    onVisibilityChange={setCanvasVisible}
                    unpackPremultiplyAlpha={unpackPremultiplyAlpha}
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
                    refocusBlurIntensity={refocusBlurIntensity}
                />
            )}
        </div>
    );
};

MotionBlurWrapper.displayName = 'MotionBlurWrapper';
