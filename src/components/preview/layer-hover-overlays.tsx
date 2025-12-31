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
                    <div className="absolute inset-0 rounded-2xl bg-white/5 ring-1 ring-white/15" />
                    <div className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/80">
                        Background
                    </div>
                </div>
            )}

            {/* Webcam layer hover hint - uses bounds from DOM query */}
            {hoveredLayer === 'webcam' && webcamOverlay && (
                <div className="pointer-events-none absolute inset-0 z-20">
                    <div
                        className="absolute rounded-[22px] bg-white/5 ring-1 ring-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
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
                    {/* Radial glow around cursor */}
                    <div
                        className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.2)_0%,_rgba(255,255,255,0.1)_38%,_rgba(255,255,255,0.02)_60%,_rgba(255,255,255,0)_70%)]"
                        style={{
                            left: `${cursorOverlay.left + cursorOverlay.width * 0.5}px`,
                            top: `${cursorOverlay.top + cursorOverlay.height * 0.45}px`,
                        }}
                    />
                    {/* Label */}
                    <div
                        className="absolute rounded-full bg-black/40 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/80"
                        style={{
                            left: `${Math.max(12, cursorOverlay.left + cursorOverlay.width * 0.65)}px`,
                            top: `${Math.max(12, cursorOverlay.top - 22)}px`,
                        }}
                    >
                        Cursor
                    </div>
                </div>
            )}
        </>
    );
};
