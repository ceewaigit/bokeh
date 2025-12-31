import React, { CSSProperties } from 'react';

import { useVideoPosition } from '@/remotion/context/layout/VideoPositionContext';

interface MotionBlurDebugLayerProps {
    enabled: boolean;
}

/**
 * MotionBlurDebugLayer
 *
 * Renders a split-screen overlay to help compare the native video (Left)
 * against the motion blur layer (Right).
 *
 * Usage:
 * - When enabled, it masks the RIGHT side of the screen to reveal the underlying
 *   content (Native Video), but the MotionBlurLayer sits on top.
 *   we want to see:
 *   - LEFT: Native Video (Motion Blur Layer hidden here)
 *   - RIGHT: Motion Blur Layer (Visible here)
 *
 *   So we need to mask the MotionBlurLayer itself.
 *   This component just provides visual guides or instructions if needed,
 *   but the actual masking logic needs to be in the MotionBlurLayer or a parent wrapper.
 *
 *   Simpler approach for this "Layer":
 *   Just a visual divider line. The actual masking logic will be in SharedVideoController
 *   or passed to MotionBlurLayer as a 'debugClip' prop.
 */
export const MotionBlurDebugLayer: React.FC<MotionBlurDebugLayerProps> = ({
    enabled,
}) => {
    const { drawWidth, drawHeight } = useVideoPosition();
    if (!enabled) return null;

    const style: CSSProperties = {
        position: 'absolute',
        left: 0,
        top: 0,
        width: drawWidth,
        height: drawHeight,
        pointerEvents: 'none',
        zIndex: 9999, // On top of everything
    };

    return (
        <div style={style}>
            {/* Center Line */}
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    bottom: 0,
                    width: 2,
                    backgroundColor: '#ff00ff',
                    transform: 'translateX(-50%)',
                }}
            />
            {/* Labels */}
            <div
                style={{
                    position: 'absolute',
                    left: 20,
                    top: 20,
                    color: '#ff00ff',
                    fontFamily: 'monospace',
                    fontSize: 24,
                    fontWeight: 'bold',
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                }}
            >
                NATIVE (Ref)
            </div>
            <div
                style={{
                    position: 'absolute',
                    right: 20,
                    top: 20,
                    color: '#ff00ff',
                    fontFamily: 'monospace',
                    fontSize: 24,
                    fontWeight: 'bold',
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                    textAlign: 'right',
                }}
            >
                WEBGL (Blur)
            </div>
        </div>
    );
};
