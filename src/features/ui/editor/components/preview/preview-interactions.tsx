import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/features/core/stores/project-store';
import { useWorkspaceStore } from '@/features/core/stores/workspace-store';
import { SidebarTabId } from '@/features/effects/components/constants';
import { EffectLayerType } from '@/features/effects/types';
import { EffectType, Project, Effect, TrackType } from '@/types/project';
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
import { useSelectedClipId } from '@/features/core/stores/project-store';
import { getVideoRectFromSnapshot } from '@/features/ui/editor/logic/preview-point-transforms';

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
    const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer);
    const selectClip = useProjectStore((s) => s.selectClip);
    const inlineEditingId = useProjectStore((s) => s.inlineEditingId);
    const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen);
    const toggleProperties = useWorkspaceStore((s) => s.toggleProperties);
    const setActiveSidebarTab = useWorkspaceStore((s) => s.setActiveSidebarTab);

    const isPlayingRef = useRef(isPlaying);
    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // Sync current frame from player for annotation filtering and camera calculation.
    // PERF: Avoid state updates during playback to prevent 60fps React renders outside Remotion.
    const [currentFrame, setCurrentFrame] = useState(() => playerRef?.current?.getCurrentFrame() ?? 0);
    const lastFrameRef = useRef(0);

    useEffect(() => {
        const player = playerRef?.current;
        if (!player) return;

        const onFrame = (e: { detail: { frame: number } }) => {
            const newFrame = e.detail.frame;
            // PERF: Skip if paused and frame unchanged - saves ~10% CPU
            if (!isPlayingRef.current && newFrame === lastFrameRef.current) return;
            lastFrameRef.current = newFrame;
            setCurrentFrame(newFrame);
        };

        player.addEventListener('frameupdate', onFrame);

        // Keep state in sync when (re)mounting or when we transition to paused.
        const initialFrame = player.getCurrentFrame();
        lastFrameRef.current = initialFrame;
        setCurrentFrame(initialFrame);

        return () => player.removeEventListener('frameupdate', onFrame);
    }, [playerRef, playerKey]);

    // Sync frame once when playback stops (so paused UI matches actual player position).
    useEffect(() => {
        if (isPlaying) return;
        const player = playerRef?.current;
        if (!player) return;
        setCurrentFrame(player.getCurrentFrame());
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

    // Resolve Active Clip for Hit Testing (Cursor)
    const activeClipData = useMemo(() => {
        if (!project) return null;
        const timeMs = (currentFrame / timelineMetadata.fps) * 1000;

        // Find visible clip at current time. Search tracks in reverse order to prioritize top-most.
        for (let i = project.timeline.tracks.length - 1; i >= 0; i--) {
            const track = project.timeline.tracks[i];
            const clip = track.clips.find(c => timeMs >= c.startTime && timeMs < c.startTime + c.duration);
            if (clip) {
                const offset = timeMs - clip.startTime;
                const sourceTimeMs = clip.sourceIn + offset;
                const recording = project.recordings.find(r => r.id === clip.recordingId) ?? null;

                return {
                    recording,
                    sourceTimeMs,
                    clipId: clip.id
                };
            }
        }
        return null;
    }, [project, currentFrame, timelineMetadata.fps]);

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
