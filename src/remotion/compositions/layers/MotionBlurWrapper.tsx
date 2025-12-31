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
    /** Draw dimensions */
    drawWidth: number;
    drawHeight: number;
    /** Video frame from onVideoFrame callback (export mode) */
    videoFrame?: CanvasImageSource | null;
    /** Children (the video element) */
    children: React.ReactNode;
}

/**
 * Wraps a video element and adds motion blur overlay when active.
 * Video is never hidden - blur overlays on top.
 */
export const MotionBlurWrapper: React.FC<MotionBlurWrapperProps> = ({
    enabled,
    velocity,
    intensity = 1.0,
    drawWidth,
    drawHeight,
    videoFrame,
    children,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* Video always renders */}
            {children}

            {/* Motion blur canvas overlays when active */}
            {enabled && (
                <MotionBlurCanvas
                    enabled={true}
                    velocity={velocity}
                    intensity={intensity}
                    videoFrame={videoFrame}
                    containerRef={containerRef}
                    drawWidth={drawWidth}
                    drawHeight={drawHeight}
                    offsetX={0}
                    offsetY={0}
                />
            )}
        </div>
    );
};

MotionBlurWrapper.displayName = 'MotionBlurWrapper';

