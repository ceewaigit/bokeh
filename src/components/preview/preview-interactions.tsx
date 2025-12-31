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
}: UsePreviewHoverOptions) {
    const [hoveredLayer, setHoveredLayer] = useState<PreviewHoverLayer>(null);
    const [cursorOverlay, setCursorOverlay] = useState<CursorOverlayData | null>(null);
    const [webcamOverlay, setWebcamOverlay] = useState<WebcamOverlayData | null>(null);

    const setHoverState = useCallback((
        nextLayer: PreviewHoverLayer,
        nextCursor: CursorOverlayData | null,
        nextWebcam: WebcamOverlayData | null
    ) => {
        setHoveredLayer((prev) => prev === nextLayer ? prev : nextLayer);
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
            setHoverState(null, null, null);
            return;
        }

        let nextLayer: PreviewHoverLayer = null;
        let nextCursor: CursorOverlayData | null = null;
        let nextWebcam: WebcamOverlayData | null = null;

        // Check cursor layer first (smallest, most specific target)
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

        setHoverState(nextLayer, nextCursor, nextWebcam);
    }, [
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        setHoverState,
        aspectContainerRef,
        playerContainerRef,
    ]);

    const handlePreviewLeave = useCallback(() => {
        setHoverState(null, null, null);
    }, [setHoverState]);

    return {
        hoveredLayer,
        cursorOverlay,
        webcamOverlay,
        handlePreviewHover,
        handlePreviewLeave,
    };
}


// ------------------------------------------------------------------
// Main Component: PreviewInteractions
// ------------------------------------------------------------------

interface PreviewInteractionsProps {
    project: Project;
    projectEffects: Effect[];
    timelineMetadata: { width: number; height: number; fps: number; };
    selectedEffectLayer: SelectedEffectLayer;
    isEditingCrop: boolean;
    zoomSettings?: ZoomSettings;
    previewFrameBounds: { width: number; height: number; };
    aspectContainerRef: React.RefObject<HTMLDivElement | null>;
    playerContainerRef: React.RefObject<HTMLDivElement | null>;
    children: React.ReactNode;
}

export const PreviewInteractions: React.FC<PreviewInteractionsProps> = ({
    project,
    projectEffects,
    timelineMetadata,
    selectedEffectLayer,
    isEditingCrop,
    zoomSettings,
    previewFrameBounds,
    aspectContainerRef,
    playerContainerRef,
    children,
}) => {
    const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer);
    const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen);
    const toggleProperties = useWorkspaceStore((s) => s.toggleProperties);

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
            <LayerHoverOverlays
                hoveredLayer={hoveredLayer}
                cursorOverlay={cursorOverlay}
                webcamOverlay={webcamOverlay}
                canSelectBackground={canSelectBackground}
                canSelectCursor={canSelectCursor}
                canSelectWebcam={canSelectWebcam}
                containerWidth={previewFrameBounds.width}
                containerHeight={previewFrameBounds.height}
            />
        </div>
    );
};
