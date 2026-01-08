/**
 * Integrates the Remotion Player for the timeline preview.
 * 
 * Key Features:
 * - Uses TimelineComposition for clip transitions.
 * - includes an ambient glow effect (AmbientGlowPlayer).
 * - Optimizes performance by throttling scrub operations and pausing when hidden.
 */

'use client';

import React, { useRef, useEffect, useMemo, useLayoutEffect, useState } from 'react';
import { PlayerRef } from '@remotion/player';
import { useProjectStore } from '@/features/core/stores/project-store';
import { DEFAULT_PROJECT_SETTINGS } from '@/features/core/settings/defaults';
import { usePreviewSettingsStore } from '@/features/core/stores/preview-settings-store';
import { useTimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata';
import { usePlayerConfiguration } from '@/features/rendering/renderer/hooks/use-player-configuration';
import { PREVIEW_DISPLAY_HEIGHT, PREVIEW_DISPLAY_WIDTH, RETINA_MULTIPLIER } from '@/shared/utils/resolution-utils';
import type { CropEffectData } from '@/types/project';
import type { ZoomSettings } from '@/types/remotion';
import { assertDefined } from '@/shared/errors';
import { useWorkspaceStore } from '@/features/core/stores/workspace-store';
import { EffectStore } from '@/features/effects/core/store';
import { usePlayerSync } from '@/features/ui/editor/components/preview/use-player-sync';
import { usePreviewVisibility, usePreviewResize, useVideoPreloader } from '@/features/ui/editor/components/preview/use-preview-lifecycle';
import { PlayerContainer } from '@/features/ui/editor/components/preview/player-container';
import { PreviewInteractions } from '@/features/ui/editor/components/preview/preview-interactions';
import { TimelineProvider } from '@/features/rendering/renderer/context/TimelineContext';
import { PlaybackSettingsProvider } from '@/features/rendering/renderer/context/playback/PlaybackSettingsContext';
import { msToFrame } from '@/features/rendering/renderer/compositions/utils/time/frame-time';
import { AnnotationDock } from '@/features/effects/annotation/ui/AnnotationDock';

interface PreviewAreaRemotionProps {
  // Crop editing props
  isEditingCrop?: boolean;
  zoomSettings?: ZoomSettings;
  glowPortalRootRef?: React.RefObject<HTMLDivElement | null>;
}


export function PreviewAreaRemotion({
  isEditingCrop,
  zoomSettings,
  glowPortalRootRef,
}: PreviewAreaRemotionProps) {
  // Subscribe directly to store to avoid WorkspaceManager re-renders.
  // Avoid subscribing to currentTime here as it updates at 60fps.
  const storeIsPlaying = useProjectStore((s) => s.isPlaying);
  const storePause = useProjectStore((s) => s.pause);
  const isExporting = useProjectStore((s) => s.progress.isProcessing);

  // Track document visibility to pause playback when window loses focus.
  const { isDocumentVisible } = usePreviewVisibility(storeIsPlaying, storePause);

  // Derive effective isPlaying - pause if document hidden
  const isPlaying = storeIsPlaying && isDocumentVisible.current;
  const playerRef = useRef<PlayerRef>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const aspectContainerRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const glowAnchorRef = useRef<HTMLDivElement>(null);
  const [glowPortalRoot, setGlowPortalRoot] = useState<HTMLElement | null>(null);
  const [glowPortalStyle, setGlowPortalStyle] = useState<{
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    scale: number;
  } | null>(null);

  const previewViewportSize = usePreviewResize(previewViewportRef);

  const isScrubbing = useProjectStore((s) => s.isScrubbing);

  const project = useProjectStore((s) => s.currentProject);
  const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer);
  const projectSettings = useProjectStore((s) => s.currentProject?.settings);
  const volume = projectSettings?.audio.volume ?? DEFAULT_PROJECT_SETTINGS.audio.volume;
  const muted = projectSettings?.audio.muted ?? DEFAULT_PROJECT_SETTINGS.audio.muted;
  // Subscribe directly to camera to ensure re-renders when camera settings change
  const cameraSettings = useProjectStore((s) => s.currentProject?.settings.camera) ?? DEFAULT_PROJECT_SETTINGS.camera;
  const isHighQualityPlaybackEnabled = usePreviewSettingsStore((s) => s.highQuality);
  const isGlowEnabled = usePreviewSettingsStore((s) => s.showGlow);
  const glowIntensity = usePreviewSettingsStore((s) => s.glowIntensity);
  const previewScale = useWorkspaceStore((s) => s.previewScale);

  // Calculate timeline metadata (total duration, fps, dimensions)
  const timelineMetadata = assertDefined(
    useTimelineMetadata(project),
    'PreviewAreaRemotion requires timeline metadata before rendering.'
  );

  const projectEffects = useMemo(() => {
    if (!project) return [];
    return EffectStore.getAll(project);
  }, [project]);

  // Calculate initial frame
  // Only needs to run once or when metadata changes
  const initialFrame = useMemo(() => {
    const storeTime = useProjectStore.getState().currentTime;
    const maxFrame = timelineMetadata.durationInFrames - 1;
    const frame = msToFrame(storeTime, timelineMetadata.fps);
    return Math.max(0, Math.min(frame, maxFrame));
  }, [timelineMetadata]);

  // Player key for re-render on clip changes
  const playerKey = useMemo(() => {
    if (!project || !timelineMetadata) return "player-empty";
    const recordingIds = project?.recordings
      ? project.recordings.map((recording) => recording.id).sort().join(",")
      : "";
    return `player-${timelineMetadata.durationInFrames}-${timelineMetadata.fps}-${timelineMetadata.width}-${timelineMetadata.height}-${recordingIds}`;
  }, [project, timelineMetadata]);
  // Sync hook
  const { lastIsPlayingRef } = usePlayerSync({
    playerRef,
    timelineMetadata,
    isPlaying,
    isScrubbing,
    isExporting,
    volume,
    muted,
  });

  // Reset playback state ref when the Remotion Player remounts
  useEffect(() => {
    lastIsPlayingRef.current = false;
  }, [playerKey, lastIsPlayingRef]);


  // Build partial player configuration props
  const playerConfig = assertDefined(
    usePlayerConfiguration(
      project,
      timelineMetadata.width,
      timelineMetadata.height,
      timelineMetadata.fps,
      cameraSettings
    ),
    'PreviewAreaRemotion requires a valid player configuration.'
  );

  const previewFrameBounds = useMemo(() => {
    const capWidth = PREVIEW_DISPLAY_WIDTH * RETINA_MULTIPLIER * previewScale;
    const capHeight = PREVIEW_DISPLAY_HEIGHT * RETINA_MULTIPLIER * previewScale;
    const viewportWidth = previewViewportSize.width || capWidth;
    const viewportHeight = previewViewportSize.height || capHeight;
    const maxWidth = Math.min(viewportWidth, capWidth);
    const maxHeight = Math.min(viewportHeight, capHeight);

    const aspectRatio = timelineMetadata.width / timelineMetadata.height;
    const widthFromHeight = maxHeight * aspectRatio;
    const heightFromWidth = maxWidth / aspectRatio;

    if (widthFromHeight <= maxWidth) {
      return { width: widthFromHeight, height: maxHeight };
    }

    return { width: maxWidth, height: heightFromWidth };
  }, [previewScale, timelineMetadata, previewViewportSize.width, previewViewportSize.height]);

  useLayoutEffect(() => {
    setGlowPortalRoot(glowPortalRootRef?.current ?? null);
  }, [glowPortalRootRef]);

  useLayoutEffect(() => {
    const glowRoot = glowPortalRoot;
    const anchor = glowAnchorRef.current;
    if (!glowRoot || !anchor) return;

    const updateGlowStyle = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const rootRect = glowRoot.getBoundingClientRect();

      const centerX = anchorRect.left - rootRect.left + anchorRect.width / 2;
      const centerY = anchorRect.top - rootRect.top + anchorRect.height / 2;
      const halfWidth = anchorRect.width / 2;
      const halfHeight = anchorRect.height / 2;
      const scaleX = halfWidth > 0
        ? Math.max((2 * centerX) / anchorRect.width, (2 * (rootRect.width - centerX)) / anchorRect.width)
        : 1;
      const scaleY = halfHeight > 0
        ? Math.max((2 * centerY) / anchorRect.height, (2 * (rootRect.height - centerY)) / anchorRect.height)
        : 1;
      const maxScale = Math.max(1, scaleX, scaleY);
      const intensityStrength = Math.pow(Math.max(0, Math.min(1, glowIntensity)), 1.1);
      const scale = 1 + (maxScale - 1) * intensityStrength;
      const next = {
        centerX,
        centerY,
        width: anchorRect.width,
        height: anchorRect.height,
        scale,
      };

      setGlowPortalStyle((prev) => {
        if (
          prev &&
          prev.centerX === next.centerX &&
          prev.centerY === next.centerY &&
          prev.width === next.width &&
          prev.height === next.height &&
          prev.scale === next.scale
        ) {
          return prev;
        }
        return next;
      });
    };

    updateGlowStyle();
    const rafId = requestAnimationFrame(updateGlowStyle);
    const timeoutId = window.setTimeout(updateGlowStyle, 60);

    const resizeObserver = new ResizeObserver(updateGlowStyle);
    resizeObserver.observe(anchor);
    resizeObserver.observe(glowRoot);

    window.addEventListener('resize', updateGlowStyle);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateGlowStyle);
    };
  }, [glowPortalRoot, glowIntensity]);

  // Ensure all videos are loaded
  useVideoPreloader(project);

  const playerContainer = useMemo(() => {
    if (!playerConfig) return null;

    return (
      <PlayerContainer
        playerRef={playerRef}
        playerContainerRef={playerContainerRef}
        timelineMetadata={timelineMetadata}
        playerConfig={playerConfig}
        playerKey={playerKey}
        initialFrame={initialFrame}
        isHighQualityPlaybackEnabled={isHighQualityPlaybackEnabled}
        muted={muted}
        volume={volume}
        isGlowEnabled={isGlowEnabled}
        glowIntensity={glowIntensity}
        isPlaying={isPlaying}
        isScrubbing={isScrubbing}
        isEditingCrop={Boolean(isEditingCrop)}
        zoomSettings={zoomSettings}
        glowPortalRoot={glowPortalRoot}
        glowPortalStyle={glowPortalStyle}
      />
    );
  }, [
    playerRef,
    playerContainerRef,
    timelineMetadata,
    playerConfig,
    playerKey,
    initialFrame,
    isHighQualityPlaybackEnabled,
    muted,
    volume,
    isGlowEnabled,
    glowIntensity,
    isPlaying,
    isScrubbing,
    isEditingCrop,
    zoomSettings,
    glowPortalRoot,
    glowPortalStyle,
  ]);
  if (!project) return null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      <div className="absolute inset-0 flex items-center justify-center p-8">
        {/* Hide preview players during export to save resources */}
        {isExporting ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground animate-pulse">
            <p className="text-lg font-medium">Exporting...</p>
            <p className="text-sm mt-2">Preview paused to optimize performance</p>
          </div>
        ) : (
          <div ref={previewViewportRef} className="relative w-full h-full flex items-center justify-center">
            <div
              className="relative"
              ref={glowAnchorRef}
              style={{
                width: `${previewFrameBounds.width}px`,
                height: `${previewFrameBounds.height}px`,
              }}
            >
              <AnnotationDock />
              {playerConfig && (
                <TimelineProvider
                  compositionWidth={timelineMetadata.width}
                  compositionHeight={timelineMetadata.height}
                  videoWidth={timelineMetadata.width}
                  videoHeight={timelineMetadata.height}
                  fps={timelineMetadata.fps}
                  clips={playerConfig.clips}
                  recordings={playerConfig.recordings}
                  effects={playerConfig.effects}
                  resources={{
                    videoFilePaths: {},
                    videoUrls: {}
                  }}
                >
                  <PlaybackSettingsProvider
                    playback={{
                      isPlaying,
                      isScrubbing,
                      isHighQualityPlaybackEnabled,
                      previewMuted: muted,
                      previewVolume: volume / 100
                    }}
                    renderSettings={{
                      isGlowMode: false,
                      preferOffthreadVideo: false,
                      enhanceAudio: false,
                      isEditingCrop: Boolean(isEditingCrop),
                      glowCrossfade: false
                    }}
                    resources={{
                      videoFilePaths: {},
                      videoUrls: {}
                    }}
                  >
                    <PreviewInteractions
                      project={project}
                      projectEffects={projectEffects}
                      timelineMetadata={timelineMetadata}
                      selectedEffectLayer={selectedEffectLayer}
                      isEditingCrop={Boolean(isEditingCrop)}
                      isPlaying={isPlaying}
                      playerKey={playerKey}
                      zoomSettings={zoomSettings}
                      previewFrameBounds={previewFrameBounds}
                      aspectContainerRef={aspectContainerRef}
                      playerContainerRef={playerContainerRef}
                      playerRef={playerRef}
                    >
                      {/* Memoize PlayerContainer to prevent re-renders when selection/crop state changes but playback doesn't */}
                      {playerContainer}
                    </PreviewInteractions>
                  </PlaybackSettingsProvider>
                </TimelineProvider>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
