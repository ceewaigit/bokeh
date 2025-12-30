/**
 * Integrates the Remotion Player for the timeline preview.
 * 
 * Key Features:
 * - Uses TimelineComposition for clip transitions.
 * - includes an ambient glow effect (AmbientGlowPlayer).
 * - Optimizes performance by throttling scrub operations and pausing when hidden.
 */

'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import { PlayerRef } from '@remotion/player';
import { useProjectStore } from '@/stores/project-store';
import { DEFAULT_PROJECT_SETTINGS } from '@/lib/settings/defaults';
import { usePreviewSettingsStore } from '@/stores/preview-settings-store';
import { useTimelineMetadata } from '@/hooks/use-timeline-metadata';
import { usePlayerConfiguration } from '@/hooks/use-player-configuration';
import { PREVIEW_DISPLAY_HEIGHT, PREVIEW_DISPLAY_WIDTH, RETINA_MULTIPLIER } from '@/shared/utils/resolution-utils';
import type { CropEffectData } from '@/types/project';
import type { ZoomSettings } from '@/types/remotion';
import { assertDefined } from '@/lib/errors';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { EffectStore } from '@/lib/core/effects';
import { usePlayerSync } from './preview/use-player-sync';
import { usePreviewVisibility, usePreviewResize, useVideoPreloader } from './preview/use-preview-lifecycle';
import { PlayerContainer } from './preview/player-container';
import { PreviewInteractions } from './preview/preview-interactions';
import { msToFrame } from '@/remotion/compositions/utils/time/frame-time';

interface PreviewAreaRemotionProps {
  // Crop editing props
  isEditingCrop?: boolean;
  cropData?: CropEffectData | null;
  onCropChange?: (cropData: CropEffectData) => void;
  onCropConfirm?: () => void;
  onCropReset?: () => void;
  zoomSettings?: ZoomSettings;
}


export function PreviewAreaRemotion({
  isEditingCrop,
  cropData,
  onCropChange,
  onCropConfirm,
  onCropReset,
  zoomSettings,
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

  // Ensure all videos are loaded
  useVideoPreloader(project);

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
              style={{
                width: `${previewFrameBounds.width}px`,
                height: `${previewFrameBounds.height}px`,
              }}
            >
              <div className="rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.14)] h-full w-full">

                <PreviewInteractions
                  project={project}
                  projectEffects={projectEffects}
                  timelineMetadata={timelineMetadata}
                  selectedEffectLayer={selectedEffectLayer}
                  isEditingCrop={Boolean(isEditingCrop)}
                  zoomSettings={zoomSettings}
                  previewFrameBounds={previewFrameBounds}
                  aspectContainerRef={aspectContainerRef}
                  playerContainerRef={playerContainerRef}
                >
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
                    cropData={cropData || null}
                    onCropChange={onCropChange}
                    onCropConfirm={onCropConfirm}
                    onCropReset={onCropReset}
                    zoomSettings={zoomSettings}
                  />
                </PreviewInteractions>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
