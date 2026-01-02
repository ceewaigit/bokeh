import { useState, useCallback, useMemo } from 'react';
import type { Project, Effect, Recording } from '@/types/project';
import { EffectType, AnnotationType, AnnotationData, CursorEffectData } from '@/types/project';
import { getCursorEffect } from '@/features/effects/core/filters';
import type { PreviewHoverLayer, CursorOverlayData, WebcamOverlayData, AnnotationOverlayData } from '@/features/editor/components/preview/layer-hover-overlays';
import { hitTestPreviewLayer, type EffectBounds, getEffectLayout, getCameraTransformFromSnapshot } from '@/features/editor/logic/hit-testing';
import { getWebcamLayout } from '@/features/effects/utils/webcam-layout';
import type { FrameSnapshot } from '@/features/renderer/engine/layout-engine';
import { calculateCursorState, type CursorState } from '@/features/cursor/logic/cursor-logic';
import { useRecordingMetadata } from '@/features/renderer/hooks/media/useRecordingMetadata';
import type { TimelineMetadata } from '@/features/timeline/hooks/use-timeline-metadata';

/**
 * Transform video-space bounds to screen-space bounds accounting for camera zoom/pan
 * This is needed because the LayerHoverOverlays render OUTSIDE the transform container
 */
function transformBoundsToScreen(
    bounds: EffectBounds,
    snapshot: FrameSnapshot,
    cameraTransform: { scale: number; panX: number; panY: number } | null
): EffectBounds {
    if (!cameraTransform || cameraTransform.scale === 1) {
        return bounds;
    }

    const { scale, panX, panY } = cameraTransform;
    const centerX = snapshot.layout.offsetX + snapshot.layout.drawWidth / 2;
    const centerY = snapshot.layout.offsetY + snapshot.layout.drawHeight / 2;

    // Transform the bounding box corners to screen space
    const x1 = centerX + (bounds.x - centerX) * scale + panX;
    const y1 = centerY + (bounds.y - centerY) * scale + panY;
    const x2 = centerX + (bounds.x + bounds.width - centerX) * scale + panX;
    const y2 = centerY + (bounds.y + bounds.height - centerY) * scale + panY;

    return {
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
        rotation: bounds.rotation,
        centerX: bounds.centerX ? centerX + (bounds.centerX - centerX) * scale + panX : undefined,
        centerY: bounds.centerY ? centerY + (bounds.centerY - centerY) * scale + panY : undefined,
    };
}

interface HelperClipData {
    recording: Recording | null;
    sourceTimeMs: number;
}

interface UsePreviewHoverOptions {
    project: Project | null;
    projectEffects: Effect[];
    canSelectBackground: boolean;
    canSelectCursor: boolean;
    canSelectWebcam: boolean;
    aspectContainerRef: React.RefObject<HTMLDivElement | null>;
    snapshot: FrameSnapshot;
    timelineMetadata: TimelineMetadata;
    activeClipData: HelperClipData | null;
    // Using any for the value types to avoid circular dependencies or complex type imports for now
    metadataUrls?: Record<string, any>;
}

export function usePreviewHover({
    canSelectBackground,
    canSelectCursor,
    canSelectWebcam,
    aspectContainerRef,
    project,
    projectEffects,
    snapshot,
    timelineMetadata,
    activeClipData,
    metadataUrls
}: UsePreviewHoverOptions) {
    const [hoveredLayer, setHoveredLayer] = useState<PreviewHoverLayer>(null);
    const [cursorOverlay, setCursorOverlay] = useState<CursorOverlayData | null>(null);
    const [webcamOverlay, setWebcamOverlay] = useState<WebcamOverlayData | null>(null);
    const [annotationOverlay, setAnnotationOverlay] = useState<AnnotationOverlayData | null>(null);

    // ------------------------------------------------------------------
    // Cursor State Calculation (Data-Driven)
    // ------------------------------------------------------------------
    const activeRecording = activeClipData?.recording ?? null;
    const recordingId = activeRecording?.id ?? '';
    const currentSourceTime = activeClipData?.sourceTimeMs ?? 0;

    // Load metadata for the active clip to calculate cursor position
    // Ensure we have enough data to load metadata, otherwise skip to prevent errors
    const canLoadMetadata = activeRecording && (
        !!activeRecording.metadata ||
        (!!activeRecording.folderPath && !!activeRecording.metadataChunks)
    );

    const targetRecordingId = (canLoadMetadata && activeRecording) ? activeRecording.id : '';

    const { metadata: cursorMetadata } = useRecordingMetadata({
        recordingId: targetRecordingId,
        folderPath: activeRecording?.folderPath,
        metadataChunks: activeRecording?.metadataChunks,
        metadataUrls,
        inlineMetadata: activeRecording?.metadata,
    });

    const cursorState = useMemo(() => {
        if (!activeRecording || !canSelectCursor) return null;

        const mouseEvents = cursorMetadata?.mouseEvents ?? activeRecording.metadata?.mouseEvents;
        if (!mouseEvents || mouseEvents.length === 0) return null;

        const cursorEffect = getCursorEffect(projectEffects);

        return calculateCursorState(
            cursorEffect?.data as CursorEffectData | undefined,
            mouseEvents,
            [], // Click events not needed for hit box?
            currentSourceTime,
            30 // FPS approximate
        );
    }, [activeRecording, canSelectCursor, cursorMetadata, projectEffects, currentSourceTime]);

    // ------------------------------------------------------------------
    // Hover State Setter
    // ------------------------------------------------------------------
    const setHoverState = useCallback((
        nextLayer: PreviewHoverLayer,
        nextCursor: CursorOverlayData | null,
        nextWebcam: WebcamOverlayData | null,
        nextAnnotation: AnnotationOverlayData | null
    ) => {
        setHoveredLayer((prev) => prev === nextLayer ? prev : nextLayer);

        setAnnotationOverlay((prev) => {
            if (!prev && !nextAnnotation) return prev;
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

    // ------------------------------------------------------------------
    // Main Hit Handler
    // ------------------------------------------------------------------
    const handlePreviewHover = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const aspectContainer = aspectContainerRef.current;
        if (!aspectContainer) return;

        if (!canSelectBackground && !canSelectCursor && !canSelectWebcam && projectEffects.length === 0) return;

        const containerRect = aspectContainer.getBoundingClientRect();
        const { clientX, clientY } = event;

        // Container-relative mouse position
        const containerX = clientX - containerRect.left;
        const containerY = clientY - containerRect.top;

        // Basic bounds check
        if (
            containerX < 0 || containerX > containerRect.width ||
            containerY < 0 || containerY > containerRect.height
        ) {
            setHoverState(null, null, null, null);
            return;
        }

        const mouseX = containerX;
        const mouseY = containerY;

        // Prepare cursor rect for hit testing if cursor is active
        let cursorRect: EffectBounds | null = null;
        if (canSelectCursor && cursorState && activeRecording) {
            const firstEvent = cursorMetadata?.mouseEvents?.[0] ?? activeRecording.metadata?.mouseEvents?.[0];
            const captureWidth = firstEvent?.captureWidth ?? 1920;
            const captureHeight = firstEvent?.captureHeight ?? 1080;

            const normalizedX = cursorState.x / captureWidth;
            const normalizedY = cursorState.y / captureHeight;

            // Map to current video drawing dimensions
            const drawWidth = snapshot.layout.drawWidth;
            const drawHeight = snapshot.layout.drawHeight;

            // Cursor position in video rect:
            const cursorX = snapshot.layout.offsetX + (normalizedX * drawWidth);
            const cursorY = snapshot.layout.offsetY + (normalizedY * drawHeight);

            // Cursor Size
            const baseSize = 32; // Approx handle size
            const size = baseSize * cursorState.scale;

            cursorRect = {
                x: cursorX - size / 2,
                y: cursorY - size / 2,
                width: size,
                height: size,
                rotation: 0
            };
        }

        const hit = hitTestPreviewLayer(
            mouseX,
            mouseY,
            projectEffects,
            snapshot,
            {
                cursorRect,
                canSelectBackground
            }
        );

        if (!hit) {
            // Fallback to background if allowed
            if (canSelectBackground) {
                setHoverState('background', null, null, null);
            } else {
                setHoverState(null, null, null, null);
            }
            return;
        }

        // Map hit result to overlays
        let nextLayer: PreviewHoverLayer = null;
        let nextCursor: CursorOverlayData | null = null;
        let nextWebcam: WebcamOverlayData | null = null;
        let nextAnnotation: AnnotationOverlayData | null = null;

        // Get camera transform for overlay position transformation
        const cameraTransform = getCameraTransformFromSnapshot(snapshot);

        switch (hit.effectType) {
            case EffectType.Annotation: {
                const effect = projectEffects.find(e => e.id === hit.effectId);
                if (effect) {
                    const videoBounds = getEffectLayout(effect, snapshot);
                    if (videoBounds) {
                        // Transform bounds to screen space for overlay rendering
                        const screenBounds = transformBoundsToScreen(videoBounds, snapshot, cameraTransform);
                        nextLayer = 'annotation';
                        nextAnnotation = {
                            id: effect.id,
                            type: (effect.data as AnnotationData).type ?? AnnotationType.Text,
                            x: screenBounds.x,
                            y: screenBounds.y,
                            width: screenBounds.width,
                            height: screenBounds.height
                        };
                    }
                }
                break;
            }
            case EffectType.Webcam: {
                const webcamEffect = projectEffects.find(e => e.id === hit.effectId);
                if (webcamEffect) {
                    const layout = getWebcamLayout(
                        webcamEffect.data as any,
                        snapshot.layout.drawWidth,
                        snapshot.layout.drawHeight
                    );

                    // Transform webcam bounds to screen space
                    const videoBounds: EffectBounds = {
                        x: snapshot.layout.offsetX + layout.x,
                        y: snapshot.layout.offsetY + layout.y,
                        width: layout.size,
                        height: layout.size
                    };
                    const screenBounds = transformBoundsToScreen(videoBounds, snapshot, cameraTransform);

                    nextLayer = 'webcam';
                    nextWebcam = {
                        x: screenBounds.x,
                        y: screenBounds.y,
                        width: screenBounds.width,
                        height: screenBounds.height
                    };
                }
                break;
            }
            case 'cursor': {
                if (cursorRect) {
                    // Transform cursor bounds to screen space
                    const screenBounds = transformBoundsToScreen(cursorRect, snapshot, cameraTransform);
                    nextLayer = 'cursor';
                    nextCursor = {
                        left: screenBounds.x,
                        top: screenBounds.y,
                        width: screenBounds.width,
                        height: screenBounds.height,
                        tipX: screenBounds.x + screenBounds.width / 2,
                        tipY: screenBounds.y + screenBounds.height / 2,
                        src: ''
                    };
                }
                break;
            }
        }

        setHoverState(nextLayer, nextCursor, nextWebcam, nextAnnotation);

    }, [aspectContainerRef, canSelectBackground, canSelectCursor, canSelectWebcam, projectEffects, snapshot, cursorState, activeRecording, cursorMetadata, setHoverState]);

    return {
        hoveredLayer,
        cursorOverlay,
        webcamOverlay,
        annotationOverlay,
        handlePreviewHover,
        handlePreviewLeave: useCallback(() => setHoverState(null, null, null, null), [setHoverState])
    };
}
