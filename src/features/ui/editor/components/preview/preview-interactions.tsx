import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/features/core/stores/project-store';
import { useWorkspaceStore } from '@/features/core/stores/workspace-store';
import { SidebarTabId } from '@/features/effects/components/constants';
import { EffectLayerType } from '@/features/effects/types';
import { EffectType, TrackType } from '@/types/project';
import { getBackgroundEffect, getEffectByType } from '@/features/effects/core/filters';
import { LayerHoverOverlays } from './layer-hover-overlays';
import type { ZoomSettings } from '@/features/ui/editor/types';
import { InteractionLayer } from '@/features/ui/editor/components/InteractionLayer';
import { AnnotationEditProvider } from '@/features/ui/editor/context/AnnotationEditContext';
import type { TimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata';
import { usePreviewHover } from '@/features/ui/editor/hooks/use-preview-hover';
import { useEditorFrameSnapshot } from '@/features/rendering/renderer/hooks/use-frame-snapshot';
import { CropOverlay } from '@/features/effects/crop/components/CropOverlay';
import { useCropManager } from '@/features/effects/crop/hooks/use-crop-manager';
import { useSelectedClipId } from '@/features/core/stores/project-store';
import { getVideoRectFromSnapshot } from '@/features/ui/editor/logic/preview-point-transforms';
import { usePlaybackSettings } from '@/features/rendering/renderer/context/playback/PlaybackSettingsContext';
import { EffectStore } from '@/features/effects/core/effects-store';
import { usePreviewRefsSafe } from '@/features/ui/editor/contexts/preview-context';
import { useAnnotationDropZone } from './annotation-drop-zone';

// ------------------------------------------------------------------
// Main Component: PreviewInteractions
// ------------------------------------------------------------------

interface PreviewInteractionsProps {
    timelineMetadata: TimelineMetadata;
    playerKey?: string;
    zoomSettings?: ZoomSettings;
    previewFrameBounds: { width: number; height: number; };
    children: React.ReactNode;
}

export const PreviewInteractions: React.FC<PreviewInteractionsProps> = ({
    timelineMetadata,
    playerKey,
    zoomSettings,
    previewFrameBounds,
    children,
}) => {
    // Get refs from PreviewContext - must be wrapped in PreviewProvider
    const contextRefs = usePreviewRefsSafe();
    const aspectContainerRef = contextRefs?.aspectContainerRef ?? { current: null };
    const playerContainerRef = contextRefs?.playerContainerRef ?? { current: null };
    const playerRef = contextRefs?.playerRef ?? { current: null };
    // Get playback/render state from context (provided by PlaybackSettingsProvider)
    const { playback, renderSettings } = usePlaybackSettings();
    const isPlaying = playback.isPlaying;
    const isEditingCrop = renderSettings.isEditingCrop;

    // PERF: Consolidated subscriptions to prevent cascading re-renders
    const {
        project,
        selectedEffectLayer,
        selectEffectLayer,
        selectClip,
        inlineEditingId
    } = useProjectStore(useShallow((s) => ({
        project: s.currentProject,
        selectedEffectLayer: s.selectedEffectLayer,
        selectEffectLayer: s.selectEffectLayer,
        selectClip: s.selectClip,
        inlineEditingId: s.inlineEditingId
    })));

    // Derive effects from project
    const projectEffects = useMemo(() => {
        if (!project) return [];
        return EffectStore.getAll(project);
    }, [project]);

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

    // Find active clip at current time using simple linear search
    // (Sufficient for typical timeline sizes; cleaner than binary search optimization)
    const activeClipData = useMemo(() => {
        if (!project) return null;
        const timeMs = (currentFrame / timelineMetadata.fps) * 1000;

        // Collect all clips with their track indices that contain timeMs
        const matches: Array<{
            clip: typeof project.timeline.tracks[0]['clips'][0];
            trackIndex: number;
        }> = [];

        project.timeline.tracks.forEach((track, trackIndex) => {
            const clip = track.clips.find(c =>
                timeMs >= c.startTime && timeMs < c.startTime + c.duration
            );
            if (clip) {
                matches.push({ clip, trackIndex });
            }
        });

        if (matches.length === 0) return null;

        // Prefer highest track index (top-most)
        const best = matches.reduce((a, b) => b.trackIndex > a.trackIndex ? b : a);
        const recording = project.recordings.find(r => r.id === best.clip.recordingId) ?? null;
        const offset = timeMs - best.clip.startTime;
        const sourceTimeMs = best.clip.sourceIn + offset;

        return {
            recording,
            sourceTimeMs,
            clipId: best.clip.id
        };
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
        projectEffects,
        webcamClip: activeWebcamClip,
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        canSelectVideo,
        aspectContainerRef,
        playerContainerRef,
        snapshot,
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
    const { isDraggingAnnotation, dropHandlers: annotationDropHandlers } = useAnnotationDropZone({
        aspectContainerRef,
        snapshot,
        currentTimeMs
    })

    // Calculate video rect for the DOM overlay
    const videoRect = useMemo(() => {
        return getVideoRectFromSnapshot(snapshot)
    }, [snapshot])

    return (
        <AnnotationEditProvider>
            <div
                ref={aspectContainerRef}
                className={`relative w-full h-full overflow-hidden group/preview${(isInteractive && (canSelectBackground || canSelectCursor || canSelectWebcam || canSelectVideo)) ? ' cursor-pointer' : ''}${isDraggingAnnotation ? ' ring-2 ring-primary/50 ring-inset' : ''}`}
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
                        canSelectVideo={canSelectVideo}
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
