/**
 * MotionBlurWrapper.tsx
 *
 * Wrapper component that adds motion blur to a video element using IoC pattern.
 * The video is NEVER hidden - motion blur canvas overlays on top.
 *
 * Key principles:
 * - Video always renders at full opacity (graceful degradation)
 * - Motion blur canvas overlays when velocity threshold is exceeded
 * - Data flows down from context, no DOM discovery
 */

import React, { useRef } from 'react';
import { MotionBlurCanvas } from '../layers/MotionBlurCanvas';

export interface MotionBlurWrapperProps {
    /** Whether motion blur is enabled for this clip */
    enabled: boolean;
    /** Camera velocity in pixels per frame */
    velocity: { x: number; y: number };
    /** Draw dimensions */
    drawWidth: number;
    drawHeight: number;
    /** Children (the video element) */
    children: React.ReactNode;
}

/**
 * Wraps a video element and adds motion blur overlay when active.
 *
 * CRITICAL DESIGN:
 * - Video is NEVER hidden (no opacity manipulation)
 * - Motion blur canvas renders ON TOP of video when active
 * - If blur fails, video is always visible as fallback
 */
export const MotionBlurWrapper: React.FC<MotionBlurWrapperProps> = ({
    enabled,
    velocity,
    drawWidth,
    drawHeight,
    children,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // We pass enabled state down, but we NO LONGER unmount based on speed.
    // The Canvas handles its own idle state (opacity 0) to prevent blinking.
    // Mounting/unmounting causes React state reset and texture loss.
    const isActive = enabled;

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
            }}
        >
            {/* Video always renders - never hidden */}
            {children}

            {/* Motion blur canvas overlays when active */}
            {isActive && (
                <MotionBlurCanvas
                    enabled={true}
                    velocity={velocity}
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
