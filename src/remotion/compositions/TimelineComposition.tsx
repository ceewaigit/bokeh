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
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Recording, Effect } from '@/types/project';
import { EffectType } from '@/types/project';
import type { TimelineCompositionProps, VideoUrlMap } from '@/types';
import { TimeProvider } from '../context/timeline/TimeContext';
import { PlaybackSettingsProvider } from '../context/playback/PlaybackSettingsContext';
import { CompositionConfigProvider } from '../context/CompositionConfigContext';
import { ClipSequence } from './ClipSequence';
import { SharedVideoController } from './SharedVideoController';
import { findActiveFrameLayoutItems } from '@/lib/timeline/frame-layout';
import { CursorLayer } from './layers/CursorLayer';
import { PluginLayer } from './layers/PluginLayer';
import { CropEditingLayer } from './layers/CropEditingLayer';
import { WebcamLayer } from './layers/WebcamLayer';
import { RecordingStorage } from '@/lib/storage/recording-storage';
import { VideoDataProvider, useVideoData } from '../context/video-data-context';
import { useVideoUrl } from '../hooks/media/useVideoUrl';

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
 * Timeline Composition Content
 * Consumes context providers and handles rendering logic.
 */
const TimelineCompositionContent: React.FC<TimelineCompositionProps> = ({
  videoWidth,
  videoHeight,
  backgroundColor,
  effects,
  cameraSettings,
  resources,
  playback,
  renderSettings,
  cropSettings,
  audioClips = [],
  webcamClips = [],
  fps,
  sourceVideoWidth,
  sourceVideoHeight,
}) => {
  const frame = useCurrentFrame();
  const { frameLayout, getActiveLayoutItems, getRecording } = useVideoData(); // Remove fps from here
  const currentTimeMs = (frame / fps) * 1000;

  // Find active webcam EFFECT by time (effect timing is the single source of truth)
  const activeWebcamEffect = React.useMemo(() => {
    return effects.find((e): e is Effect & { type: typeof EffectType.Webcam } =>
      e.type === EffectType.Webcam &&
      e.enabled !== false &&
      currentTimeMs >= e.startTime &&
      currentTimeMs < e.endTime
    ) ?? null;
  }, [effects, currentTimeMs]);

  // Get webcam clip for recordingId only (not for timing)
  const activeWebcamClip = React.useMemo(() => {
    if (!activeWebcamEffect || !webcamClips.length) {
      return null;
    }
    // Warn if multiple webcam clips - helps identify unexpected state
    if (webcamClips.length > 1) {
      console.warn(`[TimelineComposition] Multiple webcam clips found (${webcamClips.length}), using first one`);
    }
    return webcamClips[0];
  }, [activeWebcamEffect, webcamClips]);

  const activeWebcamRecording = activeWebcamClip
    ? getRecording(activeWebcamClip.recordingId)
    : undefined;
  const webcamVideoUrl = useVideoUrl({
    recording: activeWebcamRecording,
    resources,
    clipId: activeWebcamClip?.id,
    targetWidth: videoWidth,
    targetHeight: videoHeight,
    isHighQualityPlaybackEnabled: playback.isHighQualityPlaybackEnabled,
  });


  // STABILITY: Track previous visible items to prevent unnecessary remounts
  const prevVisibleIdsRef = React.useRef<string>('');
  const prevVisibleLayoutRef = React.useRef<ReturnType<typeof findActiveFrameLayoutItems>>([]);

  // Performance: Only render per-clip layers for clips active at the current frame.
  const visibleFrameLayout = React.useMemo(() => {
    if (!frameLayout || frameLayout.length === 0) return [];

    // Find ALL clips active at the current frame using Context helper
    const activeItems = getActiveLayoutItems(frame);

    // Optimized loop for fade persistence
    const items = [...activeItems];
    const activeIds = new Set(activeItems.map(i => i.clip.id));

    for (const item of activeItems) {
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
    const currentIds = items.map(i => i.clip.id).sort().join(',');
    if (currentIds === prevVisibleIdsRef.current) {
      return prevVisibleLayoutRef.current;
    }

    prevVisibleIdsRef.current = currentIds;
    prevVisibleLayoutRef.current = items;
    return items;
  }, [frameLayout, fps, frame, getActiveLayoutItems]);

  return (
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
        sourceVideoWidth={sourceVideoWidth ?? videoWidth}
        sourceVideoHeight={sourceVideoHeight ?? videoHeight}
        cameraSettings={cameraSettings}
        playback={playback}
        renderSettings={renderSettings}
        cropSettings={cropSettings}
      >
        {/* Overlay layers (cursor, keystrokes, etc.) rendered per clip as children */}
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

        <WebcamLayer
          effects={effects}
          webcamEffect={activeWebcamEffect ?? undefined}
          webcamVideoUrl={webcamVideoUrl}
          webcamClip={activeWebcamClip ?? undefined}
          webcamRecording={activeWebcamRecording ?? undefined}
        />

        {/* Glue player is an ambient blur; skip extra overlays to keep preview smooth. */}
        {!renderSettings.isGlowMode && (
          <PluginLayer effects={effects} videoWidth={videoWidth} videoHeight={videoHeight} layer="below-cursor" />
        )}

        {/* Single, timeline-scoped cursor overlay to prevent clip-boundary flicker/idle reset */}
        {!renderSettings.isGlowMode && <CursorLayer effects={effects} videoWidth={videoWidth} videoHeight={videoHeight} metadataUrls={resources.metadataUrls} />}

        {/* Crop editing overlay - uses VideoPositionContext for accurate positioning */}
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
        const recording = getRecording(audioClip.recordingId);
        if (!recording) return null;

        const audioUrl = getAudioUrl(recording, resources.videoFilePaths);
        if (!audioUrl) return null;

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
  );
};

/**
 * Timeline Composition - Top-level wrapper
 * Configures all providers and renders content.
 */
export const TimelineComposition: React.FC<TimelineCompositionProps> = (props) => {
  const {
    clips,
    recordings,
    effects,
    videoWidth,
    videoHeight,
    sourceVideoWidth,
    sourceVideoHeight,
    fps,
    resources,
    playback,
    renderSettings,
    cropSettings,
    zoomSettings,
  } = props;

  // FAIL-FAST validations
  if (!resources) throw new Error('[TimelineComposition] Missing required prop: resources');
  if (!playback) throw new Error('[TimelineComposition] Missing required prop: playback');
  if (!renderSettings) throw new Error('[TimelineComposition] Missing required prop: renderSettings');
  if (!cropSettings) throw new Error('[TimelineComposition] Missing required prop: cropSettings');
  if (!zoomSettings) throw new Error('[TimelineComposition] Missing required prop: zoomSettings');

  const { width: compositionWidth, height: compositionHeight } = useVideoConfig();

  // Sort clips by start time for consistent rendering (passed to VideoDataProvider)
  const sortedClips = React.useMemo(() => {
    return [...clips].sort((a, b) => a.startTime - b.startTime);
  }, [clips]);

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
          <VideoDataProvider clips={sortedClips} recordings={recordings} effects={effects} fps={fps}>
            <TimelineCompositionContent {...props} />
          </VideoDataProvider>
        </CompositionConfigProvider>
      </PlaybackSettingsProvider>
    </TimeProvider>
  );
};
