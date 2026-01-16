import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/features/core/stores/project-store';
import { useWorkspaceStore } from '@/features/core/stores/workspace-store';
import { SidebarTabId } from '@/features/effects/components/constants';
import { EffectLayerType } from '@/features/effects/types';
import { EffectType, Project, Effect, TrackType, AnnotationType } from '@/types/project';
import type { AnnotationData } from '@/types/project';
import { getBackgroundEffect, getEffectByType } from '@/features/effects/core/filters';
import { LayerHoverOverlays } from './layer-hover-overlays';
import type { ZoomSettings } from '@/types/remotion';
import type { SelectedEffectLayer } from '@/features/effects/types';
import { InteractionLayer } from '@/features/ui/editor/components/InteractionLayer';
import { AnnotationEditProvider } from '@/features/ui/editor/context/AnnotationEditContext';
import { PlayerRef } from '@remotion/player';
import type { TimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata';
import { usePreviewHover } from '@/features/ui/editor/hooks/use-preview-hover';
import { useEditorFrameSnapshot } from '@/features/rendering/renderer/hooks/use-frame-snapshot';
import { CropOverlay } from '@/features/effects/crop/components/CropOverlay';
import { useCropManager } from '@/features/effects/crop/hooks/use-crop-manager';
import { useAnnotationDrop } from '@/features/effects/annotation/hooks/use-annotation-drop';
import { useAnnotationDropTarget } from '@/features/effects/annotation/ui/AnnotationDragPreview';
import { useSelectedClipId } from '@/features/core/stores/project-store';
import { getVideoRectFromSnapshot, containerPointToVideoPoint } from '@/features/ui/editor/logic/preview-point-transforms';
import { getDefaultAnnotationSize } from '@/features/effects/annotation/config';

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
    playerKey?: string;
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
    playerKey,
    zoomSettings,
    previewFrameBounds,
    aspectContainerRef,
    playerContainerRef,
    playerRef,
    children,
}) => {
    // PERF: Consolidated subscriptions to prevent cascading re-renders
    const {
        selectEffectLayer,
        selectClip,
        addEffect,
        startEditingOverlay,
        inlineEditingId
    } = useProjectStore(useShallow((s) => ({
        selectEffectLayer: s.selectEffectLayer,
        selectClip: s.selectClip,
        addEffect: s.addEffect,
        startEditingOverlay: s.startEditingOverlay,
        inlineEditingId: s.inlineEditingId
    })));

    const {
        isPropertiesOpen,
        toggleProperties,
        setActiveSidebarTab
    } = useWorkspaceStore(useShallow((s) => ({
        isPropertiesOpen: s.isPropertiesOpen,
        toggleProperties: s.toggleProperties,
        setActiveSidebarTab: s.setActiveSidebarTab
    })));

    const isPlayingRef = useRef(isPlaying);
    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // Sync current frame from player for annotation filtering and camera calculation.
    // PERF: Avoid state updates during playback to prevent 60fps React renders outside Remotion.
    const [currentFrame, setCurrentFrame] = useState(() => playerRef?.current?.getCurrentFrame() ?? 0);
    const lastFrameRef = useRef(0);
    const lastStateFrameRef = useRef(0);

    useEffect(() => {
        const player = playerRef?.current;
        if (!player) return;

        const onFrame = (e: { detail: { frame: number } }) => {
            const newFrame = e.detail.frame;
            lastFrameRef.current = newFrame;
            // PERF: Do not drive React re-renders at 60fps during playback.
            // Overlays/interaction UI are hidden while playing, so the state update is wasted.
            if (isPlayingRef.current) return;
            // PERF: Skip if paused/scrubbing and frame unchanged.
            if (newFrame === lastStateFrameRef.current) return;
            lastStateFrameRef.current = newFrame;
            setCurrentFrame(newFrame);
        };

        player.addEventListener('frameupdate', onFrame);

        // Keep state in sync when (re)mounting or when we transition to paused.
        const initialFrame = player.getCurrentFrame();
        lastFrameRef.current = initialFrame;
        lastStateFrameRef.current = initialFrame;
        setCurrentFrame(initialFrame);

        return () => player.removeEventListener('frameupdate', onFrame);
    }, [playerRef, playerKey]);

    // Sync frame once when playback stops (so paused UI matches actual player position).
    useEffect(() => {
        if (isPlaying) return;
        const player = playerRef?.current;
        if (!player) return;
        const frame = player.getCurrentFrame();
        lastFrameRef.current = frame;
        lastStateFrameRef.current = frame;
        setCurrentFrame(frame);
    }, [isPlaying, playerRef, playerKey]);

    const currentTimeMs = useMemo(() => {
        return project?.timeline.duration ? (currentFrame / timelineMetadata.fps) * 1000 : 0;
    }, [project?.timeline.duration, currentFrame, timelineMetadata.fps]);

    const snapshot = useEditorFrameSnapshot(
        currentTimeMs,
        previewFrameBounds.width,
        previewFrameBounds.height
    );

    const backgroundEffectId = useMemo(() => {
        return getBackgroundEffect(projectEffects)?.id ?? null;
    }, [projectEffects]);

    const cursorEffectId = useMemo(() => {
        const effect = getEffectByType(projectEffects, EffectType.Cursor);
        return effect && effect.enabled !== false ? effect.id : null;
    }, [projectEffects]);

    // Find active webcam CLIP (not effect) for hit testing
    const activeWebcamClip = useMemo(() => {
        if (!project) return null;
        const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam);
        if (!webcamTrack) return null;
        return webcamTrack.clips.find(clip =>
            currentTimeMs >= clip.startTime && currentTimeMs < clip.startTime + clip.duration
        ) ?? null;
    }, [project, currentTimeMs]);

    const webcamClipId = activeWebcamClip?.id ?? null;

    // PERF: Pre-build clip time index for O(log n) lookup instead of O(n*m) per frame
    const clipTimeIndex = useMemo(() => {
        if (!project) return null;
        const intervals: Array<{
            startTime: number;
            endTime: number;
            clipId: string;
            recordingId: string;
            sourceIn: number;
            trackIndex: number;
        }> = [];

        project.timeline.tracks.forEach((track, trackIndex) => {
            track.clips.forEach(clip => {
                intervals.push({
                    startTime: clip.startTime,
                    endTime: clip.startTime + clip.duration,
                    clipId: clip.id,
                    recordingId: clip.recordingId,
                    sourceIn: clip.sourceIn,
                    trackIndex
                });
            });
        });

        // Sort by startTime for binary search
        intervals.sort((a, b) => a.startTime - b.startTime);
        return intervals;
    }, [project]);

    // Resolve Active Clip for Hit Testing (Cursor)
    const activeClipData = useMemo(() => {
        if (!project || !clipTimeIndex || clipTimeIndex.length === 0) return null;
        const timeMs = (currentFrame / timelineMetadata.fps) * 1000;

        // Binary search for clips that could contain timeMs
        let lo = 0, hi = clipTimeIndex.length - 1;
        let result: typeof clipTimeIndex[0] | null = null;

        // Find all clips containing timeMs, prefer highest trackIndex (top-most)
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const interval = clipTimeIndex[mid];

            if (interval.startTime > timeMs) {
                hi = mid - 1;
            } else {
                // Check if this interval contains timeMs
                if (timeMs < interval.endTime) {
                    // Found a match - prefer higher track indices (top-most)
                    if (!result || interval.trackIndex > result.trackIndex) {
                        result = interval;
                    }
                }
                lo = mid + 1;
            }
        }

        if (!result) return null;

        const offset = timeMs - result.startTime;
        const sourceTimeMs = result.sourceIn + offset;
        const recording = project.recordings.find(r => r.id === result.recordingId) ?? null;

        return {
            recording,
            sourceTimeMs,
            clipId: result.clipId
        };
    }, [project, currentFrame, timelineMetadata.fps, clipTimeIndex]);

    const canSelectBackground = Boolean(backgroundEffectId) && !isEditingCrop && !zoomSettings?.isEditing;
    const canSelectCursor = Boolean(cursorEffectId) && !isEditingCrop && !zoomSettings?.isEditing;
    const canSelectWebcam = Boolean(activeWebcamClip) && !isEditingCrop && !zoomSettings?.isEditing;
    const canSelectVideo = Boolean(activeClipData) && !isEditingCrop && !zoomSettings?.isEditing;

    const {
        hoveredLayer,
        cursorOverlay,
        webcamOverlay,
        annotationOverlay,
        videoOverlay,
        backgroundOverlay,
        subtitleOverlay,
        keystrokeOverlay,
        handlePreviewHover,
        handlePreviewLeave,
    } = usePreviewHover({
        project,
        projectEffects,
        webcamClip: activeWebcamClip,
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        canSelectVideo,
        aspectContainerRef,
        playerContainerRef,
        snapshot,
        timelineMetadata,
        activeClipData
    });

    const isFromAnnotationDock = useCallback((eventTarget: EventTarget | null) => {
        return eventTarget instanceof HTMLElement
            && eventTarget.closest('[data-annotation-text-dock="true"]') !== null;
    }, []);

    const handleLayerSelect = useCallback((event: React.MouseEvent) => {
        // if (isPlaying) return; // Allow selection during playback
        if (event.defaultPrevented) return;
        if (inlineEditingId) return;
        if (isFromAnnotationDock(event.target)) {
            return;
        }
        const layer = hoveredLayer;
        if (!layer) return;

        let layerName = '';
        if (layer === 'background' && canSelectBackground && backgroundEffectId) {
            selectEffectLayer(EffectLayerType.Background, backgroundEffectId);
            layerName = 'Background';
        } else if (layer === 'cursor' && canSelectCursor && cursorEffectId) {
            selectEffectLayer(EffectLayerType.Cursor, cursorEffectId);
            layerName = 'Cursor';
        } else if (layer === 'webcam' && canSelectWebcam && webcamClipId) {
            // Select webcam clips directly, not effects
            selectClip(webcamClipId);
            setActiveSidebarTab(SidebarTabId.Webcam);
            layerName = 'Webcam';
        } else if (layer === 'subtitle') {
            // Assume the effect ID is passed in the overlay data or we find the active one
            // We can look up the active subtitle effect
            const activeSubtitle = projectEffects.find(e =>
                e.type === EffectType.Subtitle &&
                e.enabled !== false &&
                currentTimeMs >= e.startTime &&
                currentTimeMs < e.endTime
            );
            if (activeSubtitle) {
                selectEffectLayer(EffectLayerType.Subtitle, activeSubtitle.id);
                layerName = 'Subtitle';
            }
        } else if (layer === 'keystroke') {
            const activeKeystroke = projectEffects.find(e =>
                e.type === EffectType.Keystroke &&
                e.enabled !== false &&
                currentTimeMs >= e.startTime &&
                currentTimeMs < e.endTime
            );
            if (activeKeystroke) {
                selectEffectLayer(EffectLayerType.Keystroke, activeKeystroke.id);
                layerName = 'Keystroke';
            }
        } else if (layer === 'video' && canSelectVideo) {
            if (activeClipData?.clipId) {
                selectClip(activeClipData.clipId);
                setActiveSidebarTab(SidebarTabId.Screen);
            }
            layerName = 'Screen';
        } else {
            return;
        }

        if (!isPropertiesOpen) {
            toggleProperties();
        }

        toast.success(`Viewing ${layerName} settings`);
    }, [
        hoveredLayer,
        inlineEditingId,
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        canSelectVideo,
        backgroundEffectId,
        cursorEffectId,
        webcamClipId,
        selectEffectLayer,
        selectClip,
        setActiveSidebarTab,
        activeClipData?.clipId,
        isPropertiesOpen,
        toggleProperties,
        isFromAnnotationDock,
        currentTimeMs,
        projectEffects
    ]);

    const isInteractive = !isPlaying
    const showOverlays = isInteractive;

    // --- Crop Management via Hook ---
    const selectedClipId = useSelectedClipId()
    const selectedClip = useProjectStore((s) =>
        s.currentProject?.timeline.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId)
    )

    const {
        editingCropData,
        handleCropChange,
        handleCropConfirm,
        handleCropReset
    } = useCropManager(selectedClip)

    // --- Annotation Drag-Drop ---
    const {
        handlers: annotationDropHandlers,
        isDraggingAnnotation
    } = useAnnotationDrop({
        aspectContainerRef,
        snapshot,
        currentTime: currentTimeMs
    })

    // Custom drop handler for mouse-based drag (useAnnotationDragSource)
    const handleCustomAnnotationDrop = useCallback((type: AnnotationType, containerX: number, containerY: number) => {
        // Convert container coordinates to video-local coordinates
        const videoPoint = containerPointToVideoPoint({ x: containerX, y: containerY }, snapshot)
        const videoRectData = getVideoRectFromSnapshot(snapshot)

        // Convert to percent within the video frame
        const percentX = videoRectData.width > 0 ? (videoPoint.x / videoRectData.width) * 100 : 50
        const percentY = videoRectData.height > 0 ? (videoPoint.y / videoRectData.height) * 100 : 50

        const startTime = currentTimeMs
        const endTime = startTime + 3000 // 3 second default duration
        const defaultSize = getDefaultAnnotationSize(type)

        // Adjust position for top-left anchored elements (Highlight, Redaction, Blur)
        const isTopLeftAnchor = type === AnnotationType.Highlight ||
            type === AnnotationType.Redaction ||
            type === AnnotationType.Blur

        let finalX = percentX
        let finalY = percentY
        if (isTopLeftAnchor && defaultSize.width && defaultSize.height) {
            finalX = percentX - defaultSize.width / 2
            finalY = percentY - defaultSize.height / 2
        }

        const effect: Effect = {
            id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: EffectType.Annotation,
            startTime,
            endTime,
            enabled: true,
            data: {
                type,
                position: { x: finalX, y: finalY },
                content: type === AnnotationType.Text ? 'New text' : undefined,
                endPosition: type === AnnotationType.Arrow
                    ? { x: percentX + 10, y: percentY }
                    : undefined,
                width: defaultSize.width,
                height: defaultSize.height,
                style: {
                    color: type === AnnotationType.Highlight ? '#ffeb3b' : '#ffffff',
                    backgroundColor: type === AnnotationType.Redaction ? '#000000' : undefined,
                    fontSize: 18,
                    textAlign: type === AnnotationType.Text ? 'center' : undefined,
                    borderRadius: type === AnnotationType.Redaction ? 2 : undefined,
                },
            } satisfies AnnotationData,
        }

        addEffect(effect)
        selectEffectLayer(EffectLayerType.Annotation, effect.id)
        startEditingOverlay(effect.id)
    }, [snapshot, currentTimeMs, addEffect, selectEffectLayer, startEditingOverlay])

    // Wire up custom event listener for mouse-based drag-drop
    useAnnotationDropTarget(aspectContainerRef, handleCustomAnnotationDrop)

    // Calculate video rect for the DOM overlay
    const videoRect = useMemo(() => {
        if (snapshot) {
            return getVideoRectFromSnapshot(snapshot)
        }
        if (aspectContainerRef.current) {
            const rect = aspectContainerRef.current.getBoundingClientRect()
            return { x: 0, y: 0, width: rect.width, height: rect.height }
        }
        return { x: 0, y: 0, width: 0, height: 0 }
    }, [aspectContainerRef, snapshot])

    return (
        <AnnotationEditProvider>
            <div
                ref={aspectContainerRef}
                className={`relative w-full h-full group/preview${(isInteractive && (canSelectBackground || canSelectCursor || canSelectWebcam || canSelectVideo)) ? ' cursor-pointer' : ''}${isDraggingAnnotation ? ' ring-2 ring-primary/50 ring-inset' : ''}`}
                style={{
                    aspectRatio: `${timelineMetadata.width} / ${timelineMetadata.height}`,
                }}
                onClick={handleLayerSelect}
                onDragOver={annotationDropHandlers.onDragOver}
                onDragLeave={annotationDropHandlers.onDragLeave}
                onDrop={annotationDropHandlers.onDrop}
                onMouseMove={(event) => {
                    if (!isInteractive) return;
                    if (isFromAnnotationDock(event.target)) {
                        handlePreviewLeave();
                        return;
                    }
                    handlePreviewHover(event);
                }}
                onMouseLeave={(event) => {
                    if (!isInteractive) return;
                    if (isFromAnnotationDock(event.target)) return;
                    handlePreviewLeave();
                }}
            >
                {children}

                {/* DOM-based Crop Overlay (Scale Invariant) */}
                {isEditingCrop && editingCropData && (
                    <CropOverlay
                        cropData={editingCropData}
                        onCropChange={handleCropChange}
                        onConfirm={handleCropConfirm}
                        onReset={handleCropReset}
                        videoRect={videoRect}
                        showActions={true}
                        showInfo={true}
                    />
                )}

                {showOverlays && (
                    <LayerHoverOverlays
                        hoveredLayer={hoveredLayer}
                        cursorOverlay={cursorOverlay}
                        webcamOverlay={webcamOverlay}
                        annotationOverlay={annotationOverlay}
                        videoOverlay={videoOverlay}
                        backgroundOverlay={backgroundOverlay}
                        subtitleOverlay={subtitleOverlay}
                        keystrokeOverlay={keystrokeOverlay}
                        canSelectBackground={canSelectBackground}
                        canSelectCursor={canSelectCursor}
                        canSelectWebcam={canSelectWebcam}
                        canSelectVideo={canSelectVideo}
                        canSelectAnnotation={true}
                        containerWidth={previewFrameBounds.width}
                        containerHeight={previewFrameBounds.height}
                        selectedAnnotationId={selectedEffectLayer?.type === EffectLayerType.Annotation ? selectedEffectLayer.id : null}
                    />
                )}

                {/* Hide InteractionLayer during playback - only show when paused */}
                {(isInteractive && !zoomSettings?.isEditing && !isEditingCrop) && (
                    <InteractionLayer
                        effects={projectEffects}
                        snapshot={snapshot}
                        currentTimeMs={currentTimeMs}
                    />
                )}
            </div>
        </AnnotationEditProvider>
    );
};
