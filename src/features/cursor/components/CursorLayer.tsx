import React, { useMemo, useRef, useEffect } from 'react';
import { AbsoluteFill, Img, delayRender, continueRender, useVideoConfig } from 'remotion';
import { REFERENCE_WIDTH } from '@/lib/constants/layout';
import type { CursorEffectData, MouseEvent, ClickEvent, Recording } from '@/types/project';
import {
  CursorType,
  CURSOR_DIMENSIONS,
  CURSOR_HOTSPOTS,
  getCursorImagePath,
} from '../store/cursor-types';
import { calculateCursorState, getClickTextStyle, resolveClickEffectConfig, type CursorState } from '../logic/cursor-logic';
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects';

import { useProjectStore } from '@/stores/project-store';
import { normalizeClickEvents, normalizeMouseEvents } from '@/remotion/compositions/utils/events/event-normalizer';
import { useTimelineContext } from '@/remotion/context/TimelineContext';
import { getCursorEffect } from '@/features/effects/effect-filters';
import { applyCssTransformToPoint } from '@/remotion/compositions/utils/transforms/transform-point';

import { useRecordingMetadata } from '@/remotion/hooks/media/useRecordingMetadata';
import { useFrameSnapshot } from '@/remotion/hooks/use-frame-snapshot';

// SINGLETON: Global cursor image cache - prevents redundant loading across all CursorLayer instances
class CursorImagePreloader {
  private static instance: CursorImagePreloader;
  private isLoaded = false;
  private loadingPromise: Promise<void> | null = null;

  private constructor() { }

  static getInstance(): CursorImagePreloader {
    if (!CursorImagePreloader.instance) {
      CursorImagePreloader.instance = new CursorImagePreloader();
    }
    return CursorImagePreloader.instance;
  }

  isPreloaded(): boolean {
    return this.isLoaded;
  }

  preload(): Promise<void> {
    // If already loaded, return immediately
    if (this.isLoaded) {
      return Promise.resolve();
    }

    // If currently loading, return the existing promise
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Start loading
    const cursorTypesToPreload = [
      CursorType.ARROW,
      CursorType.IBEAM,
      CursorType.POINTING_HAND,
      CursorType.CLOSED_HAND,
      CursorType.OPEN_HAND,
      CursorType.CROSSHAIR
    ];

    const imagePromises = cursorTypesToPreload.map((type) => {
      return new Promise<void>((resolve, reject) => {
        const src = getCursorImagePath(type);
        const img = new Image();

        img.onload = () => {
          resolve();
        };
        img.onerror = () => {
          reject(new Error(`Failed to preload cursor: ${type}`));
        };
        img.src = src;
      });
    });

    this.loadingPromise = Promise.all(imagePromises).then(() => {
      this.isLoaded = true;
      this.loadingPromise = null; // Clear the promise after loading
    });

    return this.loadingPromise;
  }
}

// MEMOIZATION: Prevent re-renders when parent (SharedVideoController) updates but props/context are stable.
// This works with VideoPositionContext optimization to allow "static" cursor frames during video playback.
export const CursorLayer = React.memo(() => {
  const { fps } = useVideoConfig();
  const { videoWidth, videoHeight, resources } = useTimelineContext();
  const metadataUrls = resources.metadataUrls;

  // Pull Frame Snapshot (Zero-Prop Pattern)
  const snapshot = useFrameSnapshot();
  const {
    layout,
    transforms,
    mockup,
    effectiveClipData: activeClipData, // Use effective/resolved clip data
    camera
  } = snapshot;

  // USE SHARED DATA FROM SNAPSHOT (SSOT)
  const recording: Recording | null = activeClipData?.recording ?? null;
  const isGeneratedRecording = recording?.sourceType === 'generated';
  const isImageRecording = recording?.sourceType === 'image';

  // For generated clips (not images), we typically don't show cursor unless they have synthetic events (e.g. return cursor)
  // For image clips with syntheticMouseEvents, cursor will be shown via normal path
  const hasSyntheticEvents = recording?.syntheticMouseEvents && recording.syntheticMouseEvents.length > 0;
  const shouldSkipCursor = isGeneratedRecording && !isImageRecording && !hasSyntheticEvents;
  const recordingId = shouldSkipCursor ? null : recording?.id ?? null;

  // LAZY LOADING: Load metadata on-demand via hook
  const { metadata: lazyMetadata } = useRecordingMetadata({
    recordingId: recordingId || '',
    folderPath: recording?.folderPath,
    metadataChunks: recording?.metadataChunks,
    metadataUrls: metadataUrls,
    inlineMetadata: recording?.metadata, // Fallback to already-loaded metadata
  });

  // NOTE: Do NOT early return here - it violates React Rules of Hooks
  // All hooks must be called unconditionally; we handle generated recordings at the end

  // DIRECT STORE SUBSCRIPTION: Bypass prop drilling for cursor settings.
  // We use the recording ID from activeClipData to fetch the LIVE effect data from the store.
  const liveEffects = useProjectStore((s) => {
    if (!recordingId || !s.currentProject) return null;
    return s.currentProject.recordings.find((r) => r.id === recordingId)?.effects;
  });

  const cursorEffect = useMemo(() => {
    // Prefer live store data if available, fall back to context data (for export/offline)
    const effectsToUse = liveEffects ?? activeClipData?.effects ?? [];
    return activeClipData ? getCursorEffect(effectsToUse) : undefined;
  }, [activeClipData, liveEffects]);

  const cursorData = (cursorEffect?.data as CursorEffectData | undefined);
  const clickEffectConfig = useMemo(() => resolveClickEffectConfig(cursorData), [cursorData]);

  // Use lazy-loaded metadata, falling back to recording.metadata if available
  const effectiveMetadata = lazyMetadata || recording?.metadata;

  const { rawCursorEvents, rawClickEvents } = useMemo(() => {
    // For image clips with synthetic mouse events (cursor return), use those instead of metadata
    const isImageWithSyntheticEvents = recording?.sourceType === 'image' && recording?.syntheticMouseEvents?.length;

    const cursorEvents = isImageWithSyntheticEvents
      ? (recording.syntheticMouseEvents as MouseEvent[])
      : ((effectiveMetadata?.mouseEvents || []) as MouseEvent[]);

    // Image clips with synthetic events have no click events
    const clickEvents = isImageWithSyntheticEvents
      ? []
      : ((effectiveMetadata?.clickEvents || []) as ClickEvent[]);

    return { rawCursorEvents: cursorEvents, rawClickEvents: clickEvents };
  }, [recording?.sourceType, recording?.syntheticMouseEvents, effectiveMetadata]);

  // Image clips with synthetic events have no click events
  const isImageWithSyntheticEvents = recording?.sourceType === 'image' && recording?.syntheticMouseEvents?.length;

  const cursorEvents = useMemo(() => normalizeMouseEvents(rawCursorEvents), [rawCursorEvents]);
  const clickEvents = useMemo(() => normalizeClickEvents(rawClickEvents), [rawClickEvents]);

  const currentSourceTime = activeClipData?.sourceTimeMs ?? 0;
  // Cache cursor states by SOURCE TIME (milliseconds, not frame numbers)
  // This prevents cursor blinking during sped-up playback
  const frameStateCacheRef = useRef<Map<number, CursorState>>(new Map());

  // SINGLETON: Pre-cache all cursor images once across all CursorLayer instances
  useEffect(() => {
    const preloader = CursorImagePreloader.getInstance();

    // Early return if already loaded (avoids unnecessary delayRender call)
    if (preloader.isPreloaded()) return;

    const handle = delayRender('Preloading cursor images (singleton)');

    preloader.preload()
      .then(() => {
        continueRender(handle);
      })
      .catch((err) => {
        continueRender(handle);
        setTimeout(() => {
          throw err;
        }, 0);
      });
  }, []);

  const cursorState = useMemo(() => {
    const cache = frameStateCacheRef.current;

    // LRU eviction - prevent unbounded cache growth during scrubbing
    // Keep ~10 seconds of frames at 60fps
    const MAX_CACHE_SIZE = 600;
    if (cache.size >= MAX_CACHE_SIZE) {
      // Remove oldest 1/3 of entries
      const entriesToRemove = Math.floor(MAX_CACHE_SIZE / 3);
      const keys = Array.from(cache.keys());
      for (let i = 0; i < entriesToRemove && i < keys.length; i++) {
        cache.delete(keys[i]);
      }
    }

    // DETERMINISTIC CACHING: Use SOURCE TIME (ms) as cache key
    // Use Math.round() for consistent rounding (matches lookup below)
    const cacheKey = Number(currentSourceTime.toFixed(2));

    // Check if already cached
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Deterministic cursor smoothing: use time-based history so preview/export align.
    const newState = calculateCursorState(
      cursorData,
      cursorEvents,
      clickEvents,
      currentSourceTime,
      fps,
      Boolean(isImageWithSyntheticEvents) // Disable smoothing for synthetic (already smooth) events to prevent filter overshoot
    );

    cache.set(cacheKey, newState);
    return newState;
  }, [clickEvents, cursorData, cursorEvents, currentSourceTime, fps, isImageWithSyntheticEvents]);


  useEffect(() => {
    frameStateCacheRef.current.clear();
  }, [cursorData, cursorEvents, clickEvents, fps]); // Removed clip?.id to prevent cache clear on split clips

  // Extract values from cursor state
  const cursorType = cursorState.type;
  const cursorPosition = cursorState.opacity > 0 ? { x: cursorState.x, y: cursorState.y } : null;

  // Calculate click animation scale from cursor state
  // Round to 2 decimal places to prevent shadow flicker from tiny float variations
  const clickScale = useMemo(() => {
    // Find most recent active click effect
    const recentClick = cursorState.clickEffects[cursorState.clickEffects.length - 1];
    if (!recentClick) return 1;

    const clickProgress = recentClick.progress;
    // Click animation - shrinks to 0.8 then returns to normal
    let scale: number;
    if (clickProgress < 0.4) {
      // Quick shrink phase
      scale = 1 - (clickProgress / 0.4) * 0.2; // Shrink to 0.8
    } else {
      // Return to normal phase
      const returnProgress = (clickProgress - 0.4) / 0.6;
      scale = 0.8 + returnProgress * 0.2; // Grow from 0.8 back to 1.0
    }
    return Math.round(scale * 100) / 100;
  }, [cursorState.clickEffects]);

  // Stabilize rotation/tilt values to prevent shadow flicker from tiny float changes
  // Round to 1 decimal place - enough precision for smooth animation, prevents GPU recompositing
  const cursorRotation = Math.round((cursorState.rotation ?? 0) * 10) / 10;
  const cursorTiltX = Math.round((cursorState.tiltX ?? 0) * 10) / 10;
  const cursorTiltY = Math.round((cursorState.tiltY ?? 0) * 10) / 10;
  const cursorPerspective = 700;

  // Use SHARED video offset from Snapshot
  // This ensures cursor uses the EXACT SAME position as the video element
  const videoOffset = useMemo(() => {
    return {
      x: layout.offsetX,
      y: layout.offsetY,
      width: layout.drawWidth,
      height: layout.drawHeight,
    };
  }, [layout.offsetX, layout.offsetY, layout.drawWidth, layout.drawHeight]);

  const isMockup = Boolean(mockup.enabled && mockup.position);

  // Get capture dimensions from first event - this is the SSOT for cursor coordinates
  // The cursor coordinates were recorded relative to these dimensions, so we MUST use them
  const firstEvent = cursorEvents[0];
  const captureWidth = firstEvent?.captureWidth ?? videoWidth;
  const captureHeight = firstEvent?.captureHeight ?? videoHeight;

  // Normalize cursor position (0-1 range within the capture area).
  // For mockups, clamp to keep the cursor inside the device screen.
  const rawNormalizedX = cursorPosition ? (cursorPosition.x / captureWidth) : 0;
  const rawNormalizedY = cursorPosition ? (cursorPosition.y / captureHeight) : 0;
  const shouldClampToScreen = Boolean(mockup.enabled);
  const normalizedX = shouldClampToScreen ? Math.max(0, Math.min(1, rawNormalizedX)) : rawNormalizedX;
  const normalizedY = shouldClampToScreen ? Math.max(0, Math.min(1, rawNormalizedY)) : rawNormalizedY;
  const debugNormalizedX = shouldClampToScreen
    ? Math.max(0, Math.min(1, cursorState.x / captureWidth))
    : (cursorState.x / captureWidth);
  const debugNormalizedY = shouldClampToScreen
    ? Math.max(0, Math.min(1, cursorState.y / captureHeight))
    : (cursorState.y / captureHeight);

  // Calculate the cursor position within the video content area (before zoom)
  // Simply map the normalized position to the video display area
  const screenOffsetX = isMockup && mockup.position
    ? mockup.position.screenX
    : 0;
  const screenOffsetY = isMockup && mockup.position
    ? mockup.position.screenY
    : 0;
  const cursorAreaWidth = videoOffset.width;
  const cursorAreaHeight = videoOffset.height;
  const cursorBaseOffsetX = isMockup ? (videoOffset.x - screenOffsetX) : videoOffset.x;
  const cursorBaseOffsetY = isMockup ? (videoOffset.y - screenOffsetY) : videoOffset.y;
  const cursorInVideoX = normalizedX * cursorAreaWidth;
  const cursorInVideoY = normalizedY * cursorAreaHeight;

  // Initialize cursor tip position in screen coordinates
  const cursorTipX = cursorBaseOffsetX + cursorInVideoX;
  const cursorTipY = cursorBaseOffsetY + cursorInVideoY;
  const debugTipX = cursorBaseOffsetX + debugNormalizedX * cursorAreaWidth;
  const debugTipY = cursorBaseOffsetY + debugNormalizedY * cursorAreaHeight;

  // Apply cursor size from cursor state
  const cursorSize = cursorState.scale;

  // Get cursor hotspot and dimensions
  const hotspot = CURSOR_HOTSPOTS[cursorType];
  const dimensions = CURSOR_DIMENSIONS[cursorType];

  // Calculate cursor size to be TRULY RESOLUTION-AGNOSTIC.
  //
  // Problem: When we scale cursor by (drawWidth / sourceWidth), higher-resolution
  // source videos (4K, 1440p) produce smaller cursors because the denominator is larger.
  // For example: 960/1920 = 0.5 (1080p) vs 960/3840 = 0.25 (4K).
  //
  // Solution: Use a FIXED 1080p reference (1920px) as the denominator.
  // This makes cursor size depend ONLY on the display width, not source resolution.
  //
  // The cursor is designed at 1080p scale, so:
  // - At 1080p composition (1920 wide): scale = 1.0
  // - At 720p composition (1280 wide): scale = 0.67
  // - At 480p composition (854 wide): scale = 0.44
  //
  // This ensures the cursor appears the same visual size whether the source video
  // is 720p, 1080p, 4K, 8K, or any resolution - only the preview/export dimensions matter.

  // ZOOM-AGNOSTIC CURSOR SIZING:
  // Use the COMPOSITION width (videoWidth) as the base for cursor scale, NOT the video offset width.
  // videoOffset.width changes when the video is zoomed, which would make the cursor shrink/grow with zoom.
  // The cursor should maintain a consistent visual size on screen regardless of zoom level.
  // For mockups, use the screen area width at its natural (unzoomed) size.
  const cursorScaleBaseWidth = isMockup && mockup.position
    ? mockup.position.screenWidth
    : videoWidth; // Use composition width, NOT videoOffset.width
  const videoDisplayScale = useMemo(() => {
    // Use composition width divided by fixed reference
    // This makes cursor size independent of both source resolution AND zoom level
    return cursorScaleBaseWidth / REFERENCE_WIDTH;
  }, [cursorScaleBaseWidth]);

  const useContainerTransform = Boolean(isMockup && transforms.combined);
  const debugEnabled = typeof window !== 'undefined' && Boolean((window as any).__ssDebugMockup);

  const clickEffects = useMemo(() => {
    if (!cursorState.clickEffects.length) return null;

    const elements = cursorState.clickEffects.map((effect, index) => {
      const normalizedClickX = effect.x / captureWidth;
      const normalizedClickY = effect.y / captureHeight;
      const clickInVideoX = normalizedClickX * cursorAreaWidth;
      const clickInVideoY = normalizedClickY * cursorAreaHeight;

      let clickX = cursorBaseOffsetX + clickInVideoX;
      let clickY = cursorBaseOffsetY + clickInVideoY;

      if (transforms.combined && !useContainerTransform) {
        const originX = mockup.enabled ? videoWidth / 2 : (videoOffset.x + videoOffset.width / 2);
        const originY = mockup.enabled ? videoHeight / 2 : (videoOffset.y + videoOffset.height / 2);
        const transformed = applyCssTransformToPoint(
          clickX,
          clickY,
          originX,
          originY,
          transforms.combined
        );
        clickX = transformed.x;
        clickY = transformed.y;
      }

      const ringRadius = effect.radius * videoDisplayScale;
      const ringOpacity = effect.opacity * cursorState.opacity;
      const textStyle = getClickTextStyle(effect, clickEffectConfig);
      const textOpacity = textStyle ? textStyle.opacity * cursorState.opacity : 0;

      return (
        <React.Fragment key={`click-effect-${effect.timestamp}-${index}`}>
          {clickEffectConfig.style !== 'text' && clickEffectConfig.style !== 'none' && ringOpacity > 0 && (
            <div
              style={{
                position: 'absolute',
                left: clickX,
                top: clickY,
                width: ringRadius * 2,
                height: ringRadius * 2,
                transform: 'translate3d(-50%, -50%, 0)',
                borderRadius: 9999,
                border: `${clickEffectConfig.lineWidth * videoDisplayScale}px solid ${clickEffectConfig.color}`,
                opacity: ringOpacity,
                pointerEvents: 'none',
                willChange: 'transform, opacity',
              }}
            />
          )}

          {effect.word && textStyle && textOpacity > 0 && (
            <div
              style={{
                position: 'absolute',
                left: clickX,
                top: clickY,
                transform: `translate3d(-50%, ${textStyle.offsetY * videoDisplayScale}px, 0) scale(${textStyle.scale})`,
                opacity: textOpacity,
                color: clickEffectConfig.textColor,
                fontSize: clickEffectConfig.textSize * videoDisplayScale,
                fontFamily: 'SF Pro Display, system-ui, -apple-system, sans-serif',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                willChange: 'transform, opacity',
              }}
            >
              {effect.word}
            </div>
          )}
        </React.Fragment>
      );
    });

    return elements;
  }, [
    captureHeight,
    captureWidth,
    clickEffectConfig,
    cursorState.clickEffects,
    cursorState.opacity,
    cursorAreaHeight,
    cursorAreaWidth,
    cursorBaseOffsetX,
    cursorBaseOffsetY,
    videoDisplayScale,
    videoOffset.height,
    videoOffset.width,
    videoOffset.x,
    videoOffset.y,
    transforms.combined,
    mockup.enabled,
    videoWidth,
    videoHeight,
    useContainerTransform,
  ]);

  // Calculate the rendered size of the cursor - fixed size regardless of source resolution
  const renderedWidth = dimensions.width * cursorSize * videoDisplayScale;
  const renderedHeight = dimensions.height * cursorSize * videoDisplayScale;

  const motionBlurIntensity = cursorData?.motionBlurIntensity ?? DEFAULT_CURSOR_DATA.motionBlurIntensity ?? 40;
  const motionBlurEnabled = (cursorData?.motionBlur ?? DEFAULT_CURSOR_DATA.motionBlur ?? true) && motionBlurIntensity > 0;
  const motionBlurSample = motionBlurEnabled ? cursorState.motionBlur : undefined;

  const previousNormalizedX = motionBlurSample
    ? (shouldClampToScreen ? Math.max(0, Math.min(1, motionBlurSample.previousX / captureWidth)) : (motionBlurSample.previousX / captureWidth))
    : null;
  const previousNormalizedY = motionBlurSample
    ? (shouldClampToScreen ? Math.max(0, Math.min(1, motionBlurSample.previousY / captureHeight)) : (motionBlurSample.previousY / captureHeight))
    : null;

  let previousTipX = previousNormalizedX != null ? cursorBaseOffsetX + previousNormalizedX * cursorAreaWidth : null;
  let previousTipY = previousNormalizedY != null ? cursorBaseOffsetY + previousNormalizedY * cursorAreaHeight : null;

  // Initialize cursor position
  let cursorX = cursorTipX;
  let cursorY = cursorTipY;

  // Apply the EXACT same CSS transform string as the video element.
  // This keeps ordering correct under combinations of zoom + 3D (perspective/tilt/skew).
  if (transforms.combined && !useContainerTransform) {
    const originX = mockup.enabled ? videoWidth / 2 : (videoOffset.x + videoOffset.width / 2);
    const originY = mockup.enabled ? videoHeight / 2 : (videoOffset.y + videoOffset.height / 2);
    const transformed = applyCssTransformToPoint(
      cursorX,
      cursorY,
      originX,
      originY,
      transforms.combined
    );
    cursorX = transformed.x;
    cursorY = transformed.y;

    if (previousTipX != null && previousTipY != null) {
      const previousTransformed = applyCssTransformToPoint(
        previousTipX,
        previousTipY,
        originX,
        originY,
        transforms.combined
      );
      previousTipX = previousTransformed.x;
      previousTipY = previousTransformed.y;
    }
  }


  // Apply hotspot offset AFTER transformation
  // This positions the cursor image so the hotspot aligns with the transformed tip position
  cursorX -= hotspot.x * renderedWidth;
  cursorY -= hotspot.y * renderedHeight;
  const previousCursorX = previousTipX != null ? previousTipX - hotspot.x * renderedWidth : null;
  const previousCursorY = previousTipY != null ? previousTipY - hotspot.y * renderedHeight : null;

  // Stabilize sub-pixel transforms to avoid shadow flicker on some GPUs.
  const stableCursorX = Math.round(cursorX * 100) / 100;
  const stableCursorY = Math.round(cursorY * 100) / 100;
  const debugHotspotX = stableCursorX + hotspot.x * renderedWidth;
  const debugHotspotY = stableCursorY + hotspot.y * renderedHeight;
  const debugOffsetX = screenOffsetX;
  const debugOffsetY = screenOffsetY;
  const debugTipXAbs = debugTipX + debugOffsetX;
  const debugTipYAbs = debugTipY + debugOffsetY;
  const debugHotspotXAbs = debugHotspotX + debugOffsetX;
  const debugHotspotYAbs = debugHotspotY + debugOffsetY;

  // Subtle shadow on main cursor - slightly reduced when motion blur trails are active
  const cursorShadow = motionBlurEnabled
    ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))'
    : 'drop-shadow(0 1px 2px rgba(0,0,0,0.18))';

  // Simple cursor motion blur - clean CSS blur proportional to velocity
  const cursorMotionBlurPx = useMemo(() => {
    if (!motionBlurEnabled || !motionBlurSample) return 0;
    const intensity = motionBlurIntensity / 100;
    // Gate low-speed blur to avoid mushiness during micro-movements.
    const minVelocity = 6;
    const maxVelocity = 28;
    if (motionBlurSample.velocity < minVelocity) return 0;
    const t = Math.min(1, Math.max(0, (motionBlurSample.velocity - minVelocity) / (maxVelocity - minVelocity)));
    const eased = t * t;
    return Math.round(eased * intensity * 2.4 * 10) / 10;
  }, [motionBlurEnabled, motionBlurIntensity, motionBlurSample]);

  // Simplified trail: single ghost cursor for clean motion effect
  const motionBlurTrail = useMemo(() => {
    if (!motionBlurEnabled || !motionBlurSample) return null;
    if (previousCursorX == null || previousCursorY == null) return null;

    const deltaX = stableCursorX - previousCursorX;
    const deltaY = stableCursorY - previousCursorY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Only show trail for significant movement
    if (distance < 16) return null;

    const intensity = motionBlurIntensity / 100;
    const trailOffset = Math.min(12, distance * 0.4);
    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    const velocityEase = Math.min(1, Math.max(0, (motionBlurSample.velocity - 8) / 24));
    if (velocityEase < 0.45 || intensity < 0.35) return null;

    // Single clean ghost trail
    const trailX = stableCursorX - unitX * trailOffset * (0.5 + 0.5 * velocityEase);
    const trailY = stableCursorY - unitY * trailOffset * (0.5 + 0.5 * velocityEase);
    const trailOpacity = cursorState.opacity * intensity * (0.06 + 0.12 * velocityEase);
    const trailBlur = 0.9 + intensity * (0.9 + 1.1 * velocityEase);

    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate3d(${trailX}px, ${trailY}px, 0)`,
          opacity: trailOpacity,
          zIndex: 99,
          pointerEvents: 'none',
        }}
      >
        <Img
          src={getCursorImagePath(cursorType)}
          style={{
            width: renderedWidth,
            height: renderedHeight,
            transform: `scale(${clickScale * 0.95})`,
            transformOrigin: `${hotspot.x * renderedWidth}px ${hotspot.y * renderedHeight}px`,
            filter: `blur(${trailBlur}px)`,
          }}
        />
      </div>
    );
  }, [
    clickScale,
    cursorState.opacity,
    cursorType,
    hotspot.x,
    hotspot.y,
    motionBlurEnabled,
    motionBlurIntensity,
    motionBlurSample,
    previousCursorX,
    previousCursorY,
    renderedHeight,
    renderedWidth,
    stableCursorX,
    stableCursorY,
  ]);

  // Don't unmount when hidden - keep component mounted to prevent blinking
  // Instead, return transparent AbsoluteFill
  // Show cursor for: video clips, image clips, and generated clips WITH synthetic events
  // Don't show cursor for: plain generated clips
  const shouldShowCursor = (!isGeneratedRecording || isImageRecording || hasSyntheticEvents) && cursorEffect?.enabled !== false && cursorData && cursorPosition;

  // Calculate refocus blur from zoom transform (camera-like focus pull during zoom)
  const cameraSettings = useProjectStore((s) => s.currentProject?.settings.camera);
  const refocusEnabled = cameraSettings?.refocusBlurEnabled !== false;
  const refocusIntensity = refocusEnabled
    ? Math.max(0, Math.min(1, (cameraSettings?.refocusBlurIntensity ?? 50) / 100))
    : 0;
  const refocusBlurPx = ((camera.zoomTransform as any)?.refocusBlur ?? 0) * 12 * refocusIntensity;

  const hasRefocusBlur = refocusBlurPx > 0.01;
  const mockupClip = useMemo(() => {
    const mockupPosition = mockup.position;
    if (!mockup.enabled || !mockupPosition) return null;
    const left = mockupPosition.screenX;
    const top = mockupPosition.screenY;
    const right = Math.max(0, videoWidth - (mockupPosition.screenX + mockupPosition.screenWidth));
    const bottom = Math.max(0, videoHeight - (mockupPosition.screenY + mockupPosition.screenHeight));
    return {
      left,
      top,
      right,
      bottom,
      radius: mockupPosition.screenCornerRadius,
    };
  }, [videoHeight, mockup.enabled, mockup.position, videoWidth]);

  if (!shouldShowCursor && !debugEnabled) {
    return <AbsoluteFill style={{ opacity: 0, pointerEvents: 'none', zIndex: 200 }} />;
  }

  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      zIndex: 200,
      // Apply refocus blur to entire cursor layer (cursor + click effects)
      filter: hasRefocusBlur ? `blur(${refocusBlurPx}px)` : undefined,
      clipPath: !debugEnabled && !isMockup && !useContainerTransform && mockupClip
        ? `inset(${mockupClip.top}px ${mockupClip.right}px ${mockupClip.bottom}px ${mockupClip.left}px round ${mockupClip.radius}px)`
        : undefined,
      // NO transition - must be deterministic/frame-perfect
    }}>
      <div
        style={{
          position: 'absolute',
          left: isMockup && mockup.position ? mockup.position.screenX : 0,
          top: isMockup && mockup.position ? mockup.position.screenY : 0,
          width: isMockup && mockup.position ? mockup.position.screenWidth : '100%',
          height: isMockup && mockup.position ? mockup.position.screenHeight : '100%',
          transform: useContainerTransform ? transforms.combined : undefined,
          transformOrigin: '50% 50%',
          overflow: isMockup ? 'hidden' : undefined,
          borderRadius: isMockup && mockup.position
            ? mockup.position.screenCornerRadius
            : undefined,
          pointerEvents: 'none',
        }}
      >
        {/* Motion blur trail */}
        {motionBlurTrail}

        {/* Click effects */}
        {clickEffects}

        {/* Main cursor */}
        <div
          data-cursor-layer="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate3d(${stableCursorX}px, ${stableCursorY}px, 0)`,
            opacity: cursorState.opacity,
            zIndex: 100,
            pointerEvents: 'none',
            filter: cursorShadow,
            willChange: 'transform, opacity',
          }}
        >
          <Img
            src={getCursorImagePath(cursorType)}
            style={{
              width: renderedWidth,
              height: renderedHeight,
              transform: `perspective(${cursorPerspective}px) rotateX(${cursorTiltX}deg) rotateY(${cursorTiltY}deg) rotateZ(${cursorRotation}deg) scale(${clickScale})`,
              transformOrigin: `${hotspot.x * renderedWidth}px ${hotspot.y * renderedHeight}px`,
              imageRendering: 'auto',
              willChange: 'transform',
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden',
              filter: cursorMotionBlurPx > 0 ? `blur(${cursorMotionBlurPx}px)` : undefined,
              transition: 'none' // Disable CSS transitions for smoother frame-by-frame animation
            }}
          />
        </div>
      </div>
      {debugEnabled && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
          {mockupClip && (
            <div
              style={{
                position: 'absolute',
                left: mockupClip.left,
                top: mockupClip.top,
                width: videoWidth - mockupClip.left - mockupClip.right,
                height: videoHeight - mockupClip.top - mockupClip.bottom,
                border: '2px solid #ff3b30',
                borderRadius: mockupClip.radius,
                boxSizing: 'border-box',
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              left: videoOffset.x,
              top: videoOffset.y,
              width: videoOffset.width,
              height: videoOffset.height,
              border: '2px dashed #0a84ff',
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: debugTipXAbs - 4,
              top: debugTipYAbs - 4,
              width: 8,
              height: 8,
              borderRadius: 999,
              background: '#34c759',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.6)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: debugHotspotXAbs - 4,
              top: debugHotspotYAbs - 4,
              width: 8,
              height: 8,
              borderRadius: 999,
              background: '#ffd60a',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.6)',
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
});

CursorLayer.displayName = 'CursorLayer'
