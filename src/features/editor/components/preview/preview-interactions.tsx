import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/features/stores/project-store';
import { useWorkspaceStore } from '@/features/stores/workspace-store';
import { EffectLayerType } from '@/types/effects';
import { EffectType, Project, Effect } from '@/types/project';
import { getBackgroundEffect, getCursorEffect } from '@/features/effects/core/filters';
import { resolveEffectIdForType } from '@/features/effects/core/selection';
import { LayerHoverOverlays } from './layer-hover-overlays';
import { WebcamOverlay } from './webcam-overlay';
import type { ZoomSettings } from '@/types/remotion';
import type { SelectedEffectLayer } from '@/types/effects';
import type { FrameSnapshot } from '@/features/renderer/engine/layout-engine';
import { VideoPositionProvider } from '@/features/renderer/context/layout/VideoPositionContext';
import { InteractionLayer } from '@/features/editor/components/InteractionLayer';
import { AnnotationEditProvider } from '@/features/editor/context/AnnotationEditContext';
import { PlayerRef } from '@remotion/player';
import { useEditorViewport } from '@/features/editor/hooks/use-editor-viewport';
import type { TimelineMetadata } from '@/features/timeline/hooks/use-timeline-metadata';
import { usePreviewHover } from '@/features/editor/hooks/use-preview-hover';

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

    // Unified Editor Viewport Hook
    const { zoomTransform, transformString } = useEditorViewport({
        currentFrame,
        timelineMetadata,
        zoomSettings,
        isAnnotationEditing
    });

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

    // Resolve Active Clip for Hit Testing (Cursor)
    const activeClipData = useMemo(() => {
        if (!project) return null;
        const timeMs = (currentFrame / timelineMetadata.fps) * 1000;

        // Find visible clip at current time (iterate tracks top-down or bottom-up?)
        // Renderer usually renders bottom-up (track 0 is bottom).
        // Hit testing usually prioritizes top-most visual.
        // We'll search tracks in reverse order to find top-most clip.
        for (let i = project.timeline.tracks.length - 1; i >= 0; i--) {
            const track = project.timeline.tracks[i];
            const clip = track.clips.find(c => timeMs >= c.startTime && timeMs < c.startTime + c.duration);
            if (clip) {
                const offset = timeMs - clip.startTime;
                // Simple speed adjusted time (assuming speed=1 for now as simpler clip model)
                const sourceTimeMs = clip.sourceIn + offset;

                // Retrieve recording via ID: project.recordings is an array
                const recording = project.recordings.find(r => r.id === clip.recordingId) ?? null;

                return {
                    recording,
                    sourceTimeMs
                };
            }
        }
        return null;
    }, [project, currentFrame, timelineMetadata.fps]);

    // Construct snapshot for hit testing logic
    // This matches the "container" coordinates since we assume the player fills the container 1:1 in preview
    // IMPORTANT: Pass zoomTransform so hit testing accounts for camera zoom/pan
    const snapshot = useMemo(() => {
        return {
            layout: {
                offsetX: 0,
                offsetY: 0,
                drawWidth: previewFrameBounds.width,
                drawHeight: previewFrameBounds.height,
                scaleFactor: 1, // Hover is 1:1 with container
                activeSourceWidth: previewFrameBounds.width,
                activeSourceHeight: previewFrameBounds.height
            },
            mockup: { enabled: false },
            camera: { zoomTransform: zoomTransform }
        } as unknown as FrameSnapshot;
    }, [previewFrameBounds.width, previewFrameBounds.height, zoomTransform]);

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
        snapshot,
        timelineMetadata,
        activeClipData
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
        annotationOverlay
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
            {/* Note: Annotation hover is handled by OverlayEditor separately via hit tests on interactions usually,
                but here we show hover hints */}
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
                selectedAnnotationId={selectedEffectLayer?.type === EffectLayerType.Annotation ? selectedEffectLayer.id : null}
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
	                            snapshot={snapshot}
	                            timelineMetadata={timelineMetadata}
	                            currentTimeMs={project.timeline.duration ? (currentFrame / timelineMetadata.fps) * 1000 : 0}
	                        />
	                    )}
	                </AnnotationEditProvider>
	            </VideoPositionProvider>
        </div>
    );
};
