import React from 'react';
import { AnnotationType } from '@/types/project';
import { getAnnotationLabel } from '@/features/effects/annotation/registry';

export type PreviewHoverLayer = 'background' | 'cursor' | 'webcam' | 'annotation' | 'video' | 'subtitle' | 'keystroke' | null;

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
    borderRadius?: string;
}

export interface VideoOverlayData {
    x: number;
    y: number;
    width: number;
    height: number;
    borderRadius?: string;
    clipPath?: string;
}

export interface AnnotationOverlayData {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: AnnotationType;
}

export interface SubtitleOverlayData {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    borderRadius?: string;
}

export interface KeystrokeOverlayData {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    borderRadius?: string;
}

interface LayerHoverOverlaysProps {
    hoveredLayer: PreviewHoverLayer;
    cursorOverlay: CursorOverlayData | null;
    webcamOverlay: WebcamOverlayData | null;
    annotationOverlay: AnnotationOverlayData | null;
    subtitleOverlay?: SubtitleOverlayData | null;
    keystrokeOverlay?: KeystrokeOverlayData | null;
    videoOverlay?: VideoOverlayData | null;
    backgroundOverlay?: VideoOverlayData | null;
    canSelectBackground: boolean;
    canSelectVideo?: boolean;
    canSelectSubtitle?: boolean;
    canSelectKeystroke?: boolean;
    /** Hide annotation hover overlay when this annotation is already selected */
    selectedAnnotationId?: string | null;
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
    annotationOverlay,
    videoOverlay,
    backgroundOverlay,
    canSelectBackground,
    selectedAnnotationId,
    canSelectVideo = false,
    subtitleOverlay,
    keystrokeOverlay,
    canSelectSubtitle = true,
    canSelectKeystroke = true,
}) => {
    return (
        <>
            {/* Background layer hover hint */}
            {hoveredLayer === 'background' && canSelectBackground && (
                <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                    {/* Inner content */}
                    <div
                        className="absolute bg-white/5 border border-white/15"
                        style={backgroundOverlay ? {
                            left: `${backgroundOverlay.x}px`,
                            top: `${backgroundOverlay.y}px`,
                            width: `${backgroundOverlay.width}px`,
                            height: `${backgroundOverlay.height}px`,
                            borderRadius: backgroundOverlay.borderRadius ?? '22px',
                        } : {
                            left: 0,
                            top: 0,
                            width: '100%',
                            height: '100%',
                            borderRadius: '22px',
                        }}
                    />
                    <div
                        className="absolute rounded-pill bg-black/40 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/80"
                        style={{
                            left: `${Math.max(12, (backgroundOverlay?.x ?? 0) + 12)}px`,
                            top: `${Math.max(12, (backgroundOverlay?.y ?? 0) + 12)}px`,
                        }}
                    >
                        Background
                    </div>
                </div>
            )}

            {/* Webcam layer hover hint - uses bounds from DOM query */}
            {hoveredLayer === 'webcam' && webcamOverlay && (
                <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                    <div
                        className="absolute bg-white/5 border border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                        style={{
                            left: `${webcamOverlay.x}px`,
                            top: `${webcamOverlay.y}px`,
                            width: `${webcamOverlay.width}px`,
                            height: `${webcamOverlay.height}px`,
                            borderRadius: webcamOverlay.borderRadius ?? '22px',
                        }}
                    />
                    <div
                        className="absolute rounded-pill bg-black/40 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/80"
                        style={{
                            left: `${Math.max(12, webcamOverlay.x + 8)}px`,
                            top: `${Math.max(12, webcamOverlay.y + 8)}px`,
                        }}
                    >
                        Webcam
                    </div>
                </div>
            )}

            {/* Subtitle layer hover hint */}
            {hoveredLayer === 'subtitle' && subtitleOverlay && canSelectSubtitle && (
                <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                    <div
                        className="absolute bg-white/5 border border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                        style={{
                            left: `${subtitleOverlay.x}px`,
                            top: `${subtitleOverlay.y}px`,
                            width: `${subtitleOverlay.width}px`,
                            height: `${subtitleOverlay.height}px`,
                            borderRadius: subtitleOverlay.borderRadius ?? '12px',
                        }}
                    />
                    <div
                        className="absolute rounded-pill bg-black/40 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/80"
                        style={{
                            left: `${Math.max(12, subtitleOverlay.x + 8)}px`,
                            top: `${Math.max(12, subtitleOverlay.y - 24)}px`,
                        }}
                    >
                        Subtitle
                    </div>
                </div>
            )}

            {/* Keystroke layer hover hint */}
            {hoveredLayer === 'keystroke' && keystrokeOverlay && canSelectKeystroke && (
                <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                    <div
                        className="absolute bg-white/5 border border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                        style={{
                            left: `${keystrokeOverlay.x}px`,
                            top: `${keystrokeOverlay.y}px`,
                            width: `${keystrokeOverlay.width}px`,
                            height: `${keystrokeOverlay.height}px`,
                            borderRadius: keystrokeOverlay.borderRadius ?? '8px',
                        }}
                    />
                    <div
                        className="absolute rounded-pill bg-black/40 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/80"
                        style={{
                            left: `${Math.max(12, keystrokeOverlay.x + 8)}px`,
                            top: `${Math.max(12, keystrokeOverlay.y - 24)}px`,
                        }}
                    >
                        Keystrokes
                    </div>
                </div>
            )}

            {/* Cursor layer hover hint - uses bounds from DOM query */}
            {hoveredLayer === 'cursor' && cursorOverlay && (
                <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                    {/* Subtle glow - minimal and refined */}
                    <div
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                            left: `${cursorOverlay.left + cursorOverlay.width * 0.45}px`,
                            top: `${cursorOverlay.top + cursorOverlay.height * 0.4}px`,
                        }}
                    >
                        {/* Single subtle glow */}
                        <div className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.06] blur-xl" />
                    </div>

                    {/* Label */}
                    <div
                        className="absolute rounded-full bg-black/50 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.15em] text-white/80"
                        style={{
                            left: `${Math.max(12, cursorOverlay.left + cursorOverlay.width * 0.75)}px`,
                            top: `${Math.max(12, cursorOverlay.top - 24)}px`,
                        }}
                    >
                        Cursor
                    </div>
                </div>
            )}

            {/* Annotation layer hover hint - uses bounds from DOM query */}
            {/* Hide when annotation is already selected (SelectionOverlay handles it) */}
            {hoveredLayer === 'annotation' && annotationOverlay &&
                annotationOverlay.id !== selectedAnnotationId && (
                    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                        <div
                            className="absolute rounded-md bg-white/5 border border-primary/40 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                            style={{
                                left: `${annotationOverlay.x}px`,
                                top: `${annotationOverlay.y}px`,
                                width: `${annotationOverlay.width}px`,
                                height: `${annotationOverlay.height}px`,
                            }}
                        />
                        <div
                            className="absolute rounded-pill bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/90 shadow-lg"
                            style={{
                                left: `${Math.max(12, annotationOverlay.x)}px`,
                                top: `${Math.max(12, annotationOverlay.y - 24)}px`,
                            }}
                        >
                            {getAnnotationLabel(annotationOverlay.type)}
                        </div>
                    </div>
                )}
            {/* Video layer hover hint */}
            {hoveredLayer === 'video' && videoOverlay && canSelectVideo && (
                <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                    {/* Border around the video content */}
                    <div
                        className="absolute bg-white/5 border border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                        style={{
                            left: `${videoOverlay.x}px`,
                            top: `${videoOverlay.y}px`,
                            width: `${videoOverlay.width}px`,
                            height: `${videoOverlay.height}px`,
                            borderRadius: videoOverlay.borderRadius ?? '12px',
                            clipPath: videoOverlay.clipPath || undefined,
                        }}
                    />
                    {/* Label */}
                    <div
                        className="absolute rounded-pill bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-white/90 shadow-lg"
                        style={{
                            left: `${Math.max(12, videoOverlay.x + 12)}px`,
                            top: `${Math.max(12, videoOverlay.y + 12)}px`,
                        }}
                    >
                        Video
                    </div>
                </div>
            )}
        </>
    );
};
