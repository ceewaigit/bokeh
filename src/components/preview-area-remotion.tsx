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

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { TimelineComposition } from '@/remotion/compositions/TimelineComposition';
import { useProjectStore } from '@/stores/project-store';
import { DEFAULT_PROJECT_SETTINGS } from '@/lib/settings/defaults';
import { usePreviewSettingsStore } from '@/stores/preview-settings-store';
import { useTimelineMetadata } from '@/hooks/useTimelineMetadata';
import { usePlayerConfiguration } from '@/hooks/usePlayerConfiguration';
import { globalBlobManager } from '@/lib/security/blob-url-manager';
import { msToFrame } from '@/remotion/compositions/utils/time/frame-time';
import { PREVIEW_DISPLAY_HEIGHT, PREVIEW_DISPLAY_WIDTH, RETINA_MULTIPLIER } from '@/lib/utils/resolution-utils';
import type { ClickEvent as ProjectClickEvent, CropEffectData, CursorEffectData, MouseEvent as ProjectMouseEvent } from '@/types/project';
import type { ZoomSettings } from '@/types/remotion';
import { buildTimelineCompositionInput } from '@/remotion/utils/composition-input';
import { getBackgroundEffect, getCursorEffect } from '@/lib/effects/effect-filters';
import { resolveEffectIdForType } from '@/lib/effects/effect-selection';
import { calculateCursorState } from '@/lib/effects/utils/cursor-calculator';
import { PlayheadService, type PlayheadState } from '@/lib/timeline/playhead-service';
import { normalizeClickEvents, normalizeMouseEvents } from '@/remotion/compositions/utils/events/event-normalizer';
import { CURSOR_DIMENSIONS, CURSOR_HOTSPOTS, getCursorImagePath } from '@/lib/effects/cursor-types';
import { assertDefined } from '@/lib/errors';

import { AmbientGlowPlayer } from './preview/ambient-glow-player';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { EffectLayerType } from '@/types/effects';
import { EffectType } from '@/types/project';
import { EffectStore } from '@/lib/core/effects';
import { WebcamOverlay } from './preview/webcam-overlay';

type PreviewHoverLayer = 'background' | 'cursor' | 'webcam' | null;
type CursorOverlay = {
  left: number;
  top: number;
  width: number;
  height: number;
  tipX: number;
  tipY: number;
  src: string;
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
  // PERFORMANCE: Subscribe directly to avoid WorkspaceManager re-renders
  // WARNING: Do NOT subscribe to currentTime here. It updates 60fps and will re-render this entire tree.
  // Instead, read it directly from the store ref during sync intervals.
  const storeIsPlaying = useProjectStore((s) => s.isPlaying);
  const storePause = useProjectStore((s) => s.pause);
  const storeSeekFromPlayer = useProjectStore((s) => s.seekFromPlayer);  // For syncing store FROM player
  const isExporting = useProjectStore((s) => s.progress.isProcessing);

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
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const [previewViewportSize, setPreviewViewportSize] = useState({ width: 0, height: 0 });
  const [hoveredLayer, setHoveredLayer] = useState<PreviewHoverLayer>(null);
  const [cursorOverlay, setCursorOverlay] = useState<CursorOverlay | null>(null);
  const [webcamOverlay, setWebcamOverlay] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const playheadStateRef = useRef<PlayheadState | undefined>(undefined);
  const cursorEventsCacheRef = useRef(new Map<string, {
    rawMouseEvents: ProjectMouseEvent[];
    rawClickEvents: ProjectClickEvent[];
    mouseEvents: ProjectMouseEvent[];
    clickEvents: ProjectClickEvent[];
    captureWidth: number;
    captureHeight: number;
  }>());

  // Throttle state for scrub optimization
  const lastSeekTimeRef = useRef<number>(0);
  const pendingSeekRef = useRef<number | null>(null);
  const scrubTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFrameSyncMsRef = useRef<number>(0);
  const isScrubbing = useProjectStore((s) => s.isScrubbing);
  const wasPlayingBeforeScrubRef = useRef(false);
  const lastIsPlayingRef = useRef<boolean>(false);
  const playbackSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);


  // No longer tracking currentTime via prop to avoid re-renders.
  // Access it directly from store when needed.

  const safePlay = useCallback((player: PlayerRef | null) => {
    const resolvedPlayer = assertDefined(player, '[PreviewAreaRemotion] Player ref missing')
    return (resolvedPlayer as PlayerRef & { play: () => unknown }).play()
  }, []);

  const project = useProjectStore((s) => s.currentProject);
  const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer);
  const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer);
  const projectSettings = useProjectStore((s) => s.currentProject?.settings);
  const volume = projectSettings?.audio.volume ?? DEFAULT_PROJECT_SETTINGS.audio.volume;
  const muted = projectSettings?.audio.muted ?? DEFAULT_PROJECT_SETTINGS.audio.muted;
  const cameraSettings = projectSettings?.camera ?? DEFAULT_PROJECT_SETTINGS.camera;
  const isHighQualityPlaybackEnabled = usePreviewSettingsStore((s) => s.highQuality);
  const isGlowEnabled = usePreviewSettingsStore((s) => s.showGlow);
  const glowIntensity = usePreviewSettingsStore((s) => s.glowIntensity);
  const previewScale = useWorkspaceStore((s) => s.previewScale);
  const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen);
  const toggleProperties = useWorkspaceStore((s) => s.toggleProperties);

  // Calculate timeline metadata (total duration, fps, dimensions)
  const timelineMetadata = assertDefined(
    useTimelineMetadata(project),
    'PreviewAreaRemotion requires timeline metadata before rendering.'
  );

  const projectEffects = useMemo(() => {
    if (!project) return [];
    return EffectStore.getAll(project);
  }, [project]);

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

  const handleLayerSelect = useCallback((event: React.MouseEvent) => {
    if (event.defaultPrevented) return;
    const layer = hoveredLayer;
    if (!layer) return;
    if (layer === 'background' && canSelectBackground && backgroundEffectId) {
      selectEffectLayer(EffectLayerType.Background, backgroundEffectId);
    } else if (layer === 'cursor' && canSelectCursor && cursorEffectId) {
      selectEffectLayer(EffectLayerType.Cursor, cursorEffectId);
    } else if (layer === 'webcam' && canSelectWebcam && webcamEffectId) {
      selectEffectLayer(EffectLayerType.Webcam, webcamEffectId);
    } else {
      return;
    }

    if (!isPropertiesOpen) {
      toggleProperties();
    }
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
  ]);

  const handleWebcamOverlaySelect = useCallback(() => {
    if (!webcamEffectId) return;
    selectEffectLayer(EffectLayerType.Webcam, webcamEffectId);
    if (!isPropertiesOpen) {
      toggleProperties();
    }
  }, [selectEffectLayer, webcamEffectId, isPropertiesOpen, toggleProperties]);


  const resolveWebcamOverlay = useCallback((rect: DOMRect) => {
    const overlayElement = playerContainerRef.current?.querySelector('[data-webcam-overlay="true"]') as HTMLElement | null;
    if (!overlayElement) return null;
    const overlayRect = overlayElement.getBoundingClientRect();
    if (overlayRect.width <= 0 || overlayRect.height <= 0) return null;
    return {
      x: overlayRect.left - rect.left,
      y: overlayRect.top - rect.top,
      width: overlayRect.width,
      height: overlayRect.height,
    };
  }, []);

  const resolveCursorOverlay = useCallback((rect: DOMRect): CursorOverlay | null => {
    if (!project || !canSelectCursor) return null;
    const timeMs = useProjectStore.getState().currentTime;
    const nextPlayheadState = PlayheadService.updatePlayheadState(project, timeMs, playheadStateRef.current);
    playheadStateRef.current = nextPlayheadState;
    const activeClip = nextPlayheadState.playheadClip;
    const activeRecording = nextPlayheadState.playheadRecording;
    if (!activeClip || !activeRecording) return null;

    const cursorEffect = getCursorEffect(projectEffects);
    if (!cursorEffect || cursorEffect.enabled === false) return null;
    const cursorData = cursorEffect.data as CursorEffectData | undefined;
    if (!cursorData) return null;

    const rawMouseEvents = activeRecording.sourceType === 'image' && activeRecording.syntheticMouseEvents?.length
      ? (activeRecording.syntheticMouseEvents as ProjectMouseEvent[])
      : ((activeRecording.metadata?.mouseEvents ?? []) as ProjectMouseEvent[]);
    const rawClickEvents = activeRecording.sourceType === 'image' && activeRecording.syntheticMouseEvents?.length
      ? []
      : ((activeRecording.metadata?.clickEvents ?? []) as ProjectClickEvent[]);
    if (!rawMouseEvents.length) return null;

    const cache = cursorEventsCacheRef.current.get(activeRecording.id);
    const useCache = cache?.rawMouseEvents === rawMouseEvents && cache?.rawClickEvents === rawClickEvents;
    const normalizedMouseEvents = useCache ? cache!.mouseEvents : normalizeMouseEvents(rawMouseEvents);
    const normalizedClickEvents = useCache ? cache!.clickEvents : normalizeClickEvents(rawClickEvents);
    const firstEvent = normalizedMouseEvents[0];
    const captureWidth = useCache ? cache!.captureWidth : (firstEvent.captureWidth ?? firstEvent.screenWidth);
    const captureHeight = useCache ? cache!.captureHeight : (firstEvent.captureHeight ?? firstEvent.screenHeight);

    if (!useCache) {
      cursorEventsCacheRef.current.set(activeRecording.id, {
        rawMouseEvents,
        rawClickEvents,
        mouseEvents: normalizedMouseEvents,
        clickEvents: normalizedClickEvents,
        captureWidth: captureWidth ?? 0,
        captureHeight: captureHeight ?? 0,
      });
    }

    if (!captureWidth || !captureHeight) return null;
    const sourceTimeMs = PlayheadService.calculateSourceTime(activeClip, timeMs);
    const isImageWithSyntheticEvents = activeRecording.sourceType === 'image' && Boolean(activeRecording.syntheticMouseEvents?.length);
    const cursorState = calculateCursorState(
      cursorData,
      normalizedMouseEvents,
      normalizedClickEvents,
      sourceTimeMs,
      timelineMetadata.fps,
      isImageWithSyntheticEvents
    );
    if (!cursorState.visible || cursorState.opacity <= 0) return null;

    const normalizedX = cursorState.x / captureWidth;
    const normalizedY = cursorState.y / captureHeight;
    const tipX = normalizedX * rect.width;
    const tipY = normalizedY * rect.height;
    const dimensions = CURSOR_DIMENSIONS[cursorState.type];
    const hotspot = CURSOR_HOTSPOTS[cursorState.type];
    const displayScale = rect.width / 1920;
    const width = dimensions.width * cursorState.scale * displayScale;
    const height = dimensions.height * cursorState.scale * displayScale;
    const left = tipX - hotspot.x * width;
    const top = tipY - hotspot.y * height;

    return {
      left,
      top,
      width,
      height,
      tipX,
      tipY,
      src: getCursorImagePath(cursorState.type),
    };
  }, [project, timelineMetadata, canSelectCursor, projectEffects]);

  const setHoverState = useCallback((
    nextLayer: PreviewHoverLayer,
    nextCursor: CursorOverlay | null,
    nextWebcam: { x: number; y: number; width: number; height: number } | null
  ) => {
    setHoveredLayer((prev) => prev === nextLayer ? prev : nextLayer);
    setCursorOverlay((prev) => {
      if (!prev && !nextCursor) return prev;
      if (
        prev && nextCursor &&
        Math.abs(prev.left - nextCursor.left) < 0.5 &&
        Math.abs(prev.top - nextCursor.top) < 0.5 &&
        Math.abs(prev.width - nextCursor.width) < 0.5 &&
        Math.abs(prev.height - nextCursor.height) < 0.5
      ) {
        return prev;
      }
      return nextCursor;
    });
    setWebcamOverlay((prev) => {
      if (!prev && !nextWebcam) return prev;
      if (
        prev && nextWebcam &&
        Math.abs(prev.x - nextWebcam.x) < 0.5 &&
        Math.abs(prev.y - nextWebcam.y) < 0.5 &&
        Math.abs(prev.width - nextWebcam.width) < 0.5 &&
        Math.abs(prev.height - nextWebcam.height) < 0.5
      ) {
        return prev;
      }
      return nextWebcam;
    });
  }, []);

  const handlePreviewHover = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!aspectContainerRef.current) return;
    if (!canSelectBackground && !canSelectCursor && !canSelectWebcam) return;
    const rect = aspectContainerRef.current.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
      setHoverState(null, null, null);
      return;
    }

    let nextLayer: PreviewHoverLayer = null;
    let nextCursor: CursorOverlay | null = null;
    let nextWebcam: { x: number; y: number; width: number; height: number } | null = null;

    if (canSelectWebcam) {
      const webcamRect = resolveWebcamOverlay(rect);
      if (webcamRect) {
        const withinWebcam = localX >= webcamRect.x &&
          localY >= webcamRect.y &&
          localX <= webcamRect.x + webcamRect.width &&
          localY <= webcamRect.y + webcamRect.height;
        if (withinWebcam) {
          nextLayer = 'webcam';
          nextWebcam = webcamRect;
        }
      }
    }

    if (!nextLayer && canSelectCursor) {
      const cursorPos = resolveCursorOverlay(rect);
      if (cursorPos) {
        const hitboxPaddingX = 4;
        const hitboxPaddingY = 4;
        const hitboxLeft = cursorPos.left - hitboxPaddingX;
        const hitboxRight = cursorPos.left + cursorPos.width + hitboxPaddingX;
        const hitboxTop = cursorPos.top - hitboxPaddingY;
        const hitboxBottom = cursorPos.top + cursorPos.height + hitboxPaddingY;
        const withinHitbox = localX >= hitboxLeft &&
          localX <= hitboxRight &&
          localY >= hitboxTop &&
          localY <= hitboxBottom;
        if (withinHitbox) {
          nextLayer = 'cursor';
          nextCursor = cursorPos;
        }
      }
    }

    if (!nextLayer && canSelectBackground) {
      nextLayer = 'background';
    }

    setHoverState(nextLayer, nextCursor, nextWebcam);
  }, [
    canSelectBackground,
    canSelectCursor,
    canSelectWebcam,
    resolveWebcamOverlay,
    resolveCursorOverlay,
    setHoverState
  ]);

  const handlePreviewLeave = useCallback(() => {
    setHoverState(null, null, null);
  }, [setHoverState]);

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

  // Calculate composition size for preview
  // On Retina displays (DPR >= 2), use higher resolution for crisp keystroke rendering
  const compositionSize = useMemo(() => {
    const videoWidth = timelineMetadata.width;
    const videoHeight = timelineMetadata.height;
    const videoAspectRatio = videoWidth / videoHeight;

    const maxWidth = isHighQualityPlaybackEnabled
      ? videoWidth
      : PREVIEW_DISPLAY_WIDTH * RETINA_MULTIPLIER;
    const maxHeight = isHighQualityPlaybackEnabled
      ? videoHeight
      : PREVIEW_DISPLAY_HEIGHT * RETINA_MULTIPLIER;

    const scaleByWidth = maxWidth / videoWidth;
    const scaleByHeight = maxHeight / videoHeight;
    const scale = Math.min(scaleByWidth, scaleByHeight, 1);

    let width = Math.max(320, Math.round(videoWidth * scale));
    let height = Math.max(180, Math.round(videoHeight * scale));

    if (Math.abs(width / height - videoAspectRatio) > 0.001) {
      height = Math.round(width / videoAspectRatio);
    }

    return { width, height };
  }, [timelineMetadata, isHighQualityPlaybackEnabled]);

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
  useEffect(() => {
    if (!project?.recordings) return;

    const loadVideos = async () => {
      for (const recording of project.recordings) {
        if (recording.filePath) {
          await globalBlobManager.loadVideos({
            id: recording.id,
            filePath: recording.filePath,
            folderPath: recording.folderPath
          });
        }
      }
    };

    loadVideos();
  }, [project?.recordings]);

  const clampFrame = (frame: number) => {
    const maxFrame = timelineMetadata.durationInFrames - 1;
    return Math.max(0, Math.min(frame, maxFrame));
  };

  // SSOT: Use centralized frame calculation for consistent rounding
  const timeToFrame = (timeMs: number) => {
    return msToFrame(timeMs, timelineMetadata.fps);
  };


  // Throttled seek function to reduce video decode pressure
  const throttledSeek = useCallback((targetFrame: number) => {
    if (!playerRef.current) return;

    const currentFrame = playerRef.current.getCurrentFrame();
    if (Math.abs(currentFrame - targetFrame) <= 1) {
      return;
    }

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
          const pendingCurrentFrame = playerRef.current.getCurrentFrame();
          if (Math.abs(pendingCurrentFrame - pendingSeekRef.current) <= 1) {
            pendingSeekRef.current = null;
            scrubTimeoutRef.current = null;
            return;
          }
          playerRef.current.seekTo(pendingSeekRef.current);
          lastSeekTimeRef.current = Date.now();
          pendingSeekRef.current = null;
        }
        scrubTimeoutRef.current = null;
      }, SCRUB_THROTTLE_MS - timeSinceLastSeek);

      return;
    }

    // Seek immediately
    playerRef.current.seekTo(targetFrame);
    lastSeekTimeRef.current = now;
  }, []);

  useEffect(() => {
    return () => {
      if (scrubTimeoutRef.current) {
        clearTimeout(scrubTimeoutRef.current);
        scrubTimeoutRef.current = null;
      }
    };
  }, []);

  // Hover preview sync: seek to hover position without mutating currentTime.
  useEffect(() => {
    if (!playerRef.current) return;

    let prevHoverTime = useProjectStore.getState().hoverTime;
    const unsubscribe = useProjectStore.subscribe((state) => {
      if (state.isPlaying || state.isScrubbing || isExporting) return;

      const nextHoverTime = state.hoverTime;
      if (nextHoverTime === prevHoverTime) return;
      prevHoverTime = nextHoverTime;

      const targetTime = nextHoverTime ?? state.currentTime;
      const targetFrame = clampFrame(timeToFrame(targetTime));
      throttledSeek(targetFrame);
    });

    return () => unsubscribe();
  }, [timelineMetadata, throttledSeek, isExporting]);

  // SSOT: frameupdate event listener - the TRUE source of truth sync
  // Remotion Player fires this on EVERY frame change (playback and seeking)
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handleFrameUpdate = (e: { detail: { frame: number } }) => {
      // Only sync during playback - scrub sync is handled separately
      const { isPlaying, isScrubbing } = useProjectStore.getState();
      if (!isPlaying) return;
      if (isScrubbing) return;
      const now = performance.now();
      if (now - lastFrameSyncMsRef.current < 1000 / 30) return;
      lastFrameSyncMsRef.current = now;

      const frame = e.detail.frame;
      const timeMs = (frame / timelineMetadata.fps) * 1000;
      storeSeekFromPlayer(timeMs);
    };

    player.addEventListener('frameupdate', handleFrameUpdate as any);

    return () => {
      player.removeEventListener('frameupdate', handleFrameUpdate as any);
    };
  }, [timelineMetadata, storeSeekFromPlayer]);

  // Scrub behavior: pause player while dragging, resume from final position.
  useEffect(() => {
    if (!playerRef.current) return;
    const player = playerRef.current;

    if (isScrubbing) {
      wasPlayingBeforeScrubRef.current = isPlaying;
      player.pause();
      return;
    }

    if (wasPlayingBeforeScrubRef.current && isPlaying) {
      const time = useProjectStore.getState().currentTime;
      const targetFrame = clampFrame(timeToFrame(time));
      player.seekTo(targetFrame);
      safePlay(player);
    }

    wasPlayingBeforeScrubRef.current = false;
  }, [isScrubbing, isPlaying, timelineMetadata, safePlay]);

  // Allow intentional seeks during playback (e.g. ruler click) without pausing.
  useEffect(() => {
    if (!playerRef.current || !isPlaying || isExporting || isScrubbing) return;

    let prevTime = useProjectStore.getState().currentTime;

    const unsubscribe = useProjectStore.subscribe((state) => {
      if (!state.isPlaying || isExporting || state.isScrubbing) return;

      const nextTime = state.currentTime;
      if (Math.abs(nextTime - prevTime) < 1) return;
      prevTime = nextTime;

      const player = playerRef.current;
      if (!player) return;

      const targetFrame = clampFrame(timeToFrame(nextTime));
      const playerFrame = player.getCurrentFrame();

      if (Math.abs(playerFrame - targetFrame) <= 2) return;

      player.seekTo(targetFrame);
      safePlay(player);
    });

    return () => unsubscribe();
  }, [isPlaying, isExporting, timelineMetadata, safePlay]);

  // Main player sync effect with throttled scrubbing
  useEffect(() => {
    if (!playerRef.current) return;

    // EXPORT OPTIMIZATION: Pause preview during export
    if (isExporting) {
      if (playerRef.current) playerRef.current.pause();
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
        const playerFrame = playerRef.current.getCurrentFrame();
        const currentStoreTime = useProjectStore.getState().currentTime;
        const storeFrame = clampFrame(timeToFrame(currentStoreTime));
        if (Math.abs(playerFrame - storeFrame) > 1) {
          playerRef.current.seekTo(storeFrame);
        }
      }

      if (muted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unmute();
      }
      playerRef.current.setVolume(Math.min(volume / 100, 1));

      if (!lastIsPlayingRef.current) {
        // Start playback
        safePlay(playerRef.current);
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
    playerRef.current.pause();

    // PERFORMANCE: Subscribe only to currentTime changes, not all store mutations
    // Track previous time to filter out unrelated state changes
    let prevTime = useProjectStore.getState().currentTime

    const unsubscribe = useProjectStore.subscribe((state) => {
      // Only react if currentTime actually changed (within 1ms tolerance)
      if (Math.abs(state.currentTime - prevTime) < 1) return
      prevTime = state.currentTime

      if (!state.isPlaying && !isExporting) {
        const frame = clampFrame(timeToFrame(state.currentTime));
        throttledSeek(frame);
      }
    });

    // Initial seek to current time is intentionally skipped to avoid pause flicker.

    return () => {
      unsubscribe();
    }
  }, [isPlaying, timelineMetadata, throttledSeek, isExporting]);

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

    if (muted) {
      playerRef.current.mute();
    } else {
      playerRef.current.unmute();
    }
    playerRef.current.setVolume(Math.min(volume / 100, 1));
  }, [volume, muted]);

  useEffect(() => {
    if (!previewViewportRef.current) return;
    let rafId: number | null = null;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setPreviewViewportSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      });
    });
    observer.observe(previewViewportRef.current);
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Calculate initial frame
  // Only needs to run once or when metadata changes
  const initialFrame = useMemo(() => {
    const storeTime = useProjectStore.getState().currentTime;
    return clampFrame(timeToFrame(storeTime));
  }, [timelineMetadata]); // Removed currentTime

  // Player key for re-render on clip changes
  const playerKey = useMemo(() => {
    if (!project || !timelineMetadata) return "player-empty";
    const recordingIds = project.recordings
      .map((recording) => recording.id)
      .sort()
      .join(",");
    return `player-${timelineMetadata.durationInFrames}-${timelineMetadata.fps}-${timelineMetadata.width}-${timelineMetadata.height}-${recordingIds}`;
  }, [project?.recordings, timelineMetadata]);

  // Reset playback state ref when the Remotion Player remounts
  useEffect(() => {
    lastIsPlayingRef.current = false;
  }, [playerKey]);

  // Memoize inputProps using the new structure for TimelineComposition
  const mainPlayerInputProps = useMemo(() => {
    return buildTimelineCompositionInput(playerConfig, {
      playback: {
        // NOTE: isPlaying/isScrubbing are intentionally false here to prevent Player re-renders.
        // SharedVideoController reads these from Zustand store directly for preview mode.
        // These props are only used during render mode (export).
        isPlaying: false,
        isScrubbing: false,
        isHighQualityPlaybackEnabled,
        previewMuted: muted,
        previewVolume: Math.min(volume / 100, 1),
      },
      renderSettings: {
        isGlowMode: false,
        preferOffthreadVideo: false,
        isEditingCrop: Boolean(isEditingCrop),
      },
      cropSettings: {
        cropData: cropData ?? null,
        onCropChange,
        onCropConfirm,
        onCropReset,
      },
      zoomSettings,
    })
  }, [playerConfig, isEditingCrop, cropData, onCropChange, onCropConfirm, onCropReset, zoomSettings, isHighQualityPlaybackEnabled, muted, volume]);



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
                      glowIntensity={glowIntensity}
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
                    border-radius: 16px !important;
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
                  {canSelectWebcam && isWebcamSelected && (
                    <WebcamOverlay
                      effects={projectEffects}
                      containerWidth={previewFrameBounds.width}
                      containerHeight={previewFrameBounds.height}
                      isSelected
                      onSelect={handleWebcamOverlaySelect}
                      className="z-30"
                    />
                  )}
                  {hoveredLayer === 'background' && canSelectBackground && (
                    <div className="pointer-events-none absolute inset-0 z-20 opacity-100 transition-opacity duration-150 ease-out">
                      <div className="absolute inset-0 rounded-2xl bg-white/5 ring-1 ring-white/15" />
                      <div className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                        Background
                      </div>
                    </div>
                  )}
                  {hoveredLayer === 'webcam' && webcamOverlay && (
                    <div className="pointer-events-none absolute inset-0 z-20">
                      <div
                        className="absolute rounded-[22px] bg-white/5 ring-1 ring-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                        style={{
                          left: `${webcamOverlay.x}px`,
                          top: `${webcamOverlay.y}px`,
                          width: `${webcamOverlay.width}px`,
                          height: `${webcamOverlay.height}px`,
                        }}
                      />
                      <div
                        className="absolute rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80"
                        style={{
                          left: `${Math.max(12, webcamOverlay.x + 8)}px`,
                          top: `${Math.max(12, webcamOverlay.y + 8)}px`,
                        }}
                      >
                        Webcam
                      </div>
                    </div>
                  )}
                  {hoveredLayer === 'cursor' && cursorOverlay && (
                    <div className="pointer-events-none absolute inset-0 z-20">
                      <div
                        className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.2)_0%,_rgba(255,255,255,0.1)_38%,_rgba(255,255,255,0.02)_60%,_rgba(255,255,255,0)_70%)]"
                        style={{
                          left: `${cursorOverlay.left + cursorOverlay.width * 0.5}px`,
                          top: `${cursorOverlay.top + cursorOverlay.height * 0.45}px`,
                        }}
                      />
                      <div
                        className="absolute rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80"
                        style={{
                          left: `${Math.max(12, cursorOverlay.left + cursorOverlay.width * 0.65)}px`,
                          top: `${Math.max(12, cursorOverlay.top - 22)}px`,
                        }}
                      >
                        Cursor
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
