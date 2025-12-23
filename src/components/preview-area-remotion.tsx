/**
 * Preview Area - Remotion Player Integration
 *
 * Clean refactored version using TimelineComposition.
 * All clip transitions are handled by Remotion Sequences.
 * 
 * Includes ambient glow effect using a low-res duplicate Player.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Throttled scrubbing: limits seek updates to 8fps during rapid scrubbing
 * - This reduces VTDecoderXPCService memory pressure from continuous decoding
 * - Subscribes directly to project store (not via props) to avoid parent re-renders
 * - Visibility-based pause: stops rendering when window loses focus
 */

'use client';

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { TimelineComposition } from '@/remotion/compositions/TimelineComposition';
import { useProjectStore } from '@/stores/project-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useTimelineMetadata } from '@/hooks/useTimelineMetadata';
import { usePlayerConfiguration } from '@/hooks/usePlayerConfiguration';
import { globalBlobManager } from '@/lib/security/blob-url-manager';
import { CropOverlay } from '@/components/crop-overlay/CropOverlay';
import { useTheme } from '@/contexts/theme-context';
import type { CropEffectData, Recording } from '@/types/project';
type VideoPositionMessagePayload = {
  offsetX: number;
  offsetY: number;
  drawWidth: number;
  drawHeight: number;
  compWidth: number;
  compHeight: number;
};
import { buildFrameLayout } from '@/lib/timeline/frame-layout';
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame';
import { EffectsFactory } from '@/lib/effects/effects-factory';
import { EffectType } from '@/types/project';
import { calculateVideoPosition } from '@/remotion/compositions/utils/video-position';

type TimelineMetadata = ReturnType<typeof useTimelineMetadata>;

// Ambient glow configuration
const GLOW_CONFIG = {
  // Ultra low-res player for memory efficiency
  width: 64,
  height: 36,
  // Glow extends beyond video for elegant spread
  spread: 50,
};

const GLOW_VISUALS = {
  dark: {
    // Softer blur for smooth edges
    blur: 50,
    // More visible but still subtle
    opacity: 0.35,
    // Gentle brightness
    brightness: 0.55,
    // Rich saturation for vibrant colors
    saturation: 1.4,
  },
  light: {
    // Slightly larger blur for airy glow on light surfaces
    blur: 70,
    // Lower opacity to avoid muddy halos
    opacity: 0.18,
    // Lift brightness so glow reads on white
    brightness: 1.1,
    // Gentle saturation to avoid neon on light mode
    saturation: 1.1,
  }
};

// Scrub throttle configuration (reduces video decode pressure)
const SCRUB_THROTTLE_MS = 125; // Max 8 seeks per second during scrubbing

interface PreviewAreaRemotionProps {
  // Crop editing props
  isEditingCrop?: boolean;
  cropData?: CropEffectData | null;
  onCropChange?: (cropData: CropEffectData) => void;
  onCropConfirm?: () => void;
  onCropReset?: () => void;
}

import { useExportStore } from '@/stores/export-store';

export function PreviewAreaRemotion({
  isEditingCrop,
  cropData,
  onCropChange,
  onCropConfirm,
  onCropReset,
}: PreviewAreaRemotionProps) {
  // PERFORMANCE: Subscribe directly to avoid WorkspaceManager re-renders
  const currentTime = useProjectStore((s) => s.currentTime);
  const storeIsPlaying = useProjectStore((s) => s.isPlaying);
  const storePause = useProjectStore((s) => s.pause);
  const isExporting = useExportStore((s) => s.isExporting);

  // PERFORMANCE: Track document visibility - pause when window not focused
  const isDocumentVisible = useRef(true);
  const wasPlayingBeforeHidden = useRef(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';

      if (!visible && storeIsPlaying) {
        // Window hidden while playing - remember and pause
        wasPlayingBeforeHidden.current = true;
        storePause();
      } else if (visible && wasPlayingBeforeHidden.current) {
        // Window visible again - resume if we were playing
        wasPlayingBeforeHidden.current = false;
        // Don't auto-resume - user might have switched apps intentionally
        // They can press play again
      }

      isDocumentVisible.current = visible;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [storeIsPlaying, storePause]);

  // Derive effective isPlaying - pause if document hidden
  const isPlaying = storeIsPlaying && isDocumentVisible.current;
  const playerRef = useRef<PlayerRef>(null);
  const glowPlayerRef = useRef<PlayerRef>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const aspectContainerRef = useRef<HTMLDivElement>(null);

  // Track video rect for crop overlay positioning
  const [videoRect, setVideoRect] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Throttle state for scrub optimization
  const lastSeekTimeRef = useRef<number>(0);
  const pendingSeekRef = useRef<number | null>(null);
  const scrubTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const scrubEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastIsPlayingRef = useRef<boolean>(false);
  const playbackSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const glowPlaybackSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentTimeRef = useRef<number>(currentTime);
  const timelineMetadataRef = useRef<TimelineMetadata | null>(null);
  const lastGlowIsPlayingRef = useRef<boolean>(false);

  const safePlay = useCallback((player: PlayerRef | null, label: string) => {
    if (!player) return;

    try {
      const result: unknown = (player as PlayerRef & { play: () => unknown }).play();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err) => {
          if (err?.name === 'AbortError') return;
          console.warn(`[PreviewAreaRemotion] Failed to play ${label}:`, err);
        });
      }
    } catch (err) {
      console.warn(`[PreviewAreaRemotion] Failed to play ${label}:`, err);
    }
  }, []);

  const project = useProjectStore((s) => s.currentProject);
  const { volume, muted } = useProjectStore((s) => s.settings.audio);
  const cameraSettings = useProjectStore((s) => s.settings.camera);
  const isHighQualityPlaybackEnabled = useWorkspaceStore((s) => s.isHighQualityPlaybackEnabled);
  const isGlowEnabled = useWorkspaceStore((s) => s.isGlowEnabled);
  const { resolvedTheme } = useTheme();
  const glowVisuals = resolvedTheme === 'light' ? GLOW_VISUALS.light : GLOW_VISUALS.dark;

  // Calculate timeline metadata (total duration, fps, dimensions)
  const timelineMetadata = useTimelineMetadata(project);

  // Build player configuration props
  const playerConfig = usePlayerConfiguration(
    project,
    timelineMetadata?.width || 1920,
    timelineMetadata?.height || 1080,
    timelineMetadata?.fps || 30,
    cameraSettings
  );

  // Calculate composition size for preview
  // On Retina displays (DPR >= 2), use higher resolution for crisp keystroke rendering
  const compositionSize = useMemo(() => {
    if (!timelineMetadata) return { width: 1280, height: 720 };

    const videoWidth = timelineMetadata.width;
    const videoHeight = timelineMetadata.height;
    const videoAspectRatio = videoWidth / videoHeight;

    // Preview resolution: 1440p is sufficient for most displays
    // High-quality toggle in settings can enable full resolution if needed
    const maxWidth = 2560;
    const maxHeight = 1440;

    const scaleByWidth = maxWidth / videoWidth;
    const scaleByHeight = maxHeight / videoHeight;
    const scale = Math.min(scaleByWidth, scaleByHeight, 1);

    let width = Math.max(320, Math.round(videoWidth * scale));
    let height = Math.max(180, Math.round(videoHeight * scale));

    if (Math.abs(width / height - videoAspectRatio) > 0.001) {
      height = Math.round(width / videoAspectRatio);
    }

    return { width, height };
  }, [timelineMetadata]);

  // Refs to avoid recreating ResizeObserver on every currentTime change
  const currentTimeForCropRef = useRef(currentTime);
  const timelineMetadataForCropRef = useRef(timelineMetadata);
  const playerConfigForCropRef = useRef(playerConfig);
  const compositionSizeForCropRef = useRef(compositionSize);
  const updateVideoRectRef = useRef<(() => void) | null>(null);
  const compositionVideoPositionRef = useRef<VideoPositionMessagePayload | null>(null);
  const VIDEO_POSITION_MESSAGE = 'screenstudio:video-position';

  // Keep refs in sync
  useEffect(() => {
    currentTimeForCropRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    timelineMetadataForCropRef.current = timelineMetadata;
  }, [timelineMetadata]);

  useEffect(() => {
    playerConfigForCropRef.current = playerConfig;
  }, [playerConfig]);

  useEffect(() => {
    compositionSizeForCropRef.current = compositionSize;
  }, [compositionSize]);

  useEffect(() => {
    if (!isEditingCrop) return;

    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: VideoPositionMessagePayload };
      if (!data || data.type !== VIDEO_POSITION_MESSAGE || !data.payload) return;

      compositionVideoPositionRef.current = data.payload;
      if (updateVideoRectRef.current) {
        updateVideoRectRef.current();
      }
    };

    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
    };
  }, [isEditingCrop]);

  // Track the *actual* rendered video rect for crop overlay positioning.
  // The renderer applies background padding + aspect-fit math; the crop UI must use the same
  // inner draw rect (not the full player container), otherwise the crop numbers won't match.
  useEffect(() => {
    if (!aspectContainerRef.current || !isEditingCrop) return;

    const updateVideoRect = () => {
      const container = aspectContainerRef.current;
      if (!container) return;

      const meta = timelineMetadataForCropRef.current;
      const config = playerConfigForCropRef.current;
      const compSize = compositionSizeForCropRef.current;
      const time = currentTimeForCropRef.current;

      if (!meta || !config) return;

      // DOM size of the player container (what the user sees).
      const rect = container.getBoundingClientRect();
      const domWidth = rect.width;
      const domHeight = rect.height;

      const compositionVideoPosition = compositionVideoPositionRef.current;

      // Composition size used by Remotion Player (logical pixels).
      const compWidth = compositionVideoPosition?.compWidth ?? compSize.width;
      const compHeight = compositionVideoPosition?.compHeight ?? compSize.height;

      if (compWidth <= 0 || compHeight <= 0 || domWidth <= 0 || domHeight <= 0) return;

      let drawWidth = compWidth;
      let drawHeight = compHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (compositionVideoPosition) {
        drawWidth = compositionVideoPosition.drawWidth;
        drawHeight = compositionVideoPosition.drawHeight;
        offsetX = compositionVideoPosition.offsetX;
        offsetY = compositionVideoPosition.offsetY;
      } else {
        // Resolve the active clip/effects at the current preview time so we can apply
        // the same background padding math used by the renderer.
        const sortedClips = [...config.clips].sort((a, b) => a.startTime - b.startTime);
        const frameLayout = buildFrameLayout(sortedClips, meta.fps);
        const currentFrame = Math.round((time / 1000) * meta.fps);
        const active = getActiveClipDataAtFrame({
          frame: currentFrame,
          frameLayout,
          fps: meta.fps,
          effects: config.effects,
          getRecording: (recordingId) => config.recordings.find((r: any) => r.id === recordingId),
        });

        // Background padding is resolved in source-time space (matching SharedVideoController).
        const backgroundEffect = active
          ? EffectsFactory.getActiveEffectAtTime(active.effects, EffectType.Background, active.sourceTimeMs)
          : undefined;
        const backgroundData = backgroundEffect ? EffectsFactory.getBackgroundData(backgroundEffect) : null;
        const padding = backgroundData?.padding || 0;

        // RESOLUTION-AGNOSTIC: Match SharedVideoController's 1080p reference scaling.
        const REFERENCE_WIDTH = 1920;
        const REFERENCE_HEIGHT = 1080;
        const scaleFactor = Math.min(compWidth / REFERENCE_WIDTH, compHeight / REFERENCE_HEIGHT);
        const paddingScaled = padding * scaleFactor;

        const activeSourceWidth = active?.recording.width ?? meta.width;
        const activeSourceHeight = active?.recording.height ?? meta.height;

        // Compute the renderer's draw rect inside the composition coordinate space.
        const position = calculateVideoPosition(
          compWidth,
          compHeight,
          activeSourceWidth,
          activeSourceHeight,
          paddingScaled
        );
        drawWidth = position.drawWidth;
        drawHeight = position.drawHeight;
        offsetX = position.offsetX;
        offsetY = position.offsetY;
      }

      // Map composition coordinates to DOM pixels.
      const scaleX = domWidth / compWidth;
      const scaleY = domHeight / compHeight;

      setVideoRect({
        x: offsetX * scaleX,
        y: offsetY * scaleY,
        width: drawWidth * scaleX,
        height: drawHeight * scaleY,
      });
    };

    // Store ref so we can call it from other effects
    updateVideoRectRef.current = updateVideoRect;

    updateVideoRect();

    const resizeObserver = new ResizeObserver(updateVideoRect);
    resizeObserver.observe(aspectContainerRef.current);

    window.addEventListener('resize', updateVideoRect);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateVideoRect);
      updateVideoRectRef.current = null;
    };
  }, [isEditingCrop]); // Only recreate on isEditingCrop change, not currentTime

  // Update video rect when time/metadata changes (but don't recreate observer)
  useEffect(() => {
    if (isEditingCrop && updateVideoRectRef.current) {
      updateVideoRectRef.current();
    }
  }, [currentTime, isEditingCrop, timelineMetadata, playerConfig, compositionSize.width, compositionSize.height]);

  // Ensure all videos are loaded
  useEffect(() => {
    if (!project?.recordings) return;

    const loadVideos = async () => {
      for (const recording of project.recordings) {
        if (recording.filePath) {
          try {
            await globalBlobManager.loadVideos({
              id: recording.id,
              filePath: recording.filePath,
              folderPath: recording.folderPath
            });
          } catch (error) {
            console.warn(`Failed to load video for recording ${recording.id}:`, error);
          }
        }
      }
    };

    loadVideos();
  }, [project?.recordings]);

  const clampFrame = (frame: number) => {
    if (!timelineMetadata) return Math.max(0, frame);
    const maxFrame = timelineMetadata.durationInFrames - 1;
    return Math.max(0, Math.min(frame, maxFrame));
  };

  const timeToFrame = (timeMs: number) => {
    if (!timelineMetadata) return 0;
    return Math.round((timeMs / 1000) * timelineMetadata.fps);
  };

  // Keep refs in sync for interval callbacks (avoid stale closures causing seeks to old frames).
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    timelineMetadataRef.current = timelineMetadata;
  }, [timelineMetadata]);

  // Throttled seek function to reduce video decode pressure
  const throttledSeek = useCallback((targetFrame: number) => {
    if (!playerRef.current) return;

    const now = Date.now();
    const timeSinceLastSeek = now - lastSeekTimeRef.current;

    // If we're within throttle window, schedule this seek for later
    if (timeSinceLastSeek < SCRUB_THROTTLE_MS) {
      pendingSeekRef.current = targetFrame;

      // Clear existing timeout and set a new one
      if (scrubTimeoutRef.current) {
        clearTimeout(scrubTimeoutRef.current);
      }

      scrubTimeoutRef.current = setTimeout(() => {
        if (pendingSeekRef.current !== null && playerRef.current) {
          try {
            playerRef.current.seekTo(pendingSeekRef.current);
            lastSeekTimeRef.current = Date.now();
          } catch (e) {
            console.warn('Failed to throttled seek:', e);
          }
          pendingSeekRef.current = null;
        }
        scrubTimeoutRef.current = null;
      }, SCRUB_THROTTLE_MS - timeSinceLastSeek);

      return;
    }

    // Seek immediately
    try {
      playerRef.current.seekTo(targetFrame);
      lastSeekTimeRef.current = now;
    } catch (e) {
      console.warn('Failed to seek:', e);
    }
  }, []);

  // Detect scrubbing state and clean up timeouts
  useEffect(() => {
    if (isPlaying) {
      setIsScrubbing(false);
      return;
    }

    // Mark as scrubbing
    setIsScrubbing(true);

    // Clear previous end timeout
    if (scrubEndTimeoutRef.current) {
      clearTimeout(scrubEndTimeoutRef.current);
    }

    // Set timeout to mark end of scrubbing (longer delay to avoid glow player flickering)
    scrubEndTimeoutRef.current = setTimeout(() => {
      setIsScrubbing(false);
    }, 500);

    return () => {
      if (scrubEndTimeoutRef.current) {
        clearTimeout(scrubEndTimeoutRef.current);
      }
    };
  }, [currentTime, isPlaying]);

  // Main player sync effect with throttled scrubbing
  useEffect(() => {
    if (!playerRef.current || !timelineMetadata) return;

    // EXPORT OPTIMIZATION: Pause preview during export
    if (isExporting) {
      try {
        if (playerRef.current) playerRef.current.pause();
        if (glowPlayerRef.current) glowPlayerRef.current.pause();
      } catch (e) {
        // Best-effort pause
      }
      return; // Skip all other sync logic
    }

    const targetFrame = clampFrame(timeToFrame(currentTime));

    if (isPlaying) {
      // Critical performance behavior:
      // Seeking every tick during playback forces the decoder to constantly re-sync and will tank FPS.
      // Only seek once when entering play, then periodically correct drift (if any).
      if (!lastIsPlayingRef.current) {
        try {
          playerRef.current.seekTo(targetFrame);
        } catch (e) {
          console.warn('Failed to seek before play:', e);
        }
      }

      try {
        if (muted) {
          playerRef.current.mute();
        } else {
          playerRef.current.unmute();
        }
        playerRef.current.setVolume(Math.min(volume / 100, 1));
      } catch {
        // Best-effort
      }

      if (!lastIsPlayingRef.current) {
        safePlay(playerRef.current, 'main');
      }

      // Start/update a drift corrector while playing.
      if (!playbackSyncIntervalRef.current) {
        playbackSyncIntervalRef.current = setInterval(() => {
          const player = playerRef.current;
          const meta = timelineMetadataRef.current;
          if (!player || !meta) return;

          try {
            const currentFrame = player.getCurrentFrame();
            const desiredFrame = Math.max(0, Math.min(meta.durationInFrames - 1, Math.round((currentTimeRef.current / 1000) * meta.fps)));
            const drift = desiredFrame - currentFrame;

            // Allow small drift to avoid fighting the player.
            // Only correct forward drift; never seek backwards during playback (can look like rewinding/looping).
            if (drift >= 6) player.seekTo(desiredFrame);
          } catch {
            // Best-effort drift correction only
          }
        }, 750);
      }

      lastIsPlayingRef.current = true;
      return;
    }

    // Stop drift corrector when not playing.
    if (playbackSyncIntervalRef.current) {
      clearInterval(playbackSyncIntervalRef.current);
      playbackSyncIntervalRef.current = null;
    }
    lastIsPlayingRef.current = false;

    // NOT playing - use throttled seeking to reduce decode pressure
    try {
      playerRef.current.pause();
    } catch (e) {
      console.warn('Failed to pause:', e);
    }

    // Throttled seek during scrubbing
    throttledSeek(targetFrame);
  }, [currentTime, isPlaying, timelineMetadata, throttledSeek, isExporting]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (playbackSyncIntervalRef.current) {
        clearInterval(playbackSyncIntervalRef.current);
        playbackSyncIntervalRef.current = null;
      }
      if (glowPlaybackSyncIntervalRef.current) {
        clearInterval(glowPlaybackSyncIntervalRef.current);
        glowPlaybackSyncIntervalRef.current = null;
      }
    };
  }, []);

  // Glow player sync - follows main player but simpler (no audio)
  // OPTIMIZATION: Skip glow updates during active scrubbing to reduce decode pressure
  useEffect(() => {
    if (!glowPlayerRef.current || !timelineMetadata) return;

    // Skip glow player updates during active scrubbing to save memory
    if (isScrubbing && !isPlaying) {
      // Just pause the glow player during scrubbing
      try {
        if (glowPlaybackSyncIntervalRef.current) {
          clearInterval(glowPlaybackSyncIntervalRef.current);
          glowPlaybackSyncIntervalRef.current = null;
        }
        lastGlowIsPlayingRef.current = false;
        glowPlayerRef.current.pause();
      } catch {
        // Non-critical
      }
      return;
    }

    const targetFrame = clampFrame(timeToFrame(currentTime));

    try {
      if (isPlaying) {
        if (!lastGlowIsPlayingRef.current) {
          glowPlayerRef.current.seekTo(targetFrame);
          safePlay(glowPlayerRef.current, 'glow');
        }

        if (!glowPlaybackSyncIntervalRef.current) {
          glowPlaybackSyncIntervalRef.current = setInterval(() => {
            const player = glowPlayerRef.current;
            const meta = timelineMetadataRef.current;
            if (!player || !meta) return;

            try {
              const currentFrame = player.getCurrentFrame();
              const desiredFrame = Math.max(0, Math.min(meta.durationInFrames - 1, Math.round((currentTimeRef.current / 1000) * meta.fps)));
              const drift = desiredFrame - currentFrame;
              if (drift >= 6) player.seekTo(desiredFrame);
            } catch {
              // Best-effort drift correction only
            }
          }, 750);
        }
        lastGlowIsPlayingRef.current = true;
      } else {
        if (glowPlaybackSyncIntervalRef.current) {
          clearInterval(glowPlaybackSyncIntervalRef.current);
          glowPlaybackSyncIntervalRef.current = null;
        }
        lastGlowIsPlayingRef.current = false;
        glowPlayerRef.current.pause();
        glowPlayerRef.current.seekTo(targetFrame);
      }
    } catch {
      // Glow player errors are non-critical
    }
  }, [currentTime, isPlaying, timelineMetadata, isScrubbing]);

  // Sync volume/mute changes
  useEffect(() => {
    if (!playerRef.current) return;

    try {
      if (muted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unmute();
      }
      playerRef.current.setVolume(Math.min(volume / 100, 1));
    } catch (e) {
      console.warn('Failed to update volume:', e);
    }
  }, [volume, muted]);

  // Calculate initial frame
  const initialFrame = useMemo(() => {
    if (!timelineMetadata) return 0;
    return clampFrame(timeToFrame(currentTime));
  }, [currentTime, timelineMetadata]);

  // Player key for re-render on clip changes
  const playerKey = useMemo(() => {
    const clips = project?.timeline.tracks.flatMap(t => t.clips) || [];
    return clips.map(c => `${c.id}:${c.startTime}:${c.duration}:${c.sourceIn}:${c.sourceOut}`).join('|');
  }, [project?.timeline.tracks]);

  // Show loading state if no data
  if (!timelineMetadata || !playerConfig) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-transparent">
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="text-gray-500 text-center">
            <p className="text-lg font-medium mb-2">No timeline data</p>
            <p className="text-sm">Create or select a project to preview</p>
          </div>
        </div>
      </div>
    );
  }

  // CRITICAL FIX: Memoize inputProps to prevent Remotion from re-mounting composition tree
  // Previously, spreading playerConfig with new values created new object reference every render,
  // causing VideoClipRenderer to unmount/remount on every state change (VTDecoder memory leak)
  const mainPlayerInputProps = useMemo(() => ({
    ...playerConfig,
    isEditingCrop: Boolean(isEditingCrop),
    isHighQualityPlaybackEnabled,
    isScrubbing,
    isPlaying,
    previewMuted: muted,
    previewVolume: Math.min(volume / 100, 1),
  }), [playerConfig, isEditingCrop, isHighQualityPlaybackEnabled, isScrubbing, isPlaying, muted, volume]);

  const glowPlayerInputProps = useMemo(() => ({
    ...playerConfig,
    isEditingCrop: Boolean(isEditingCrop),
    isGlowMode: true,
    enhanceAudio: false,
    isPlaying,
    previewMuted: true,
    previewVolume: 0,
  }), [playerConfig, isEditingCrop, isPlaying]);

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
          /* Aspect Ratio Container */
          <div
            ref={aspectContainerRef}
            className="relative w-full max-w-full max-h-full"
            style={{
              aspectRatio: `${timelineMetadata.width} / ${timelineMetadata.height}`,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            {/* Ambient Glow - Low-res Player behind main player */}
            {/* Toggle via Utilities > Editing > Ambient Glow */}
            {isGlowEnabled && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `calc(100% + ${GLOW_CONFIG.spread * 2}px)`,
                  height: `calc(100% + ${GLOW_CONFIG.spread * 2}px)`,
                  transform: 'translate(-50%, -50%) translateZ(0)',
                  filter: `blur(${glowVisuals.blur}px) brightness(${glowVisuals.brightness}) saturate(${glowVisuals.saturation})`,
                  opacity: glowVisuals.opacity,
                  zIndex: 0,
                  borderRadius: 32,
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  mixBlendMode: resolvedTheme === 'light' ? 'screen' : 'normal',
                }}
              >
                <Player
                  key={`glow-${playerKey}`}
                  ref={glowPlayerRef}
                  component={TimelineComposition as any}
                  inputProps={glowPlayerInputProps as any}
                  durationInFrames={timelineMetadata.durationInFrames}
                  compositionWidth={GLOW_CONFIG.width}
                  compositionHeight={GLOW_CONFIG.height}
                  fps={timelineMetadata.fps}
                  initialFrame={initialFrame}
                  initiallyMuted={true}
                  style={{
                    width: '100%',
                    height: '100%',
                  }}
                  controls={false}
                  loop={false}
                  clickToPlay={false}
                  doubleClickToFullscreen={false}
                  spaceKeyToPlayOrPause={false}
                  alwaysShowControls={false}
                  initiallyShowControls={false}
                  showPosterWhenPaused={false}
                  showPosterWhenUnplayed={false}
                  showPosterWhenEnded={false}
                  moveToBeginningWhenEnded={false}
                  renderLoading={() => null}
                  errorFallback={() => null}
                />
              </div>
            )}

            {/* Main Player Container */}
            <div
              ref={playerContainerRef}
              className="absolute inset-0 w-full h-full"
              style={{ zIndex: 10 }}
            >
              <style dangerouslySetInnerHTML={{
                __html: `
              .__remotion-player {
                border-radius: 12px !important;
                overflow: hidden !important;
                mask-image: radial-gradient(white, black);
                -webkit-mask-image: -webkit-radial-gradient(white, black);
              }
            `}} />
              <Player
                key={playerKey}
                ref={playerRef}
                component={TimelineComposition as any}
                inputProps={mainPlayerInputProps as any}
                durationInFrames={timelineMetadata.durationInFrames}
                compositionWidth={compositionSize.width}
                compositionHeight={compositionSize.height}
                fps={timelineMetadata.fps}
                initialFrame={initialFrame}
                initiallyMuted={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  zIndex: 10,
                }}
                controls={false}
                loop={false}
                clickToPlay={false}
                doubleClickToFullscreen={false}
                spaceKeyToPlayOrPause={false}
                alwaysShowControls={false}
                initiallyShowControls={false}
                showPosterWhenPaused={false}
                showPosterWhenUnplayed={false}
                showPosterWhenEnded={false}
                moveToBeginningWhenEnded={false}
                renderLoading={() => (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-sm text-muted-foreground">Loading preview...</div>
                  </div>
                )}
                errorFallback={({ error }: { error: Error }) => {
                  console.error('Remotion Player error:', error);
                  return (
                    <div className="flex items-center justify-center h-full bg-red-50 dark:bg-red-900/20 p-4">
                      <div className="text-center">
                        <p className="text-red-600 dark:text-red-400 font-medium">
                          Video playback error
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Please try reloading the video
                        </p>
                      </div>
                    </div>
                  );
                }}
              />
            </div>


            {/* Crop Overlay */}
            {isEditingCrop && cropData && onCropChange && onCropConfirm && onCropReset && (
              <CropOverlay
                cropData={cropData}
                onCropChange={onCropChange}
                onConfirm={onCropConfirm}
                onReset={onCropReset}
                videoRect={videoRect}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
