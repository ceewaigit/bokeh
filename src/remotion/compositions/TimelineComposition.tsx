/**
 * Timeline Composition - Top-level orchestrator for the entire timeline
 *
 * This composition spans the entire timeline and renders all clips as Remotion Sequences.
 * It eliminates the need for clip-to-clip transitions by keeping the Player configured
 * with a single, stable durationInFrames that never changes.
 *
 * Responsibilities:
 * - Provide TimeContext to all children
 * - Map clips to ClipSequence components
 * - Render audio clips with Remotion Audio component
 * - Coordinate timeline-level state
 */

import React from 'react';
import { AbsoluteFill, Audio, Sequence, getRemotionEnvironment, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Recording } from '@/types/project';
import type { TimelineCompositionProps, VideoUrlMap } from '@/types';
import { TimeProvider } from '../context/timeline/TimeContext';
import { PlaybackSettingsProvider } from '../context/playback/PlaybackSettingsContext';
import { CompositionConfigProvider } from '../context/CompositionConfigContext';
import { ClipSequence } from './ClipSequence';
import { SharedVideoController } from './SharedVideoController';
import { buildFrameLayout, findActiveFrameLayoutIndex, findActiveFrameLayoutItems } from '@/lib/timeline/frame-layout';
import { CursorLayer } from './layers/CursorLayer';
import { PluginLayer } from './layers/PluginLayer';
import { CropEditingLayer } from './layers/CropEditingLayer';
import { RecordingStorage } from '@/lib/storage/recording-storage';

/**
 * Get audio URL for a recording
 */
function getAudioUrl(recording: Recording, videoFilePaths?: VideoUrlMap): string | undefined {
  // Priority 1: Direct file path for export
  if (videoFilePaths && videoFilePaths[recording.id]) {
    return videoFilePaths[recording.id];
  }

  // Priority 2: Cached blob URL
  const cachedUrl = RecordingStorage.getBlobUrl(recording.id);
  if (cachedUrl) {
    return cachedUrl;
  }

  // Priority 3: video-stream protocol
  if (recording.filePath) {
    if (recording.folderPath && recording.folderPath.startsWith('/')) {
      const fileName = recording.filePath.split('/').pop() || recording.filePath;
      const fullPath = `${recording.folderPath}/${fileName}`;
      return `video-stream://local/${encodeURIComponent(fullPath)}`;
    }
    return `video-stream://local/${encodeURIComponent(recording.filePath)}`;
  }

  return undefined;
}

/**
 * Timeline Composition
 *
 * Clean separation of concerns:
 * - This component orchestrates (maps clips to sequences)
 * - ClipSequence coordinates (provides clip context)
 * - LayerStack renders (displays visual layers)
 */
export const TimelineComposition: React.FC<TimelineCompositionProps> = ({
  clips,
  audioClips = [],
  recordings,
  effects,
  videoWidth,
  videoHeight,
  fps,
  sourceVideoWidth,
  sourceVideoHeight,
  cameraSettings,
  backgroundColor,

  // Config Objects (required - callers must provide structured props)
  resources,
  playback,
  renderSettings,
  cropSettings,
}) => {
  // ==========================================================================
  // FAIL-FAST: Validate required config objects
  // ==========================================================================
  // All callers (preview, export, glow) must pass structured props.
  // No more defensive fallbacks that mask caller bugs.
  if (!resources) {
    throw new Error('[TimelineComposition] Missing required prop: resources');
  }
  if (!playback) {
    throw new Error('[TimelineComposition] Missing required prop: playback');
  }
  if (!renderSettings) {
    throw new Error('[TimelineComposition] Missing required prop: renderSettings');
  }
  if (!cropSettings) {
    throw new Error('[TimelineComposition] Missing required prop: cropSettings');
  }
  const frame = useCurrentFrame();
  const { isRendering } = getRemotionEnvironment();
  const { width: compositionWidth, height: compositionHeight } = useVideoConfig();

  // Optimization: Create a map of recordings for O(1) lookup
  const recordingMap = React.useMemo(() => {
    return new Map(recordings.map(r => [r.id, r]));
  }, [recordings]);

  // Sort clips by start time for consistent rendering
  const sortedClips = React.useMemo(() => {
    return [...clips].sort((a, b) => a.startTime - b.startTime);
  }, [clips]);

  const frameLayout = React.useMemo(() => buildFrameLayout(sortedClips, fps, recordingMap), [sortedClips, fps, recordingMap]);

  // STABILITY: Track previous visible items to prevent unnecessary remounts
  // When play/pause toggles, the same clips should remain mounted
  const prevVisibleIdsRef = React.useRef<string>('');
  const prevVisibleLayoutRef = React.useRef<ReturnType<typeof findActiveFrameLayoutItems>>([]);

  // Performance: Only render per-clip layers for clips active at the current frame.
  // This supports overlapping tracks (e.g. video over background).
  const visibleFrameLayout = React.useMemo(() => {
    if (!frameLayout || frameLayout.length === 0) return [];

    // Find ALL clips active at the current frame
    // This now uses the optimized version which stops early
    const activeItems = findActiveFrameLayoutItems(frameLayout, frame);

    // For now, let's optimize the loop inside this memo.
    const items = [...activeItems];
    const activeIds = new Set(activeItems.map(i => i.clip.id));

    for (const item of activeItems) {
      // Check if this is a previous clip that should be visible during intro fade of current
      if (item.clip.introFadeMs) {
        const prev = frameLayout.find(p => p.endFrame === item.startFrame);

        if (prev) {
          const fadeFrames = Math.round((item.clip.introFadeMs / 1000) * fps);
          if (frame >= item.startFrame && frame < item.startFrame + fadeFrames) {
            if (!activeIds.has(prev.clip.id)) {
              items.push(prev);
              activeIds.add(prev.clip.id);
            }
          }
        }
      }

      // Check if this is a next clip that should be visible during outro fade of current
      if (item.clip.outroFadeMs) {
        const next = frameLayout.find(n => n.startFrame === item.endFrame);

        if (next) {
          const fadeFrames = Math.round((item.clip.outroFadeMs / 1000) * fps);
          if (frame >= item.endFrame - fadeFrames && frame < item.endFrame) {
            if (!activeIds.has(next.clip.id)) {
              items.push(next);
              activeIds.add(next.clip.id);
            }
          }
        }
      }
    }

    // Return previous array reference if clip IDs haven't changed
    // This prevents ClipSequence remounts when only play/pause state changes
    const currentIds = items.map(i => i.clip.id).sort().join(',');
    if (currentIds === prevVisibleIdsRef.current) {
      // Same clips visible - update the items in place but return stable reference
      // This ensures React doesn't remount children due to new array reference
      return prevVisibleLayoutRef.current;
    }

    // Clips changed - update refs and return new array
    prevVisibleIdsRef.current = currentIds;
    prevVisibleLayoutRef.current = items;
    return items;
  }, [frameLayout, fps, frame]);

  return (
    <TimeProvider clips={sortedClips} recordings={recordings} resources={resources} fps={fps}>
      <PlaybackSettingsProvider
        playback={playback}
        renderSettings={renderSettings}
        resources={resources}
      >
        <CompositionConfigProvider
          compositionWidth={compositionWidth}
          compositionHeight={compositionHeight}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          sourceVideoWidth={sourceVideoWidth}
          sourceVideoHeight={sourceVideoHeight}
          fps={fps}
        >
          <AbsoluteFill
          style={{
            backgroundColor: backgroundColor ?? '#000',
          }}
        >
          {/* Background layer must be below the video. Render per-clip to support parallax (mouse-driven) backgrounds. */}
          <AbsoluteFill style={{ zIndex: 0 }}>
            {visibleFrameLayout.map(({ clip, startFrame, durationFrames }) => {
              return (
                <ClipSequence
                  key={`bg-${clip.id}`}
                  clip={clip}
                  effects={effects}
                  videoWidth={videoWidth}
                  videoHeight={videoHeight}
                  renderSettings={renderSettings}
                  startFrame={startFrame}
                  durationFrames={durationFrames}
                  includeBackground={true}
                  includeKeystrokes={false}
                />
              );
            })}
          </AbsoluteFill>

          {/* SharedVideoController provides VideoPositionContext for all children */}
          <SharedVideoController
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            sourceVideoWidth={sourceVideoWidth}
            sourceVideoHeight={sourceVideoHeight}
            effects={effects}
            cameraSettings={cameraSettings}
            resources={resources}
            playback={playback}
            renderSettings={renderSettings}
            cropSettings={cropSettings}
          >
            {/* Overlay layers (cursor, keystrokes, etc.) rendered per clip as children */}
            {/* They now have access to VideoPositionContext! */}
            {visibleFrameLayout.map(({ clip, startFrame, durationFrames }) => {
              return (
                <ClipSequence
                  key={clip.id}
                  clip={clip}
                  effects={effects}
                  videoWidth={videoWidth}
                  videoHeight={videoHeight}
                  renderSettings={renderSettings}
                  startFrame={startFrame}
                  durationFrames={durationFrames}
                  includeBackground={false}
                  includeKeystrokes={!renderSettings.isGlowMode}
                />
              );
            })}

            {/* Glue player is an ambient blur; skip extra overlays to keep preview smooth. */}
            {!renderSettings.isGlowMode && (
              <PluginLayer effects={effects} videoWidth={videoWidth} videoHeight={videoHeight} layer="below-cursor" />
            )}

            {/* Single, timeline-scoped cursor overlay to prevent clip-boundary flicker/idle reset */}
            {!renderSettings.isGlowMode && <CursorLayer effects={effects} videoWidth={videoWidth} videoHeight={videoHeight} metadataUrls={resources.metadataUrls} />}

            {/* Crop editing overlay - uses VideoPositionContext for accurate positioning */}
            {/* Only render on main player (large width) to avoid thumbnail instance conflicts */}
            {useVideoConfig().width > 300 && (
              <CropEditingLayer
                isEditingCrop={renderSettings.isEditingCrop}
                cropData={cropSettings.cropData ?? null}
                onCropChange={cropSettings.onCropChange}
                onCropConfirm={cropSettings.onCropConfirm}
                onCropReset={cropSettings.onCropReset}
              />
            )}
          </SharedVideoController>

          {/* Transition plugins - renders ABOVE everything at composition level (fullscreen transitions) */}
          {!renderSettings.isGlowMode && (
            <PluginLayer effects={effects} videoWidth={videoWidth} videoHeight={videoHeight} layer="above-cursor" />
          )}

          {/* Audio track layer - renders standalone audio clips (imported MP3, WAV, etc.) */}
          {audioClips.map((audioClip) => {
            const recording = recordingMap.get(audioClip.recordingId);
            if (!recording) return null;

            const audioUrl = getAudioUrl(recording, resources.videoFilePaths);
            if (!audioUrl) return null;

            // Calculate frame positions for this audio clip
            const startFrame = Math.round((audioClip.startTime / 1000) * fps);
            const durationFrames = Math.max(1, Math.round((audioClip.duration / 1000) * fps));
            const playbackRate = audioClip.playbackRate || 1;
            const sourceInFrame = Math.round(((audioClip.sourceIn || 0) / 1000) * fps);

            return (
              <Sequence
                key={`audio-${audioClip.id}`}
                from={startFrame}
                durationInFrames={durationFrames}
                name={`Audio ${audioClip.id}`}
              >
                <Audio
                  src={audioUrl}
                  startFrom={sourceInFrame}
                  playbackRate={playbackRate}
                  volume={1}
                />
              </Sequence>
            );
          })}
          </AbsoluteFill>
        </CompositionConfigProvider>
      </PlaybackSettingsProvider>
    </TimeProvider>
  );
};
