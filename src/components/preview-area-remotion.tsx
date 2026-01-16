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
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/features/core/stores/project-store';
import { useProgressStore } from '@/features/core/stores/progress-store';
import { DEFAULT_PROJECT_SETTINGS } from '@/features/core/settings/defaults';
import { usePreviewSettingsStore } from '@/features/core/stores/preview-settings-store';
import { useTimelineMetadata } from '@/features/ui/timeline/hooks/use-timeline-metadata';
import { usePlayerConfiguration } from '@/features/rendering/renderer/hooks/use-player-configuration';
import { PREVIEW_DISPLAY_HEIGHT, PREVIEW_DISPLAY_WIDTH, PROXY_HEIGHT, PROXY_WIDTH, RETINA_MULTIPLIER } from '@/shared/utils/resolution-utils';
import type { ZoomSettings } from '@/types/remotion';
import { assertDefined } from '@/shared/errors';
import { useWorkspaceStore } from '@/features/core/stores/workspace-store';
import { EffectStore } from '@/features/effects/core/effects-store';
import { usePlayerSync } from '@/features/ui/editor/components/preview/use-player-sync';
import { usePreviewVisibility, usePreviewResize, useVideoPreloader } from '@/features/ui/editor/components/preview/use-preview-lifecycle';
import { PlayerContainer } from '@/features/ui/editor/components/preview/player-container';
import { PreviewInteractions } from '@/features/ui/editor/components/preview/preview-interactions';
import { TimelineProvider } from '@/features/rendering/renderer/context/RenderingTimelineContext';
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
  // BATTERY OPTIMIZATION: Batch state selectors to reduce subscription overhead.
  // Uses useShallow for structural equality - component only re-renders when values actually change.
  // Avoids subscribing to currentTime here as it updates at 60fps.
  const {
    storeIsPlaying,
    isScrubbing,
    project,
    selectedEffectLayer,
    timelineMutationCounter,
  } = useProjectStore(useShallow((s) => ({
    storeIsPlaying: s.isPlaying,
    isScrubbing: s.isScrubbing,
    project: s.currentProject,
    selectedEffectLayer: s.selectedEffectLayer,
    timelineMutationCounter: s.timelineMutationCounter,
  })));
  // Keep function selectors separate (not state)
  const storePause = useProjectStore((s) => s.pause);
  const isExporting = useProgressStore((s) => s.isProcessing);

  // Derive settings from project (avoids extra subscriptions)
  const projectSettings = project?.settings;
  const volume = projectSettings?.audio.volume ?? DEFAULT_PROJECT_SETTINGS.audio.volume;
  const muted = projectSettings?.audio.muted ?? DEFAULT_PROJECT_SETTINGS.audio.muted;
  const cameraSettings = projectSettings?.camera ?? DEFAULT_PROJECT_SETTINGS.camera;

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

  // Player key for re-render on truly structural changes only
  // STABLE: Only fps + recording IDs require remount. Duration/dimensions are handled by Remotion.
  // Previously included duration/width/height which caused remounts during edits and scrubbing.
  // FIX: Include timelineMutationCounter to force remount when clips are regenerated (new clip IDs)
  const playerKey = useMemo(() => {
    if (!project || !timelineMetadata) return "player-empty";
    const videoTrack = project.timeline.tracks.find(t => t.type === 'video');
    const videoRecordingIds = videoTrack?.clips
      .map(c => c.recordingId)
      .filter((id, i, arr) => arr.indexOf(id) === i) // unique
      .sort()
      .join(",") ?? "";
    // Only fps (timing) and recording IDs (source videos) are truly structural
    // Include mutation counter to force remount when clips are regenerated
    return `player-${timelineMetadata.fps}-${videoRecordingIds}-${timelineMutationCounter}`;
  }, [project, timelineMetadata, timelineMutationCounter]);
  // Sync hook
  const { lastIsPlayingRef, safePlay } = usePlayerSync({
    playerRef,
    timelineMetadata,
    isPlaying,
    isScrubbing,
    isExporting,
    volume,
    muted,
  });

  // Reset playback state ref when the Remotion Player remounts
  // AND resume playback if it was playing before the remount
  useEffect(() => {
    lastIsPlayingRef.current = false;

    // If the store says we should be playing, restart playback after remount
    // Use a small delay to ensure the new player is fully mounted
    if (isPlaying && playerRef.current) {
      const timeoutId = setTimeout(() => {
        if (playerRef.current && useProjectStore.getState().isPlaying) {
          safePlay(playerRef.current);
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [playerKey, lastIsPlayingRef, isPlaying, safePlay, playerRef]);


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
    const viewportWidth = previewViewportSize.width || PREVIEW_DISPLAY_WIDTH;
    const viewportHeight = previewViewportSize.height || PREVIEW_DISPLAY_HEIGHT;

    // NOTE: This is *CSS layout size*, not render resolution.
    // Keep UI scale separate from internal composition resolution to avoid fullscreen causing massive GPU buffers.
    //
    // We size the preview to a predictable baseline (720p @ 1x scale), clamped by the available viewport.
    const uiScale = Math.max(0.25, previewScale || 1);
    const capWidth = PREVIEW_DISPLAY_WIDTH * RETINA_MULTIPLIER * uiScale;
    const capHeight = PREVIEW_DISPLAY_HEIGHT * RETINA_MULTIPLIER * uiScale;
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

  // Remotion Player can render the composition at a reduced resolution for preview.
  // This must stay in sync with the Player's `compositionWidth/Height` or overlays (cursor, annotations)
  // will be scaled/mapped incorrectly.
  const compositionSize = useMemo(() => {
    const videoWidth = timelineMetadata.width;
    const videoHeight = timelineMetadata.height;
    const videoAspectRatio = videoWidth / videoHeight;

    // Render resolution: scale with what's actually displayed (for sharpness),
    // but cap aggressively to avoid fullscreen = huge buffers = lag/VRAM spikes.
    //
    // Proxy sizes are a good upper bound: they're designed for zoom quality without being full source.
    const dpr = typeof window !== 'undefined'
      ? Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      : 1;

    // IMPORTANT: `previewScale` is a UI zoom. Users expect scaling the preview up/down to not
    // dramatically change performance. We therefore only increase internal render resolution
    // up to a baseline (720p@2x). Above that, we upscale via CSS.
    const baselineCssWidth = PREVIEW_DISPLAY_WIDTH * RETINA_MULTIPLIER;
    const baselineCssHeight = PREVIEW_DISPLAY_HEIGHT * RETINA_MULTIPLIER;
    const renderCssWidth = Math.min(previewFrameBounds.width, baselineCssWidth);
    const renderCssHeight = Math.min(previewFrameBounds.height, baselineCssHeight);

    const desiredMaxWidth = Math.round(renderCssWidth * dpr);
    const desiredMaxHeight = Math.round(renderCssHeight * dpr);

    const minWidth = PREVIEW_DISPLAY_WIDTH * RETINA_MULTIPLIER;
    const minHeight = PREVIEW_DISPLAY_HEIGHT * RETINA_MULTIPLIER;

    const maxWidth = isHighQualityPlaybackEnabled
      ? videoWidth
      : Math.min(videoWidth, Math.max(minWidth, Math.min(PROXY_WIDTH, desiredMaxWidth)));
    const maxHeight = isHighQualityPlaybackEnabled
      ? videoHeight
      : Math.min(videoHeight, Math.max(minHeight, Math.min(PROXY_HEIGHT, desiredMaxHeight)));

    const scaleByWidth = maxWidth / videoWidth;
    const scaleByHeight = maxHeight / videoHeight;
    const scale = Math.min(scaleByWidth, scaleByHeight, 1);

    const width = Math.max(320, Math.round(videoWidth * scale));
    let height = Math.max(180, Math.round(videoHeight * scale));

    if (Math.abs(width / height - videoAspectRatio) > 0.001) {
      height = Math.round(width / videoAspectRatio);
    }

    return { width, height };
  }, [timelineMetadata, isHighQualityPlaybackEnabled, previewFrameBounds.width, previewFrameBounds.height]);

  useLayoutEffect(() => {
    setGlowPortalRoot(glowPortalRootRef?.current ?? null);
  }, [glowPortalRootRef]);

  // PERFORMANCE: Consolidated glow update using a single RAF-debounced ResizeObserver.
  // Previously used RAF + setTimeout + 2 ResizeObservers + resize listener, causing massive battery drain.
  // Now uses a single ResizeObserver with debounced RAF callback.
  // glowIntensity is read via ref to avoid effect re-runs on slider changes.
  const glowIntensityRef = useRef(glowIntensity);
  const glowUpdateRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    glowIntensityRef.current = glowIntensity;
    // Trigger update when intensity changes (if update function is available)
    glowUpdateRef.current?.();
  }, [glowIntensity]);

  useLayoutEffect(() => {
    const glowRoot = glowPortalRoot;
    const anchor = glowAnchorRef.current;
    if (!glowRoot || !anchor) return;

    let rafPending = false;

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
      // Read intensity from ref to avoid re-running effect on slider changes
      const currentIntensity = glowIntensityRef.current;
      const intensityStrength = Math.pow(Math.max(0, Math.min(1, currentIntensity)), 1.1);
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

    // Debounced update: coalesces rapid resize/intensity events into a single RAF
    const debouncedUpdate = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        updateGlowStyle();
      });
    };

    // Expose update function for intensity changes
    glowUpdateRef.current = debouncedUpdate;

    // Initial update
    updateGlowStyle();

    // Single ResizeObserver on anchor (contains all relevant dimensions)
    // ResizeObserver also fires on initial observe, covering window resize cases
    const resizeObserver = new ResizeObserver(debouncedUpdate);
    resizeObserver.observe(anchor);

    return () => {
      resizeObserver.disconnect();
      glowUpdateRef.current = null;
    };
  }, [glowPortalRoot]);

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
        compositionWidth={compositionSize.width}
        compositionHeight={compositionSize.height}
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
    compositionSize.height,
    compositionSize.width
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
                  compositionWidth={compositionSize.width}
                  compositionHeight={compositionSize.height}
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
