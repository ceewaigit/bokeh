import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/features/stores/project-store';
import { useWorkspaceStore } from '@/features/stores/workspace-store';
import { EffectLayerType } from '@/types/effects';
import { EffectType, Project, Effect } from '@/types/project';
import { getBackgroundEffect, getCursorEffect } from '@/features/effects/core/filters';
import { LayerHoverOverlays } from './layer-hover-overlays';
import type { ZoomSettings } from '@/types/remotion';
import type { SelectedEffectLayer } from '@/types/effects';
import { InteractionLayer } from '@/features/editor/components/InteractionLayer';
import { AnnotationEditProvider } from '@/features/editor/context/AnnotationEditContext';
import { PlayerRef } from '@remotion/player';
import type { TimelineMetadata } from '@/features/timeline/hooks/use-timeline-metadata';
import { usePreviewHover } from '@/features/editor/hooks/use-preview-hover';
import { useEditorFrameSnapshot } from '@/features/renderer/hooks/use-frame-snapshot';

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
    const selectClip = useProjectStore((s) => s.selectClip);
    const clearEffectSelection = useProjectStore((s) => s.clearEffectSelection);
    const inlineEditingId = useProjectStore((s) => s.inlineEditingId);
    const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen);
    const toggleProperties = useWorkspaceStore((s) => s.toggleProperties);

    const isPlayingRef = useRef(isPlaying);
    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // Sync current frame from player for annotation filtering and camera calculation.
    // PERF: Avoid state updates during playback to prevent 60fps React renders outside Remotion.
    const [currentFrame, setCurrentFrame] = useState(() => playerRef?.current?.getCurrentFrame() ?? 0);

    useEffect(() => {
        const player = playerRef?.current;
        if (!player) return;

        const onFrame = (e: { detail: { frame: number } }) => {
            if (isPlayingRef.current) return;
            setCurrentFrame(e.detail.frame);
        };

        player.addEventListener('frameupdate', onFrame);

        // Keep state in sync when (re)mounting or when we transition to paused.
        setCurrentFrame(player.getCurrentFrame());

        return () => player.removeEventListener('frameupdate', onFrame);
    }, [playerRef]);

    // Sync frame once when playback stops (so paused UI matches actual player position).
    useEffect(() => {
        if (isPlaying) return;
        const player = playerRef?.current;
        if (!player) return;
        setCurrentFrame(player.getCurrentFrame());
    }, [isPlaying, playerRef]);

    // Deselect annotation when playback starts
    useEffect(() => {
        if (isPlaying) {
            clearEffectSelection();
        }
    }, [isPlaying, clearEffectSelection]);

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
        const effect = getCursorEffect(projectEffects);
        return effect && effect.enabled !== false ? effect.id : null;
    }, [projectEffects]);

    const activeWebcamEffect = useMemo(() => {
        return projectEffects.find((effect) =>
            effect.type === EffectType.Webcam &&
            effect.enabled !== false &&
            currentTimeMs >= effect.startTime &&
            currentTimeMs < effect.endTime
        ) ?? null;
    }, [projectEffects, currentTimeMs]);

    const webcamEffectId = activeWebcamEffect?.id ?? null;

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
    const canSelectWebcam = Boolean(activeWebcamEffect) && !isEditingCrop && !zoomSettings?.isEditing;
    const canSelectVideo = Boolean(activeClipData) && !isEditingCrop && !zoomSettings?.isEditing;

    const {
        hoveredLayer,
        cursorOverlay,
        webcamOverlay,
        annotationOverlay,
        videoOverlay,
        backgroundOverlay,
        handlePreviewHover,
        handlePreviewLeave,
    } = usePreviewHover({
        project,
        projectEffects,
        webcamEffect: activeWebcamEffect,
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
        if (isPlaying) return;
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
        } else if (layer === 'webcam' && canSelectWebcam && webcamEffectId) {
            selectEffectLayer(EffectLayerType.Webcam, webcamEffectId);
            layerName = 'Webcam';
        } else if (layer === 'video' && canSelectVideo) {
            selectEffectLayer(EffectLayerType.Video, 'video-layer');
            if (activeClipData?.clipId) {
                selectClip(activeClipData.clipId);
            }
            layerName = 'Video';
        } else {
            return;
        }

        if (!isPropertiesOpen) {
            toggleProperties();
        }

        toast.success(`Viewing ${layerName} settings`);
    }, [
        isPlaying,
        hoveredLayer,
        inlineEditingId,
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        canSelectVideo,
        backgroundEffectId,
        cursorEffectId,
        webcamEffectId,
        selectEffectLayer,
        selectClip,
        activeClipData?.clipId,
        isPropertiesOpen,
        toggleProperties,
        isFromAnnotationDock,
    ]);

    const isInteractive = !isPlaying;
    const showOverlays = isInteractive;

    return (
        <AnnotationEditProvider>
            <div
                ref={aspectContainerRef}
                className={`relative w-full h-full group/preview${(isInteractive && (canSelectBackground || canSelectCursor || canSelectWebcam || canSelectVideo)) ? ' cursor-pointer' : ''}`}
                style={{
                    aspectRatio: `${timelineMetadata.width} / ${timelineMetadata.height}`,
                }}
                onClick={handleLayerSelect}
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

                {showOverlays && (
                    <LayerHoverOverlays
                        hoveredLayer={hoveredLayer}
                        cursorOverlay={cursorOverlay}
                        webcamOverlay={webcamOverlay}
                        annotationOverlay={annotationOverlay}
                        videoOverlay={videoOverlay}
                        backgroundOverlay={backgroundOverlay}
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

