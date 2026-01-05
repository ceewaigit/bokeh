import { useState, useCallback } from 'react';
import type { Project, Effect, Recording } from '@/types/project';
import { AnnotationType } from '@/types/project';
import type { PreviewHoverLayer, CursorOverlayData, WebcamOverlayData, AnnotationOverlayData, VideoOverlayData, SubtitleOverlayData, KeystrokeOverlayData } from '@/features/ui/editor/components/preview/layer-hover-overlays';
import type { FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine';
import type { TimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata';
import { hitTestAnnotationsFromPoint } from '@/features/ui/editor/logic/dom-hit-testing';
import { getVideoRectFromSnapshot, getCameraTransformFromSnapshot } from '@/features/ui/editor/logic/hit-testing'; // Import helper
import { getWebcamLayout } from '@/features/effects/utils/webcam-layout';
import { applyCameraTransformToPixelRect } from '@/features/rendering/canvas/math/coordinates';
import type { WebcamLayoutData, Clip } from '@/types/project';
import { DEFAULT_WEBCAM_DATA } from '@/features/media/webcam/config';

function intersectRects(a: DOMRect, b: DOMRect) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    return { left, top, width, height };
}

interface HelperClipData {
    recording: Recording | null;
    sourceTimeMs: number;
}

interface UsePreviewHoverOptions {
    project: Project | null;
    projectEffects: Effect[];
    webcamClip?: Clip | null;
    canSelectBackground: boolean;
    canSelectCursor: boolean;
    canSelectWebcam: boolean;
    canSelectVideo?: boolean;
    aspectContainerRef: React.RefObject<HTMLDivElement | null>;
    playerContainerRef?: React.RefObject<HTMLDivElement | null>;
    snapshot: FrameSnapshot;
    timelineMetadata: TimelineMetadata;
    activeClipData: HelperClipData | null;
    // Using any for the value types to avoid circular dependencies or complex type imports for now
    metadataUrls?: Record<string, any>;
}

function getWebcamBorderRadius(data: WebcamLayoutData): string {
    switch (data.shape) {
        case 'circle':
            return '50%';
        case 'rectangle':
            return '0px';
        case 'rounded-rect':
        case 'squircle':
        default:
            return `${data.cornerRadius ?? 0}px`;
    }
}

function getOverlayFromElement(element: HTMLElement, containerRect: DOMRect) {
    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);
    const clipPath = computed.clipPath && computed.clipPath !== 'none' ? computed.clipPath : undefined;
    return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: computed.borderRadius,
        clipPath
    };
}

export function usePreviewHover({
    canSelectBackground,
    canSelectCursor,
    canSelectWebcam,
    canSelectVideo = false,
    aspectContainerRef,
    playerContainerRef,
    projectEffects,
    webcamClip,
    snapshot,
    activeClipData: _activeClipData,
    metadataUrls: _metadataUrls,
}: UsePreviewHoverOptions) {
    const [hoveredLayer, setHoveredLayer] = useState<PreviewHoverLayer>(null);
    const [cursorOverlay, setCursorOverlay] = useState<CursorOverlayData | null>(null);
    const [webcamOverlay, setWebcamOverlay] = useState<WebcamOverlayData | null>(null);
    const [annotationOverlay, setAnnotationOverlay] = useState<AnnotationOverlayData | null>(null);
    const [videoOverlay, setVideoOverlay] = useState<VideoOverlayData | null>(null);
    const [backgroundOverlay, setBackgroundOverlay] = useState<VideoOverlayData | null>(null);
    const [subtitleOverlay, setSubtitleOverlay] = useState<SubtitleOverlayData | null>(null);
    const [keystrokeOverlay, setKeystrokeOverlay] = useState<KeystrokeOverlayData | null>(null);

    // ------------------------------------------------------------------
    // Hover State Setter
    // ------------------------------------------------------------------
    const setHoverState = useCallback((
        nextLayer: PreviewHoverLayer,
        nextCursor: CursorOverlayData | null,
        nextWebcam: WebcamOverlayData | null,
        nextAnnotation: AnnotationOverlayData | null,
        nextVideo: VideoOverlayData | null,
        nextBackground: VideoOverlayData | null,
        nextSubtitle: SubtitleOverlayData | null = null,
        nextKeystroke: KeystrokeOverlayData | null = null
    ) => {
        setHoveredLayer((prev) => prev === nextLayer ? prev : nextLayer);

        setSubtitleOverlay((prev) => {
            if (!prev && !nextSubtitle) return prev;
            if (prev?.id === nextSubtitle?.id &&
                prev?.x === nextSubtitle?.x &&
                prev?.y === nextSubtitle?.y &&
                prev?.width === nextSubtitle?.width &&
                prev?.height === nextSubtitle?.height) {
                return prev;
            }
            return nextSubtitle;
        });

        setKeystrokeOverlay((prev) => {
            if (!prev && !nextKeystroke) return prev;
            if (prev?.id === nextKeystroke?.id &&
                prev?.x === nextKeystroke?.x &&
                prev?.y === nextKeystroke?.y &&
                prev?.width === nextKeystroke?.width &&
                prev?.height === nextKeystroke?.height) {
                return prev;
            }
            return nextKeystroke;
        });

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
                Math.abs(prev.height - nextWebcam.height) < 0.5 &&
                prev.borderRadius === nextWebcam.borderRadius
            ) {
                return prev;
            }
            return nextWebcam;
        });

        setVideoOverlay((prev) => {
            if (!prev && !nextVideo) return prev;
            if (
                prev && nextVideo &&
                Math.abs(prev.x - nextVideo.x) < 0.5 &&
                Math.abs(prev.y - nextVideo.y) < 0.5 &&
                Math.abs(prev.width - nextVideo.width) < 0.5 &&
                Math.abs(prev.height - nextVideo.height) < 0.5 &&
                prev.borderRadius === nextVideo.borderRadius &&
                prev.clipPath === nextVideo.clipPath
            ) {
                return prev;
            }
            return nextVideo;
        });

        setBackgroundOverlay((prev) => {
            if (!prev && !nextBackground) return prev;
            if (
                prev && nextBackground &&
                Math.abs(prev.x - nextBackground.x) < 0.5 &&
                Math.abs(prev.y - nextBackground.y) < 0.5 &&
                Math.abs(prev.width - nextBackground.width) < 0.5 &&
                Math.abs(prev.height - nextBackground.height) < 0.5
            ) {
                return prev;
            }
            return nextBackground;
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
            setHoverState(null, null, null, null, null, null);
            return;
        }

        // ------------------------------------------------------------------
        // DOM-driven hover hit testing (SSOT: what the user actually sees)
        // Priority: webcam > annotation > cursor > background
        // ------------------------------------------------------------------

        const videoEl = snapshot.mockup.enabled
            ? playerContainerRef?.current?.querySelector<HTMLElement>('[data-video-content-container="true"]')
            : playerContainerRef?.current?.querySelector<HTMLElement>('[data-video-transform-container="true"]');
        const domVideoRect = videoEl ? getOverlayFromElement(videoEl, containerRect) : null;

        // Snapshot fallback (used when DOM element isn't available).
        const cameraTransform = getCameraTransformFromSnapshot(snapshot);
        const videoRect = getVideoRectFromSnapshot(snapshot);
        const getTransformedRect = (rect: { x: number, y: number, width: number, height: number }) => {
            if (!cameraTransform) return rect;
            return applyCameraTransformToPixelRect(rect, videoRect, cameraTransform);
        };
        const transformedVideoRect = getTransformedRect({
            x: videoRect.x,
            y: videoRect.y,
            width: videoRect.width,
            height: videoRect.height
        });
        const videoRectForHover = domVideoRect ?? transformedVideoRect;

        // 1) Webcam (Logic-based hit testing to support IFrame player)
        if (canSelectWebcam && webcamClip) {
            const webcamData = webcamClip.layout ?? DEFAULT_WEBCAM_DATA;
            const webcamEl = playerContainerRef?.current?.querySelector<HTMLElement>('[data-webcam-overlay="true"]');

            if (webcamEl) {
                // Use DOM element bounds for hit testing
                const webcamOverlay = getOverlayFromElement(webcamEl, containerRect);
                const isInsideWebcamEl = (
                    containerX >= webcamOverlay.x &&
                    containerX <= webcamOverlay.x + webcamOverlay.width &&
                    containerY >= webcamOverlay.y &&
                    containerY <= webcamOverlay.y + webcamOverlay.height
                );

                if (isInsideWebcamEl) {
                    setHoverState('webcam', null, webcamOverlay, null, null, null);
                    return;
                }
            } else {
                // Fallback: compute layout relative to the rendered player bounds when DOM element not found
                const playerRect = playerContainerRef?.current?.getBoundingClientRect() ?? containerRect;
                const layout = getWebcamLayout(webcamData, playerRect.width, playerRect.height);
                const webcamRect = {
                    x: (playerRect.left - containerRect.left) + layout.x,
                    y: (playerRect.top - containerRect.top) + layout.y,
                    width: layout.size,
                    height: layout.size
                };

                const isInsideWebcamFallback = (
                    containerX >= webcamRect.x &&
                    containerX <= webcamRect.x + webcamRect.width &&
                    containerY >= webcamRect.y &&
                    containerY <= webcamRect.y + webcamRect.height
                );

                if (isInsideWebcamFallback) {
                    setHoverState('webcam', null, {
                        x: webcamRect.x,
                        y: webcamRect.y,
                        width: webcamRect.width,
                        height: webcamRect.height,
                        borderRadius: getWebcamBorderRadius(webcamData)
                    }, null, null, null);
                    return;
                }
            }
        }

        // 1.5) Subtitles
        const subtitleEl = playerContainerRef?.current?.querySelector<HTMLElement>('[data-subtitle-layer="true"]');
        if (subtitleEl) {
            const overlay = getOverlayFromElement(subtitleEl, containerRect);
            const isInside = (
                containerX >= overlay.x &&
                containerX <= overlay.x + overlay.width &&
                containerY >= overlay.y &&
                containerY <= overlay.y + overlay.height
            );

            if (isInside) {
                setHoverState('subtitle', null, null, null, null, null, {
                    id: subtitleEl.dataset.effectId ?? 'subtitle',
                    x: overlay.x,
                    y: overlay.y,
                    width: overlay.width,
                    height: overlay.height,
                    borderRadius: overlay.borderRadius
                }, null);
                return;
            }
        }

        // 1.6) Keystrokes
        const keystrokeEl = playerContainerRef?.current?.querySelector<HTMLElement>('[data-keystroke-layer="true"]');
        if (keystrokeEl) {
            const overlay = getOverlayFromElement(keystrokeEl, containerRect);
            const isInside = (
                containerX >= overlay.x &&
                containerX <= overlay.x + overlay.width &&
                containerY >= overlay.y &&
                containerY <= overlay.y + overlay.height
            );

            if (isInside) {
                // Basic check: if it covers > 90% of screen, ignore it to prevent blocking
                const isFullScreen = overlay.width > containerRect.width * 0.9 && overlay.height > containerRect.height * 0.9;
                if (!isFullScreen) {
                    setHoverState('keystroke', null, null, null, null, null, null, {
                        id: keystrokeEl.dataset.effectId ?? 'keystroke',
                        x: overlay.x,
                        y: overlay.y,
                        width: overlay.width,
                        height: overlay.height,
                        borderRadius: overlay.borderRadius
                    });
                    return;
                }
            }
        }

        // 2) Annotations (handles + body)
        const annotationHit = hitTestAnnotationsFromPoint(clientX, clientY);
        if (annotationHit) {
            const contentEl =
                annotationHit.annotationElement.querySelector<HTMLElement>('[data-annotation-content="true"]') ??
                annotationHit.annotationElement;
            const annotationRect = contentEl.getBoundingClientRect();
            const visibleRect = intersectRects(annotationRect, containerRect);
            if (visibleRect.width <= 0 || visibleRect.height <= 0) {
                setHoverState(null, null, null, null, null, null);
                return;
            }
            const annotationType = (annotationHit.annotationElement.dataset.annotationType as AnnotationType | undefined) ?? AnnotationType.Text;
            setHoverState('annotation', null, null, {
                id: annotationHit.annotationId,
                type: annotationType,
                x: visibleRect.left - containerRect.left,
                y: visibleRect.top - containerRect.top,
                width: visibleRect.width,
                height: visibleRect.height
            }, null, null);
            return;
        }

        // 3) Cursor (pointer-events:none in renderer; use bounds)
        // Note: Cursor hit testing logic might need update if it doesn't already account for zoom.
        // But cursorEl comes from DOM, which should reflect zoom if rendered there?
        // Actually cursor element rendering might depend on if it's DOM or Canvas.
        // Assuming DOM cursor for now which transforms with container.
        if (canSelectCursor) {
            const cursorEl = aspectContainer.querySelector<HTMLElement>('[data-cursor-layer="true"]');
            if (cursorEl) {
                const cursorRect = cursorEl.getBoundingClientRect();
                const isInsideCursor = (
                    clientX >= cursorRect.left &&
                    clientX <= cursorRect.right &&
                    clientY >= cursorRect.top &&
                    clientY <= cursorRect.bottom
                );

                if (isInsideCursor) {
                    setHoverState('cursor', {
                        left: cursorRect.left - containerRect.left,
                        top: cursorRect.top - containerRect.top,
                        width: cursorRect.width,
                        height: cursorRect.height,
                        tipX: (cursorRect.left - containerRect.left) + cursorRect.width / 2,
                        tipY: (cursorRect.top - containerRect.top) + cursorRect.height / 2,
                        src: ''
                    }, null, null, null, null);
                    return;
                }
            }
        }

        // 4) Video (Content Area)
        if (canSelectVideo) {
            if (
                containerX >= videoRectForHover.x &&
                containerX <= videoRectForHover.x + videoRectForHover.width &&
                containerY >= videoRectForHover.y &&
                containerY <= videoRectForHover.y + videoRectForHover.height
            ) {
                setHoverState('video', null, null, null, {
                    x: videoRectForHover.x,
                    y: videoRectForHover.y,
                    width: videoRectForHover.width,
                    height: videoRectForHover.height,
                    borderRadius: domVideoRect?.borderRadius,
                    clipPath: domVideoRect?.clipPath
                }, null);
                return;
            }
        }

        // 5) Background (everything else)
        if (canSelectBackground) {
            // Use the full container for the background badge so it doesn't sit on the video content.
            setHoverState('background', null, null, null, null, null);
        } else {
            setHoverState(null, null, null, null, null, null);
        }

    }, [aspectContainerRef, canSelectBackground, canSelectCursor, canSelectWebcam, canSelectVideo, playerContainerRef, webcamClip, snapshot, setHoverState, projectEffects.length]);

    return {
        hoveredLayer,
        cursorOverlay,
        webcamOverlay,
        annotationOverlay,
        videoOverlay,
        backgroundOverlay,
        subtitleOverlay,
        keystrokeOverlay,
        handlePreviewHover,
        handlePreviewLeave: useCallback(() => setHoverState(null, null, null, null, null, null), [setHoverState])
    };
}
