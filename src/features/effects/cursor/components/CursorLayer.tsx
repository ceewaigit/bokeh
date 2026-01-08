import React, { useMemo, useEffect } from 'react';
import { AbsoluteFill, Img, delayRender, continueRender, useVideoConfig } from 'remotion';
import type { CursorEffectData, MouseEvent, ClickEvent, Recording } from '@/types/project';
import { CursorTheme, EffectType } from '@/types/project';
import {
  CursorType,
  getCursorDimensions,
  getCursorHotspot,
  getCursorImagePath,
} from '../store/cursor-types';
import { calculateCursorState, getClickTextStyle, resolveClickEffectConfig } from '../logic/cursor-logic';
import { DEFAULT_CURSOR_DATA } from '@/features/effects/cursor/config';
import { CURSOR_CONSTANTS } from '@/features/effects/cursor/constants';

import { normalizeClickEvents, normalizeMouseEvents } from '@/features/rendering/renderer/compositions/utils/events/event-normalizer';
import { useTimelineContext } from '@/features/rendering/renderer/context/TimelineContext';
import { getEffectByType } from '@/features/effects/core/filters';

import { useRecordingMetadata } from '@/features/rendering/renderer/hooks/media/useRecordingMetadata';
import { useCoordinateMapping } from '@/features/rendering/renderer/hooks/layout/useCoordinateMapping';

// Fixed reference width for resolution-agnostic cursor sizing.
// Cursor is designed at 1080p (1920px width) - all resolutions scale relative to this.
const CURSOR_REFERENCE_WIDTH = CURSOR_CONSTANTS.REFERENCE_WIDTH;

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
  const { compositionWidth, compositionHeight, resources } = useTimelineContext();
  const metadataUrls = resources.metadataUrls;

  // Pull Context Data (SSOT)
  const { mapNormalizedPoint, videoPosition } = useCoordinateMapping();
  const {
    // Clip Data
    effectiveClipData: activeClipData,
    // Transforms
    zoomTransform,
    // Effects
    refocusBlurPx,
    mockupEnabled,
    mockupPosition
  } = videoPosition;

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
    inlineMetadata: recording?.metadata,
    isExternal: recording?.isExternal,
    capabilities: recording?.capabilities,
  });

  // NOTE: Do NOT early return here - it violates React Rules of Hooks
  // All hooks must be called unconditionally; we handle generated recordings at the end

  const cursorEffect = useMemo(() => {
    const effectsToUse = activeClipData?.effects ?? [];
    return activeClipData ? getEffectByType(effectsToUse, EffectType.Cursor) : undefined;
  }, [activeClipData]);

  const cursorData = (cursorEffect?.data as CursorEffectData | undefined);
  const cursorTheme = cursorData?.theme ?? CursorTheme.Default;
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

  // Normalize events: converts timestamps to source space AND coordinates to 0-1 range
  const cursorEvents = useMemo(() => normalizeMouseEvents(rawCursorEvents), [rawCursorEvents]);
  // Pass cursor events as reference for capture dimensions
  const clickEvents = useMemo(() => normalizeClickEvents(rawClickEvents, cursorEvents), [rawClickEvents, cursorEvents]);

  const currentSourceTime = activeClipData?.sourceTimeMs ?? 0;

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
    return calculateCursorState(
      cursorData,
      cursorEvents,
      clickEvents,
      currentSourceTime,
      fps,
      Boolean(isImageWithSyntheticEvents)
    );
  }, [clickEvents, cursorData, cursorEvents, currentSourceTime, fps, isImageWithSyntheticEvents]);

  // Extract values from cursor state
  const cursorType = cursorState.type;
  const cursorPosition = useMemo(() => 
    cursorState.opacity > 0 ? { x: cursorState.x, y: cursorState.y } : null
  , [cursorState.opacity, cursorState.x, cursorState.y]);

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

  // --- COORDINATE MAPPING (SSOT) ---

  // Cursor coordinates are PRE-NORMALIZED to 0-1 range by normalizeMouseEvents().
  // For mockups, clamp to keep the cursor inside the device screen.
  // Note: cursorState.x/y are normalized (0-1)
  const shouldClampToScreen = Boolean(mockupEnabled);
  
  // Map cursor position to screen pixels using the hook
  const mappedCursor = useMemo(() => {
    if (!cursorPosition) return { x: 0, y: 0 };
    return mapNormalizedPoint(
      { x: cursorPosition.x, y: cursorPosition.y },
      { clampToScreen: shouldClampToScreen, applyTransform: true }
    );
  }, [cursorPosition, mapNormalizedPoint, shouldClampToScreen]);
  
  // Apply cursor size from cursor state
  const cursorSize = cursorState.scale;

  // Get cursor hotspot and dimensions (theme-aware)
  const hotspot = getCursorHotspot(cursorType, cursorTheme);
  const dimensions = getCursorDimensions(cursorType, cursorTheme);

  // Cursor sizing is RESOLUTION-AGNOSTIC: uses fixed 1080p reference (CURSOR_REFERENCE_WIDTH).
  // This ensures identical cursor size whether source is 720p, 1080p, 4K, or 8K.
  // Only the output/composition dimensions affect visual cursor size.
  const cursorScaleBaseWidth = mockupEnabled && mockupPosition
    ? mockupPosition.screenWidth
    : compositionWidth;
    
  const videoDisplayScale = useMemo(() => {
    // Scale cursor relative to fixed 1080p reference, not source resolution.
    // - At 1920px composition: scale = 1.0
    // - At 1280px composition: scale = 0.67
    // - At 3840px composition: scale = 2.0
    return cursorScaleBaseWidth / CURSOR_REFERENCE_WIDTH;
  }, [cursorScaleBaseWidth]);

  // Get zoom scale from transform - cursor should scale with zoom to maintain visual proportion
  const zoomScale = zoomTransform?.scale ?? 1;
  const debugEnabled = typeof window !== 'undefined' && Boolean((window as any).__ssDebugMockup);

  const clickEffects = useMemo(() => {
    if (!cursorState.clickEffects.length) return null;

    const elements = cursorState.clickEffects.map((effect, index) => {
      // Click effect coordinates are PRE-NORMALIZED to 0-1 range (from cursor-logic.ts)
      // Map to screen pixels
      const mappedClick = mapNormalizedPoint(
        { x: effect.x, y: effect.y },
        { clampToScreen: shouldClampToScreen, applyTransform: true }
      );

      const clickX = mappedClick.x;
      const clickY = mappedClick.y;

      // Apply both videoDisplayScale (for composition size) and zoomScale (for zoom level)
      const effectScale = videoDisplayScale * zoomScale;
      const ringRadius = effect.radius * effectScale;
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
                border: `${clickEffectConfig.lineWidth * effectScale}px solid ${clickEffectConfig.color}`,
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
                transform: `translate3d(-50%, ${textStyle.offsetY * effectScale}px, 0) scale(${textStyle.scale})`,
                opacity: textOpacity,
                color: clickEffectConfig.textColor,
                fontSize: clickEffectConfig.textSize * effectScale,
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
    clickEffectConfig,
    cursorState.clickEffects,
    cursorState.opacity,
    videoDisplayScale,
    zoomScale,
    mapNormalizedPoint,
    shouldClampToScreen
  ]);

  // Calculate the rendered size of the cursor - fixed size regardless of source resolution,
  // but scales proportionally with zoom to maintain visual proportion relative to content
  const renderedWidth = dimensions.width * cursorSize * videoDisplayScale * zoomScale;
  const renderedHeight = dimensions.height * cursorSize * videoDisplayScale * zoomScale;

  const motionBlurIntensity = cursorData?.motionBlurIntensity ?? DEFAULT_CURSOR_DATA.motionBlurIntensity ?? 40;
  const motionBlurEnabled = (cursorData?.motionBlur ?? DEFAULT_CURSOR_DATA.motionBlur ?? true) && motionBlurIntensity > 0;
  const motionBlurSample = motionBlurEnabled ? cursorState.motionBlur : undefined;

  // Motion blur previousX/Y are PRE-NORMALIZED to 0-1 range (from cursor-logic.ts)
  const previousNormalizedX = motionBlurSample
    ? (shouldClampToScreen ? Math.max(0, Math.min(1, motionBlurSample.previousX)) : motionBlurSample.previousX)
    : null;
  const previousNormalizedY = motionBlurSample
    ? (shouldClampToScreen ? Math.max(0, Math.min(1, motionBlurSample.previousY)) : motionBlurSample.previousY)
    : null;

  const mappedPrevious = useMemo(() => {
    if (previousNormalizedX === null || previousNormalizedY === null) return null;
    return mapNormalizedPoint(
      { x: previousNormalizedX, y: previousNormalizedY },
      { clampToScreen: shouldClampToScreen, applyTransform: true }
    );
  }, [previousNormalizedX, previousNormalizedY, mapNormalizedPoint, shouldClampToScreen]);
  
  // Initialize cursor position
  const cursorTipX = mappedCursor.x;
  const cursorTipY = mappedCursor.y;
  const previousTipX = mappedPrevious?.x ?? null;
  const previousTipY = mappedPrevious?.y ?? null;

  // Apply hotspot offset
  const cursorX = cursorTipX - hotspot.x * renderedWidth;
  const cursorY = cursorTipY - hotspot.y * renderedHeight;
  const previousCursorX = previousTipX != null ? previousTipX - hotspot.x * renderedWidth : null;
  const previousCursorY = previousTipY != null ? previousTipY - hotspot.y * renderedHeight : null;

  // Stabilize sub-pixel transforms to avoid shadow flicker on some GPUs.
  const stableCursorX = Math.round(cursorX * 100) / 100;
  const stableCursorY = Math.round(cursorY * 100) / 100;

  const debugTipXAbs = mappedCursor.x;
  const debugTipYAbs = mappedCursor.y;
  // Hotspot visualization - where the "click" actually happens
  const debugHotspotXAbs = debugTipXAbs; 
  const debugHotspotYAbs = debugTipYAbs;

  // Subtle shadow on main cursor - slightly reduced when motion blur trails are active
  const cursorShadow = motionBlurEnabled
    ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))'
    : 'drop-shadow(0 1px 2px rgba(0,0,0,0.18))';

  // Simple cursor motion blur - clean CSS blur proportional to velocity
  const cursorMotionBlurPx = useMemo(() => {
    if (!motionBlurEnabled || !motionBlurSample) return 0;
    
    // Convert normalized velocity back to reference pixels for thresholding
    // This preserves the visual feel of existing thresholds (6px, 28px etc)
    const velocityPx = motionBlurSample.velocity * CURSOR_REFERENCE_WIDTH;
    
    const intensity = motionBlurIntensity / 100;
    // Gate low-speed blur to avoid mushiness during micro-movements.
    const minVelocity = 6;
    const maxVelocity = 28;
    if (velocityPx < minVelocity) return 0;
    const t = Math.min(1, Math.max(0, (velocityPx - minVelocity) / (maxVelocity - minVelocity)));
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
    
    // Convert normalized velocity back to reference pixels for easing
    const velocityPx = motionBlurSample.velocity * CURSOR_REFERENCE_WIDTH;
    
    const trailOffset = Math.min(12, distance * 0.4);
    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    const velocityEase = Math.min(1, Math.max(0, (velocityPx - 8) / 24));
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
          src={getCursorImagePath(cursorType, cursorTheme)}
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
    cursorTheme,
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

  // Refocus blur is now provided by VideoPositionContext (SSOT)
  const effectiveRefocusBlurPx = refocusBlurPx ?? 0;


  const hasRefocusBlur = effectiveRefocusBlurPx > 0.01;
  const mockupClip = useMemo(() => {
    if (!mockupEnabled || !mockupPosition) return null;
    const left = mockupPosition.screenX;
    const top = mockupPosition.screenY;
    const right = Math.max(0, compositionWidth - (mockupPosition.screenX + mockupPosition.screenWidth));
    const bottom = Math.max(0, compositionHeight - (mockupPosition.screenY + mockupPosition.screenHeight));
    return {
      left,
      top,
      right,
      bottom,
      radius: mockupPosition.screenCornerRadius,
    };
  }, [compositionHeight, mockupEnabled, mockupPosition, compositionWidth]);

  if (!shouldShowCursor && !debugEnabled) {
    return <AbsoluteFill style={{ opacity: 0, pointerEvents: 'none', zIndex: 200 }} />;
  }

  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      zIndex: 200,
      // Apply refocus blur to entire cursor layer (cursor + click effects)
      filter: hasRefocusBlur ? `blur(${effectiveRefocusBlurPx}px)` : undefined,
      clipPath: !debugEnabled && mockupClip
        ? `inset(${mockupClip.top}px ${mockupClip.right}px ${mockupClip.bottom}px ${mockupClip.left}px round ${mockupClip.radius}px)`
        : undefined,
      // NO transition - must be deterministic/frame-perfect
    }}>
      <div
        style={{
          position: 'absolute',
          inset: 0, // Full screen, no offsets or transforms
          overflow: 'visible', // Clipping handled by parent clipPath
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
            src={getCursorImagePath(cursorType, cursorTheme)}
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
	                width: compositionWidth - mockupClip.left - mockupClip.right,
	                height: compositionHeight - mockupClip.top - mockupClip.bottom,
	                border: '2px solid #ff3b30',
	                borderRadius: mockupClip.radius,
	                boxSizing: 'border-box',
	              }}
	            />
	          )}
          <div
            style={{
              position: 'absolute',
              left: videoPosition.offsetX,
              top: videoPosition.offsetY,
              width: videoPosition.drawWidth,
              height: videoPosition.drawHeight,
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
