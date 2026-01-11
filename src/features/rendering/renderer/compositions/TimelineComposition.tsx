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
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion';
import type { Clip, Effect, Recording, SourceTimeRange, SubtitleEffectData, TranscriptWord } from '@/types/project';
import { EffectType } from '@/types/project';
import type { TimelineCompositionProps, VideoUrlMap } from '@/types';
import { PlaybackSettingsProvider } from '../context/playback/PlaybackSettingsContext';
import { ClipSequence } from './ClipSequence';
import { SharedVideoController } from './SharedVideoController';
import { CursorLayer } from '@/features/effects/cursor/components/CursorLayer';
import { PluginLayer } from './layers/PluginLayer';
import { WebcamClipRenderer } from './renderers/WebcamClipRenderer';
import { SubtitleLayer } from './layers/SubtitleLayer';
import { WatermarkLayer } from '@/features/effects/watermark';

import { ProjectStorage } from '@/features/core/storage/project-storage';
import { resolveRecordingPath, createVideoStreamUrl } from '@/features/media/recording/components/library/utils/recording-paths';
import { useTimelineContext } from '../context/TimelineContext';
import { findActiveFrameLayoutItems } from '@/features/ui/timeline/utils/frame-layout';
import { TimelineProvider } from '../context/TimelineContext';
import { useProjectStore } from '@/features/core/stores/project-store';
import { calculateFullCameraPath } from '@/features/ui/editor/logic/viewport/logic/path-calculator';
import { OverlayProvider } from '@/features/rendering/overlays/overlay-context';
import { resolveOverlayConflicts } from '@/features/rendering/overlays/position-registry';
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service';
import { timelineToSource } from '@/features/ui/timeline/time/time-space-converter';
import { findSubtitleWordIndex, getVisibleSubtitleWords } from '@/features/rendering/overlays/subtitle-words';

/**
 * Get audio URL for a recording
 */
function getAudioUrl(recording: Recording, videoFilePaths?: VideoUrlMap): string | undefined {
  // Priority 1: Direct file path for export
  if (videoFilePaths && videoFilePaths[recording.id]) {
    return videoFilePaths[recording.id];
  }

  // Priority 2: Cached blob URL
  const cachedUrl = ProjectStorage.getBlobUrl(recording.id);
  if (cachedUrl) {
    return cachedUrl;
  }

  // Priority 3: video-stream protocol
  const resolvedPath = resolveRecordingPath(recording);
  if (resolvedPath) {
    if (resolvedPath.startsWith('video-stream://')) return resolvedPath;
    return createVideoStreamUrl(resolvedPath);
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
  globalSkipRanges = [],
  clips,
  recordings,
}) => {
  const frame = useCurrentFrame();
  const { frameLayout, getActiveLayoutItems, getRecording } = useTimelineContext(); // Remove fps from here
  const currentTimeMs = (frame / fps) * 1000;
  const project = useProjectStore(s => s.currentProject);

  // Global Timeline Mask: Calculate opacity (0 if skipped, 1 otherwise)
  const isSkipped = React.useMemo(() => {
    return TimelineDataService.isTimeInSkipRange(currentTimeMs, globalSkipRanges)
  }, [currentTimeMs, globalSkipRanges]);
  const visibilityOpacity = isSkipped ? 0 : 1;

  const hasActiveTranscript = React.useMemo(() => {
    return effects.some(effect => {
      if (effect.type !== EffectType.Subtitle) return false
      const data = effect.data as { recordingId?: string } | undefined
      if (!data?.recordingId) return false
      const recording = getRecording(data.recordingId)
      return Boolean(recording?.metadata?.transcript?.words?.length)
    })
  }, [effects, getRecording]);

  // PERFORMANCE: Quantize time to 100ms buckets for overlay calculations
  // This reduces recalculation from 60x/sec to 10x/sec while maintaining smooth playback
  const quantizedTimeMs = React.useMemo(() => {
    return Math.floor(currentTimeMs / 100) * 100;
  }, [currentTimeMs]);

  const subtitleResolutionContext = React.useMemo(() => {
    const subtitleEffects = effects.filter(
      (effect): effect is Effect =>
        effect.type === EffectType.Subtitle && effect.enabled !== false
    );

    const recordingIds = Array.from(
      new Set(
        subtitleEffects
          .map(e => (e.data as SubtitleEffectData | undefined)?.recordingId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    if (recordingIds.length === 0) return null;

    const timelineClips: Clip[] = project
      ? project.timeline.tracks.flatMap(track => track.clips)
      : [
        ...(clips ?? []),
        ...(audioClips ?? []),
        ...(webcamClips ?? []),
      ];

    const clipsByRecordingId = new Map<string, Clip[]>();
    const clipById = new Map<string, Clip>();

    for (const clip of timelineClips) {
      clipById.set(clip.id, clip);
      if (!recordingIds.includes(clip.recordingId)) continue;
      const list = clipsByRecordingId.get(clip.recordingId) ?? [];
      list.push(clip);
      clipsByRecordingId.set(clip.recordingId, list);
    }

    const hiddenRegionsByRecordingId = new Map<string, SourceTimeRange[]>();
    const visibleWordsByRecordingId = new Map<string, TranscriptWord[]>();

    for (const recordingId of recordingIds) {
      let hiddenRegions: SourceTimeRange[] = [];

      if (project) {
        hiddenRegions = TimelineDataService.getHiddenRegionsForRecording(project, recordingId);
      } else if (globalSkipRanges.length > 0) {
        const rangesForRecording = globalSkipRanges.filter(r => r.recordingId === recordingId);
        const converted = rangesForRecording
          .map((range): SourceTimeRange | null => {
            const clip = clipById.get(range.clipId);
            if (!clip) return null;
            const sourceStart = timelineToSource(range.start, clip);
            const sourceEnd = timelineToSource(range.end, clip);
            if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceEnd <= sourceStart) return null;
            return { startTime: sourceStart, endTime: sourceEnd };
          })
          .filter((r): r is SourceTimeRange => r !== null)
          .sort((a, b) => a.startTime - b.startTime);

        const merged: SourceTimeRange[] = [];
        for (const region of converted) {
          const prev = merged[merged.length - 1];
          if (!prev || region.startTime > prev.endTime) {
            merged.push(region);
          } else {
            prev.endTime = Math.max(prev.endTime, region.endTime);
          }
        }
        hiddenRegions = merged;
      }

      hiddenRegionsByRecordingId.set(recordingId, hiddenRegions);

      const recording = getRecording(recordingId) ?? (recordings.find(r => r.id === recordingId) as Recording | undefined);
      const words = recording?.metadata?.transcript?.words ?? [];
      visibleWordsByRecordingId.set(recordingId, getVisibleSubtitleWords(words, hiddenRegions));
    }

    return { clipsByRecordingId, visibleWordsByRecordingId };
  }, [effects, audioClips, webcamClips, clips, recordings, getRecording, globalSkipRanges, project]);

  // Get webcam clip that is active at the current time
  // This uses the "Virtual Clips" (transcript-aware) passed from usePlayerConfiguration
  // NOTE: Use precise currentTimeMs (not quantizedTimeMs) to prevent edge-case disappearances
  // at clip boundaries. Quantization is fine for overlay conflict resolution but webcam
  // visibility requires frame-accurate timing.
  const activeWebcamClip = React.useMemo(() => {
    if (!webcamClips.length) return null;

    // Find the webcam clip that overlaps with current time
    return webcamClips.find(clip => {
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;
      return currentTimeMs >= clipStart && currentTimeMs < clipEnd;
    }) ?? null;
  }, [webcamClips, currentTimeMs]);

  const { displacedEffectIds, resolvedAnchors } = React.useMemo(
    () => {
      const isSubtitleVisibleAtTime = subtitleResolutionContext
        ? (effect: Effect, timeMs: number) => {
          if (effect.type !== EffectType.Subtitle) return true;
          const data = effect.data as SubtitleEffectData | undefined;
          const recordingId = data?.recordingId;
          if (!recordingId) return false;

          const candidates = subtitleResolutionContext.clipsByRecordingId.get(recordingId) ?? [];
          const activeClip = candidates.find(clip => {
            const start = clip.startTime;
            const end = start + clip.duration;
            return timeMs >= start && timeMs < end;
          });
          if (!activeClip) return false;

          const visibleWords = subtitleResolutionContext.visibleWordsByRecordingId.get(recordingId) ?? [];
          if (visibleWords.length === 0) return false;

          const sourceTimeMs = timelineToSource(timeMs, activeClip);
          return findSubtitleWordIndex(visibleWords, sourceTimeMs) !== -1;
        }
        : undefined;

      return resolveOverlayConflicts(effects, quantizedTimeMs, {
        hasActiveTranscript,
        activeWebcamClip,
        isSubtitleVisibleAtTime
      });
    },
    [effects, quantizedTimeMs, hasActiveTranscript, activeWebcamClip, subtitleResolutionContext]
  );

  // Timeline-Centric Architecture:
  // Webcam styling comes from clip.layout (set at import time)
  // No need to lookup webcam effects - the clip IS the source of truth

  const { isRendering } = getRemotionEnvironment();
  const visibleAudioClips = React.useMemo(() => {
    if (isRendering || audioClips.length === 0) {
      return audioClips;
    }
    const paddingFrames = Math.max(1, Math.ceil(fps * 0.1));
    return audioClips.filter((audioClip) => {
      const startFrame = Math.round((audioClip.startTime / 1000) * fps);
      const durationFrames = Math.max(1, Math.round((audioClip.duration / 1000) * fps));
      const endFrame = startFrame + durationFrames;
      return frame >= startFrame - paddingFrames && frame < endFrame + paddingFrames;
    });
  }, [audioClips, frame, fps, isRendering]);


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

  // ROBUST CAMERA PATH RESOLUTION:
  // 1. Try Store Cache (Editor/Preview mode - reactive to edits)
  // 2. Fallback to calculation (Export/Headless mode - static)
  // This explicitly guarantees a valid camera path exists before children render.
  const cachedPath = useProjectStore(s => s.cameraPathCache);

  const cameraPath = React.useMemo(() => {
    if (cachedPath) return cachedPath;

    // Export Mode: Calculate on the fly using exact SSOT logic
    // Note: frameLayout is already computed by Context
    return calculateFullCameraPath({
      frameLayout,
      fps,
      videoWidth,
      videoHeight,
      sourceVideoWidth,
      sourceVideoHeight,
      effects,
      getRecording,
      // During export, metadata loading is handled by resolution or passed via props. 
      // TimelineComposition doesn't have direct access to 'loadedMetadata' map from store easily 
      // but 'getRecording' might return enriched recordings with metadata if the provider does its job.
      // In export-handler, we saw `downsampleRecordingMetadata` populates metadata on the recording object itself.
      // `calculateFullCameraPath` usage of `loadedMetadata` map is optional if recording.metadata is present.
      loadedMetadata: undefined,
      cameraSettings: cameraSettings
    });
  }, [cachedPath, frameLayout, fps, videoWidth, videoHeight, sourceVideoWidth, sourceVideoHeight, effects, getRecording, cameraSettings]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: backgroundColor ?? '#000',
      }}
    >
      {/* Background layer must be below the video. Render per-clip to support parallax (mouse-driven) backgrounds. */}
      {/* NOTE: Background always renders - skip ranges affect playback timing, not visual rendering */}
      <AbsoluteFill style={{ zIndex: 0 }}>
        {visibleFrameLayout.map(({ clip, startFrame, durationFrames }) => {
          return (
            <ClipSequence
              key={`bg-${clip.id}`}
              clip={clip}
              startFrame={startFrame}
              durationFrames={durationFrames}
              includeBackground={true}
              includeKeystrokes={false}
            />
          );
        })}
      </AbsoluteFill>

      <OverlayProvider value={React.useMemo(() => ({ displacedEffectIds, resolvedAnchors }), [displacedEffectIds, resolvedAnchors])}>
        <SharedVideoController
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          sourceVideoWidth={sourceVideoWidth ?? videoWidth}
          sourceVideoHeight={sourceVideoHeight ?? videoHeight}
          cameraSettings={cameraSettings}
          playback={playback}
          renderSettings={renderSettings}
          cropSettings={cropSettings}
          cameraPath={cameraPath}
        >
          {/* Global Mask Wrapper for Content - NOTE: Video always renders, skip ranges only affect playback timing */}
          <div style={{ width: '100%', height: '100%' }}>
            {/* Overlay layers (cursor, keystrokes, etc.) rendered per clip as children */}
            {!renderSettings.isGlowMode && visibleFrameLayout.map(({ clip, startFrame, durationFrames }) => {
              return (
                <ClipSequence
                  key={clip.id}
                  clip={clip}
                  startFrame={startFrame}
                  durationFrames={durationFrames}
                  includeBackground={false}
                  includeKeystrokes={true}
                />
              );
            })}

            {/* Webcam clips: Per-clip rendering with stable Sequences
                Each clip gets its own Video element with stable timing, matching VideoClipRenderer architecture.
                This prevents unmount/remount issues when switching between clips. */}
            {!renderSettings.isGlowMode && webcamClips.map((clip) => {
              const recording = getRecording(clip.recordingId);
              if (!recording) return null;
              return (
                <WebcamClipRenderer
                  key={clip.id}
                  clip={clip}
                  recording={recording}
                  resources={resources}
                  playback={playback}
                  fps={fps}
                  globalOpacity={visibilityOpacity}
                />
              );
            })}

            {/* Glue player is an ambient blur; skip extra overlays to keep preview smooth. */}
            {!renderSettings.isGlowMode && (
              <PluginLayer layer="below-cursor" />
            )}

            {/* Single, timeline-scoped cursor overlay to prevent clip-boundary flicker/idle reset */}
            {!renderSettings.isGlowMode && <CursorLayer />}

            {!renderSettings.isGlowMode && <SubtitleLayer />}

            {/* Transition plugins - renders ABOVE everything at composition level (fullscreen transitions) */}
            {!renderSettings.isGlowMode && (
              <PluginLayer layer="above-cursor" />
            )}

            {!renderSettings.isGlowMode && <WatermarkLayer />}
          </div>
        </SharedVideoController>
      </OverlayProvider>


      {/* Audio track layer - renders standalone audio clips (imported MP3, WAV, etc.) */}
      {visibleAudioClips.map((audioClip) => {
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
 *
 * Provider hierarchy (simplified from 4 to 3):
 * - CompositionProvider: dimensions, fps, clips, recordings, resources (SSOT)
 * - PlaybackSettingsProvider: playback state, render settings
 * - VideoDataProvider: computed frame layout, clip accessors
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

  return (
    <TimelineProvider
      compositionWidth={compositionWidth}
      compositionHeight={compositionHeight}
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      sourceVideoWidth={sourceVideoWidth}
      sourceVideoHeight={sourceVideoHeight}
      fps={fps}
      clips={clips}
      recordings={recordings}
      effects={effects}
      resources={resources}
    >
      <PlaybackSettingsProvider
        playback={playback}
        renderSettings={renderSettings}
        resources={resources}
      >
        <TimelineCompositionContent {...props} />
      </PlaybackSettingsProvider>
    </TimelineProvider>
  );
};
