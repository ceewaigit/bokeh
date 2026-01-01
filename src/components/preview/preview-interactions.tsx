import React, { useMemo, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/stores/project-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { EffectLayerType } from '@/types/effects';
import { EffectType, Project, Effect } from '@/types/project';
import { getBackgroundEffect, getCursorEffect } from '@/features/effects/effect-filters';
import { resolveEffectIdForType } from '@/features/effects/effect-selection';
import { LayerHoverOverlays, PreviewHoverLayer, CursorOverlayData, WebcamOverlayData } from './layer-hover-overlays';
import { WebcamOverlay } from './webcam-overlay';
import type { ZoomSettings } from '@/types/remotion';
import type { SelectedEffectLayer } from '@/types/effects';
import { AnnotationData, AnnotationType } from '@/types/project';
import { hitTestEffects, getEffectBounds } from '@/lib/canvas-editor/hit-testing';
import { AnnotationOverlayData } from './layer-hover-overlays';
import { VideoPositionProvider } from '@/remotion/context/layout/VideoPositionContext';
import { InteractionLayer } from '@/features/canvas-editor/InteractionLayer';
import { AnnotationEditProvider } from '@/features/canvas-editor/context/AnnotationEditContext';
import { PlayerRef } from '@remotion/player';
import { getZoomTransformString } from '@/remotion/compositions/utils/transforms/zoom-transform';
import { useEffect } from 'react';


// ------------------------------------------------------------------
// DOM-Based Hit Testing
// ------------------------------------------------------------------

/**
 * Check if a point is within a DOMRect with optional padding
 */
function isPointInRect(x: number, y: number, rect: DOMRect, padding = 0): boolean {
    return (
        x >= rect.left - padding &&
        x <= rect.right + padding &&
        y >= rect.top - padding &&
        y <= rect.bottom + padding
    );
}

/**
 * Convert DOMRect to container-relative coordinates for overlay display
 */
function rectToOverlayData(rect: DOMRect, containerRect: DOMRect): WebcamOverlayData {
    return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
    };
}

function rectToCursorOverlayData(rect: DOMRect, containerRect: DOMRect): CursorOverlayData {
    return {
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
        tipX: rect.left - containerRect.left + rect.width / 2,
        tipY: rect.top - containerRect.top + rect.height / 2,
        src: '', // Not needed for hover overlay
    };
}

// ------------------------------------------------------------------
// Internal Hook: usePreviewHover (DOM-based)
// ------------------------------------------------------------------

interface UsePreviewHoverOptions {
    project: Project | null;
    projectEffects: Effect[];
    canSelectBackground: boolean;
    canSelectCursor: boolean;
    canSelectWebcam: boolean;
    aspectContainerRef: React.RefObject<HTMLDivElement | null>;
    playerContainerRef: React.RefObject<HTMLDivElement | null>;
}

function usePreviewHover({
    canSelectBackground,
    canSelectCursor,
    canSelectWebcam,
    aspectContainerRef,
    playerContainerRef,
    project,
    projectEffects,
}: UsePreviewHoverOptions) {
    const [hoveredLayer, setHoveredLayer] = useState<PreviewHoverLayer>(null);
    const [cursorOverlay, setCursorOverlay] = useState<CursorOverlayData | null>(null);
    const [webcamOverlay, setWebcamOverlay] = useState<WebcamOverlayData | null>(null);
    const [annotationOverlay, setAnnotationOverlay] = useState<AnnotationOverlayData | null>(null);

    const setHoverState = useCallback((
        nextLayer: PreviewHoverLayer,
        nextCursor: CursorOverlayData | null,
        nextWebcam: WebcamOverlayData | null,
        nextAnnotation: AnnotationOverlayData | null
    ) => {
        setHoveredLayer((prev) => prev === nextLayer ? prev : nextLayer);
        setAnnotationOverlay((prev) => {
            if (!prev && !nextAnnotation) return prev;
            // Simple equality check for annotation overlay
            if (prev?.id === nextAnnotation?.id &&
                prev?.x === nextAnnotation?.x &&
                prev?.y === nextAnnotation?.y &&
                prev?.width === nextAnnotation?.width &&
                prev?.height === nextAnnotation?.height) {
                return prev;
            }
            return nextAnnotation;
        });
        setCursorOverlay((prev) => {
            if (!prev && !nextCursor) return prev;
            if (
                prev && nextCursor &&
                Math.abs(prev.left - nextCursor.left) < 0.5 &&
                Math.abs(prev.top - nextCursor.top) < 0.5 &&
                Math.abs(prev.width - nextCursor.width) < 0.5 &&
                Math.abs(prev.height - nextCursor.height) < 0.5
            ) {
                return prev;
            }
            return nextCursor;
        });
        setWebcamOverlay((prev) => {
            if (!prev && !nextWebcam) return prev;
            if (
                prev && nextWebcam &&
                Math.abs(prev.x - nextWebcam.x) < 0.5 &&
                Math.abs(prev.y - nextWebcam.y) < 0.5 &&
                Math.abs(prev.width - nextWebcam.width) < 0.5 &&
                Math.abs(prev.height - nextWebcam.height) < 0.5
            ) {
                return prev;
            }
            return nextWebcam;
        });
    }, []);

    /**
     * DOM-based hit testing - queries actual rendered elements
     * Transform-agnostic: CSS transforms are already applied, bounds reflect actual screen position
     */
    const handlePreviewHover = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const aspectContainer = aspectContainerRef.current;
        const playerContainer = playerContainerRef.current;
        if (!aspectContainer || !playerContainer) return;
        if (!canSelectBackground && !canSelectCursor && !canSelectWebcam) return;

        const containerRect = aspectContainer.getBoundingClientRect();
        const { clientX, clientY } = event;

        // Bounds check
        if (!isPointInRect(clientX, clientY, containerRect)) {
            setHoverState(null, null, null, null);
            return;
        }

        let nextLayer: PreviewHoverLayer = null;
        let nextCursor: CursorOverlayData | null = null;
        let nextWebcam: WebcamOverlayData | null = null;
        let nextAnnotation: AnnotationOverlayData | null = null;

        const playerRect = playerContainer.getBoundingClientRect();

        // Calculate mouse position relative to player container
        const mouseX = clientX - playerRect.left;
        const mouseY = clientY - playerRect.top;

        const videoRect = {
            width: playerRect.width,
            height: playerRect.height,
            x: 0, // Relative to container
            y: 0, // Relative to container
            left: 0,
            top: 0
        };

        // 1. Check for Annotation Hover (Hit-test based)
        // Check annotation hover if project exists. We allow this even if canSelectAnnotation is controlled elsewhere, 
        // as hover hints are useful.
        if (project && projectEffects.length > 0) {
            const hit = hitTestEffects(
                mouseX,
                mouseY,
                projectEffects.filter(e => e.type === EffectType.Annotation),
                videoRect
            );

            if (hit && hit.effectId) {
                const effect = projectEffects.find(e => e.id === hit.effectId);
                if (effect) {
                    const bounds = getEffectBounds(effect, videoRect);
                    if (bounds) {
                        nextLayer = 'annotation';
                        nextAnnotation = {
                            id: effect.id,
                            x: bounds.x,
                            y: bounds.y,
                            width: bounds.width,
                            height: bounds.height,
                            type: (effect.data as AnnotationData).type ?? AnnotationType.Text
                        };
                        // Return early if annotation is hit (priority)
                        setHoverState(nextLayer, null, null, nextAnnotation);
                        return;
                    }
                }
            }
        }

        // 2. Check for Webcam Hover (DOM-based)
        if (canSelectWebcam) {
            const webcamEl = playerContainer.querySelector('[data-effect-type="webcam"]');
            if (webcamEl) {
                const rect = webcamEl.getBoundingClientRect();
                // Use a slightly larger hit area for easier selection
                if (isPointInRect(clientX, clientY, rect, 0)) {
                    nextLayer = 'webcam';
                    setHoverState(nextLayer, null, nextWebcam, null);
                    return;
                }
            }
        }

        // 3. Check for Cursor Hover (DOM-based)
        // Query the actual rendered cursor element
        if (canSelectCursor) {
            const cursorEl = playerContainer.querySelector('[data-cursor-layer="true"]');
            if (cursorEl) {
                const cursorRect = cursorEl.getBoundingClientRect();
                // Add padding for easier targeting of small cursor
                if (isPointInRect(clientX, clientY, cursorRect, 8)) {
                    nextLayer = 'cursor';
                    nextCursor = rectToCursorOverlayData(cursorRect, containerRect);
                }
            }
        }

        // Check webcam layer (queries the actual rendered webcam container)
        if (!nextLayer && canSelectWebcam) {
            const webcamEl = playerContainer.querySelector('[data-webcam-overlay="true"]');
            if (webcamEl) {
                const webcamRect = webcamEl.getBoundingClientRect();
                if (isPointInRect(clientX, clientY, webcamRect, 0)) {
                    nextLayer = 'webcam';
                    nextWebcam = rectToOverlayData(webcamRect, containerRect);
                }
            }
        }

        // Fallback to background
        if (!nextLayer && canSelectBackground) {
            nextLayer = 'background';
        }

        setHoverState(nextLayer, nextCursor, nextWebcam, null);
    }, [
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        setHoverState,
        aspectContainerRef,
        playerContainerRef,
    ]);

    const handlePreviewLeave = useCallback(() => {
        setHoverState(null, null, null, null);
    }, [setHoverState]);

    return {
        hoveredLayer,
        cursorOverlay,
        webcamOverlay,
        annotationOverlay,
        handlePreviewHover,
        handlePreviewLeave,
    };
}


import type { TimelineMetadata } from '@/hooks/timeline/use-timeline-metadata';

// ------------------------------------------------------------------
// Main Component: PreviewInteractions
// ------------------------------------------------------------------

interface PreviewInteractionsProps {
    project: Project;
    projectEffects: Effect[];
    timelineMetadata: TimelineMetadata;
    selectedEffectLayer: SelectedEffectLayer;
    isEditingCrop: boolean;
    /** Hide selection/interaction controls during playback */
    isPlaying: boolean;
    zoomSettings?: ZoomSettings;
    previewFrameBounds: { width: number; height: number; };
    aspectContainerRef: React.RefObject<HTMLDivElement | null>;
    playerContainerRef: React.RefObject<HTMLDivElement | null>;
    playerRef: React.RefObject<PlayerRef | null>;
    children: React.ReactNode;
}

export const PreviewInteractions: React.FC<PreviewInteractionsProps> = ({
    project,
    projectEffects,
    timelineMetadata,
    selectedEffectLayer,
    isEditingCrop,
    isPlaying,
    zoomSettings,
    previewFrameBounds,
    aspectContainerRef,
    playerContainerRef,
    playerRef,
    children,
}) => {
    const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer);
    const clearEffectSelection = useProjectStore((s) => s.clearEffectSelection);
    const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen);
    const toggleProperties = useWorkspaceStore((s) => s.toggleProperties);

    // Sync current frame from player for annotation filtering and camera calculation
    const [currentFrame, setCurrentFrame] = useState(0);
    // Track annotation inline editing for camera override
    const [isAnnotationEditing, setIsAnnotationEditing] = useState(false);

    useEffect(() => {
        const player = playerRef?.current;
        if (!player) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onFrame = (e: { detail: { frame: number } }) => setCurrentFrame(e.detail.frame);
        player.addEventListener('frameupdate', onFrame);
        setCurrentFrame(player.getCurrentFrame());
        return () => player.removeEventListener('frameupdate', onFrame);
    }, [playerRef]);

    // Deselect annotation when playback starts
    useEffect(() => {
        if (isPlaying) {
            clearEffectSelection();
        }
    }, [isPlaying, clearEffectSelection]);

    // Subscribe to camera cache (SSOT)
    const cameraPathCache = useProjectStore((s) => s.cameraPathCache);

    const { zoomTransform, transformString } = useMemo(() => {
        // 0. Annotation Inline Editing Override - force 1x while editing
        // This is checked FIRST for highest priority
        if (isAnnotationEditing) {
            return {
                zoomTransform: { scale: 1, panX: 0, panY: 0, scaleCompensationX: 0, scaleCompensationY: 0, refocusBlur: 0 },
                transformString: 'translate3d(0px, 0px, 0) scale3d(1, 1, 1)'
            };
        }

        // 1. Manual Zoom Editing (Override)
        if (zoomSettings?.isEditing && zoomSettings.zoomData) {
            const s = zoomSettings.zoomData.scale;
            // Simplified center-based zoom for editing preview
            // We can use 0.5 as center or use the actual zoom target if we want to be precise.
            // For now, center-based is safer for preview stability.
            const panX = (0.5 - 0.5) * timelineMetadata.width * (s - 1);
            const panY = (0.5 - 0.5) * timelineMetadata.height * (s - 1); // = 0

            const transform = {
                scale: s,
                panX: 0,
                panY: 0,
                scaleCompensationX: 0,
                scaleCompensationY: 0,
                refocusBlur: 0
            };
            return {
                zoomTransform: transform,
                transformString: getZoomTransformString(transform)
            };
        }

        // 2. Cached Camera Path (Primary SSOT)
        if (cameraPathCache) {
            // Safe lookup for current frame
            const safeFrame = Math.max(0, Math.floor(currentFrame));
            const frameData = safeFrame < cameraPathCache.length
                ? cameraPathCache[safeFrame]
                : cameraPathCache[cameraPathCache.length - 1];

            if (frameData) {
                return {
                    zoomTransform: frameData.zoomTransform,
                    transformString: frameData.zoomTransformStr
                };
            }
        }

        // 3. Fallback (Identity)
        return {
            zoomTransform: { scale: 1, panX: 0, panY: 0, scaleCompensationX: 0, scaleCompensationY: 0, refocusBlur: 0 },
            transformString: 'translate3d(0px, 0px, 0) scale3d(1, 1, 1)'
        };
    }, [isAnnotationEditing, cameraPathCache, currentFrame, zoomSettings, timelineMetadata]);

    const backgroundEffectId = useMemo(() => {
        return getBackgroundEffect(projectEffects)?.id ?? null;
    }, [projectEffects]);

    const cursorEffectId = useMemo(() => {
        const effect = getCursorEffect(projectEffects);
        return effect && effect.enabled !== false ? effect.id : null;
    }, [projectEffects]);

    const webcamEffectId = useMemo(() => {
        const resolvedId = resolveEffectIdForType(projectEffects, selectedEffectLayer, EffectType.Webcam);
        if (!resolvedId) return null;
        const effect = projectEffects.find(item => item.id === resolvedId);
        return effect && effect.enabled !== false ? effect.id : null;
    }, [projectEffects, selectedEffectLayer]);

    const isWebcamSelected = Boolean(
        webcamEffectId &&
        selectedEffectLayer?.type === EffectLayerType.Webcam &&
        selectedEffectLayer?.id === webcamEffectId
    );

    const canSelectBackground = Boolean(backgroundEffectId) && !isEditingCrop && !zoomSettings?.isEditing;
    const canSelectCursor = Boolean(cursorEffectId) && !isEditingCrop && !zoomSettings?.isEditing;
    const canSelectWebcam = Boolean(webcamEffectId) && !isEditingCrop && !zoomSettings?.isEditing;

    const {
        hoveredLayer,
        cursorOverlay,
        webcamOverlay,
        annotationOverlay,
        handlePreviewHover,
        handlePreviewLeave,
    } = usePreviewHover({
        project,
        projectEffects,
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        aspectContainerRef,
        playerContainerRef,
    });

    const handleLayerSelect = useCallback((event: React.MouseEvent) => {
        if (event.defaultPrevented) return;
        const layer = hoveredLayer;
        if (!layer) return;

        let layerName = '';
        if (layer === 'background' && canSelectBackground && backgroundEffectId) {
            selectEffectLayer(EffectLayerType.Background, backgroundEffectId);
            layerName = 'Background';
        } else if (layer === 'cursor' && canSelectCursor && cursorEffectId) {
            selectEffectLayer(EffectLayerType.Cursor, cursorEffectId);
            layerName = 'Cursor';
        } else if (layer === 'webcam' && canSelectWebcam && webcamEffectId) {
            selectEffectLayer(EffectLayerType.Webcam, webcamEffectId);
            layerName = 'Webcam';
        } else if (layer === 'annotation' && annotationOverlay) {
            selectEffectLayer(EffectLayerType.Annotation, annotationOverlay.id);
            layerName = 'Annotation';
        } else {
            return;
        }

        if (!isPropertiesOpen) {
            toggleProperties();
        }

        toast.success(`Viewing ${layerName} settings`);
    }, [
        hoveredLayer,
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        backgroundEffectId,
        cursorEffectId,
        webcamEffectId,
        selectEffectLayer,
        isPropertiesOpen,
        toggleProperties,
    ]);

    const handleWebcamOverlaySelect = useCallback(() => {
        if (!webcamEffectId) return;
        selectEffectLayer(EffectLayerType.Webcam, webcamEffectId);
        if (!isPropertiesOpen) {
            toggleProperties();
        }
        toast.success('Viewing Webcam settings');
    }, [selectEffectLayer, webcamEffectId, isPropertiesOpen, toggleProperties]);

    return (
        <div
            ref={aspectContainerRef}
            className={`relative w-full h-full group/preview${(canSelectBackground || canSelectCursor || canSelectWebcam) ? ' cursor-pointer' : ''}`}
            style={{
                aspectRatio: `${timelineMetadata.width} / ${timelineMetadata.height}`,
            }}
            onClick={handleLayerSelect}
            onMouseMove={handlePreviewHover}
            onMouseLeave={handlePreviewLeave}
        >
            {children}

            {/* Webcam Overlay - now purely for selection affordance, not hit-testing */}
            {project && webcamEffectId && (
                <WebcamOverlay
                    effects={projectEffects}
                    containerWidth={previewFrameBounds.width}
                    containerHeight={previewFrameBounds.height}
                    isSelected={isWebcamSelected}
                    onSelect={handleWebcamOverlaySelect}
                    playerContainerRef={playerContainerRef}
                />
            )}

            {/* Layer Hover Overlays - receives bounds from DOM queries */}
            {/* Note: Annotation hover is handled by OverlayEditor separately */}
            <LayerHoverOverlays
                hoveredLayer={hoveredLayer}
                cursorOverlay={cursorOverlay}
                webcamOverlay={webcamOverlay}
                annotationOverlay={annotationOverlay}
                canSelectBackground={canSelectBackground}
                canSelectCursor={canSelectCursor}
                canSelectWebcam={canSelectWebcam}
                canSelectAnnotation={true}
                containerWidth={previewFrameBounds.width}
                containerHeight={previewFrameBounds.height}
            />

            {/* 
              Decoupled Editor Layer:
              Renders dragging interaction handles and selection box ON TOP of the player.
              We provide VideoPositionContext here so OverlayEditor can calculate relative positions correctly.
              Since we are outside the player transform, we must ensure previewFrameBounds matches the video rect 
              (which it does in current implementation where player fills container).
            */}
            <VideoPositionProvider value={{
                offsetX: 0,
                offsetY: 0,
                drawWidth: previewFrameBounds.width,
                drawHeight: previewFrameBounds.height,
                zoomTransform: zoomTransform,
                contentTransform: transformString,
                padding: 0,
                videoWidth: timelineMetadata.width,
                videoHeight: timelineMetadata.height
            }}>
                <AnnotationEditProvider onInlineEditingChange={setIsAnnotationEditing}>
                    {/* Hide InteractionLayer during playback - only show when paused */}
                    {(!isPlaying && !zoomSettings?.isEditing && !isEditingCrop) && (
                        <InteractionLayer
                            project={project}
                            effects={projectEffects}
                            timelineMetadata={timelineMetadata}
                            currentTimeMs={project.timeline.duration ? (currentFrame / timelineMetadata.fps) * 1000 : 0}
                        />
                    )}
                </AnnotationEditProvider>
            </VideoPositionProvider>
        </div>
    );
};
