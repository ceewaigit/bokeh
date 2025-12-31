import React from 'react';

export type PreviewHoverLayer = 'background' | 'cursor' | 'webcam' | null;

export interface CursorOverlayData {
    left: number;
    top: number;
    width: number;
    height: number;
    tipX: number;
    tipY: number;
    src: string;
}

export interface WebcamOverlayData {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface LayerHoverOverlaysProps {
    hoveredLayer: PreviewHoverLayer;
    cursorOverlay: CursorOverlayData | null;
    webcamOverlay: WebcamOverlayData | null;
    canSelectBackground: boolean;
    canSelectCursor: boolean;
    canSelectWebcam: boolean;
    containerWidth?: number;
    containerHeight?: number;
}

/**
 * Renders hover hint overlays for the preview layers.
 * Shows visual feedback when user hovers over clickable areas.
 * 
 * Now receives bounds directly from DOM-based hit testing,
 * so no transform replication is needed.
 */
export const LayerHoverOverlays: React.FC<LayerHoverOverlaysProps> = ({
    hoveredLayer,
    cursorOverlay,
    webcamOverlay,
    canSelectBackground,
}) => {
    return (
        <>
            {/* Background layer hover hint */}
            {hoveredLayer === 'background' && canSelectBackground && (
                <div className="pointer-events-none absolute inset-0 z-20 opacity-100 transition-opacity duration-150 ease-out">
                    <div className="absolute inset-0 rounded-2xl bg-white/5 border border-white/15" />
                    <div className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/80">
                        Background
                    </div>
                </div>
            )}

            {/* Webcam layer hover hint - uses bounds from DOM query */}
            {hoveredLayer === 'webcam' && webcamOverlay && (
                <div className="pointer-events-none absolute inset-0 z-20">
                    <div
                        className="absolute rounded-[22px] bg-white/5 border border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                        style={{
                            left: `${webcamOverlay.x}px`,
                            top: `${webcamOverlay.y}px`,
                            width: `${webcamOverlay.width}px`,
                            height: `${webcamOverlay.height}px`,
                        }}
                    />
                    <div
                        className="absolute rounded-full bg-black/40 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/80"
                        style={{
                            left: `${Math.max(12, webcamOverlay.x + 8)}px`,
                            top: `${Math.max(12, webcamOverlay.y + 8)}px`,
                        }}
                    >
                        Webcam
                    </div>
                </div>
            )}

            {/* Cursor layer hover hint - uses bounds from DOM query */}
            {hoveredLayer === 'cursor' && cursorOverlay && (
                <div className="pointer-events-none absolute inset-0 z-20">
                    {/* Multi-layered refined glow */}
                    <div
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                            left: `${cursorOverlay.left + cursorOverlay.width * 0.45}px`, // Slight offset to match optical center
                            top: `${cursorOverlay.top + cursorOverlay.height * 0.4}px`,
                        }}
                    >
                        {/* Outer soft ambient glow */}
                        <div className="absolute h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-[0.08] blur-3xl" />

                        {/* Secondary spread glow */}
                        <div className="absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-[0.12] blur-xl mix-blend-plus-lighter" />

                        {/* Inner core accent */}
                        <div className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-[0.15] blur-md mix-blend-plus-lighter" />
                    </div>

                    {/* Label */}
                    <div
                        className="absolute rounded-full bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/90 shadow-lg"
                        style={{
                            left: `${Math.max(12, cursorOverlay.left + cursorOverlay.width * 0.75)}px`,
                            top: `${Math.max(12, cursorOverlay.top - 24)}px`,
                        }}
                    >
                        Cursor
                    </div>
                </div>
            )}
        </>
    );
};
