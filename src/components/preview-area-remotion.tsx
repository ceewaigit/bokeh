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
import { useTheme } from '@/contexts/theme-context';
import { msToFrame } from '@/remotion/compositions/utils/frame-time';
import type { CropEffectData, Recording } from '@/types/project';

import { AmbientGlowPlayer } from './preview/ambient-glow-player';

type TimelineMetadata = ReturnType<typeof useTimelineMetadata>;



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
  // WARNING: Do NOT subscribe to currentTime here. It updates 60fps and will re-render this entire tree.
  // Instead, read it directly from the store ref during sync intervals.
  const storeIsPlaying = useProjectStore((s) => s.isPlaying);
  const storePause = useProjectStore((s) => s.pause);
  const storeSeek = useProjectStore((s) => s.seek);  // For syncing store FROM player
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
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const aspectContainerRef = useRef<HTMLDivElement>(null);

  // Throttle state for scrub optimization
  const lastSeekTimeRef = useRef<number>(0);
  const pendingSeekRef = useRef<number | null>(null);
  const scrubTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // SSOT FIX: isScrubbing removed - same code path for play and scrub
  const isScrubbing = false;
  const lastIsPlayingRef = useRef<boolean>(false);
  const playbackSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // No longer tracking currentTime via prop to avoid re-renders.
  // Access it directly from store when needed.
  const timelineMetadataRef = useRef<TimelineMetadata | null>(null);

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


  // Calculate timeline metadata (total duration, fps, dimensions)
  const timelineMetadata = useTimelineMetadata(project);

  // Build partial player configuration props
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

  // SSOT: Use centralized frame calculation for consistent rounding
  const timeToFrame = (timeMs: number) => {
    if (!timelineMetadata) return 0;
    return msToFrame(timeMs, timelineMetadata.fps);
  };

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

  // SSOT: frameupdate event listener - the TRUE source of truth sync
  // Remotion Player fires this on EVERY frame change (playback and seeking)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !timelineMetadata) return;

    const handleFrameUpdate = (e: { detail: { frame: number } }) => {
      // Only sync during playback - scrub sync is handled separately
      if (!useProjectStore.getState().isPlaying) return;

      const frame = e.detail.frame;
      const timeMs = (frame / timelineMetadata.fps) * 1000;
      storeSeek(timeMs);
    };

    player.addEventListener('frameupdate', handleFrameUpdate as any);

    return () => {
      player.removeEventListener('frameupdate', handleFrameUpdate as any);
    };
  }, [timelineMetadata, storeSeek]);

  // Main player sync effect with throttled scrubbing
  useEffect(() => {
    if (!playerRef.current || !timelineMetadata) return;

    // EXPORT OPTIMIZATION: Pause preview during export
    if (isExporting) {
      try {
        if (playerRef.current) playerRef.current.pause();
      } catch (e) {
        // Best-effort pause
      }
      return; // Skip all other sync logic
    }

    // Direct store access
    const currentTimeMs = useProjectStore.getState().currentTime;
    const targetFrame = clampFrame(timeToFrame(currentTimeMs));

    if (isPlaying) {
      // Critical performance behavior:
      // Seeking every tick during playback forces the decoder to constantly re-sync and will tank FPS.
      // Only seek once when entering play, then periodically sync store FROM player.
      if (!lastIsPlayingRef.current) {
        try {
          // SSOT: Get player's current frame and compare to store
          const playerFrame = playerRef.current.getCurrentFrame();
          const currentStoreTime = useProjectStore.getState().currentTime;
          const storeFrame = clampFrame(timeToFrame(currentStoreTime));

          // Only seek if there's a significant difference
          if (Math.abs(playerFrame - storeFrame) > 1) {
            playerRef.current.seekTo(storeFrame);
          }
        } catch (e) {
          console.warn('Failed to sync before play:', e);
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
        // Start playback
        safePlay(playerRef.current, 'main');
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

    // Need to subscribe to time updates manually since we removed the prop
    const unsubscribe = useProjectStore.subscribe((state) => {
      if (!state.isPlaying && !isExporting) {
        const time = state.currentTime;
        const frame = clampFrame(timeToFrame(time));
        throttledSeek(frame);
      }
    });

    // Initial seek to current time
    throttledSeek(targetFrame);

    return () => {
      unsubscribe();
    }
  }, [isPlaying, timelineMetadata, throttledSeek, isExporting, isGlowEnabled]); // Removed currentTime

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (playbackSyncIntervalRef.current) {
        clearInterval(playbackSyncIntervalRef.current);
        playbackSyncIntervalRef.current = null;
      }
    };
  }, []);

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
  // Only needs to run once or when metadata changes
  const initialFrame = useMemo(() => {
    if (!timelineMetadata) return 0;
    const storeTime = useProjectStore.getState().currentTime;
    return clampFrame(timeToFrame(storeTime));
  }, [timelineMetadata]); // Removed currentTime

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

  // Memoize inputProps using the new structure for TimelineComposition
  const mainPlayerInputProps = useMemo(() => {
    return {
      ...playerConfig,
      // Group: PlaybackSettings
      playback: {
        isPlaying,
        isScrubbing,
        isHighQualityPlaybackEnabled,
        previewMuted: muted,
        previewVolume: Math.min(volume / 100, 1),
      },
      // Group: RenderSettings
      renderSettings: {
        isGlowMode: false,
        preferOffthreadVideo: false, // Preview uses <img>/native video not offthread canvas usually? Or maybe true/false depends. VideoClipRenderer uses it.
        // Actually for preview we usually want low overhead.
        enhanceAudio: playerConfig.enhanceAudio, // enhanceAudio is in playerConfig? Yes.
        isEditingCrop: Boolean(isEditingCrop),
      },
      // Group: CropSettings
      cropSettings: {
        cropData,
        onCropChange,
        onCropConfirm,
        onCropReset,
      },
      // Group: VideoResources
      resources: {
        // In preview we might rely on blobs or fallback.
        // videoUrls map is not explicitly available here, but useVideoUrl handles 'undefined' gracefully by checking storage.
        // If we want to be explicit we could pass an empty object or rely on useVideoUrl internal logic.
        videoUrls: undefined,
        videoUrlsHighRes: undefined,
        videoFilePaths: undefined,
        metadataUrls: undefined,
      }
    }
  }, [playerConfig, isEditingCrop, cropData, onCropChange, onCropConfirm, onCropReset, isHighQualityPlaybackEnabled, isScrubbing, isPlaying, muted, volume]);



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
          <>

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
                <AmbientGlowPlayer
                  mainPlayerRef={playerRef}
                  timelineMetadata={timelineMetadata}
                  playerConfig={playerConfig}
                  isPlaying={isPlaying}
                  isScrubbing={isScrubbing}
                  playerKey={playerKey}
                  initialFrame={initialFrame}
                />
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
                transform: translateZ(0); /* Force GPU layer */
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
