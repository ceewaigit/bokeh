/**
 * SharedVideoController.tsx
 *
 * Central video orchestration component for the Remotion composition.
 * Manages video clip rendering, transforms, and visual effects for both
 * preview playback and export rendering modes.
 *
 * Key responsibilities:
 * - Determines which clips to render based on current frame position
 * - Calculates and applies zoom, crop, and 3D screen transforms
 * - Handles memory-efficient clip rendering (only active + boundary clips)
 * - Manages camera motion blur during zoom transitions
 * - Coordinates between PreviewVideoRenderer (interactive) and VideoClipRenderer (export)
 *
 * Memory Optimization Strategy:
 * - Preview mode: Only renders clips within a small window (prev/current/next)
 * - Export mode: Renders all clips needed for correctness
 * - Prevents VTDecoderXPCService from accumulating decoded frames for ALL clips
 *
 * @see VideoClipRenderer for Remotion Sequence-based export rendering
 * @see PreviewVideoRenderer for interactive preview rendering
 * @see GeneratedClipRenderer for plugin-generated clips
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Video, OffthreadVideo, AbsoluteFill, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion';
import { useTimeContext } from '../context/TimeContext';
import { useProjectStore } from '@/stores/project-store';
import { VideoPositionProvider } from '../context/VideoPositionContext';
import { calculateVideoPosition } from './utils/video-position';
import {
  calculateZoomTransform,
  getZoomTransformString,
  createMotionBlurSvg,
  getMotionBlurConfig,
} from './utils/zoom-transform';
import { calculateCameraMotionBlur } from './utils/camera-motion-blur';
import { calculateScreenTransform } from './utils/screen-transform';
import { calculateCropTransform, getCropTransformString } from './utils/crop-transform';
import { EffectType } from '@/types/project';
import type { CropEffectData } from '@/types/project';
import type { SharedVideoControllerProps } from '@/types';
import { EffectsFactory } from '@/lib/effects/effects-factory';
import type { Recording } from '@/types/project';
import {
  buildFrameLayout,
  findActiveFrameLayoutIndex,
  getBoundaryOverlapState,
  getVisibleFrameLayout,
  type FrameLayoutItem,
} from '@/lib/timeline/frame-layout';
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame';
import { usePrecomputedCameraPath } from '@/remotion/hooks/usePrecomputedCameraPath';
import { useRecordingMetadata } from '@/remotion/hooks/useRecordingMetadata';
import { getMaxZoomScale } from '@/remotion/hooks/useVideoUrl';
import { useRenderDelay } from '@/remotion/hooks/useRenderDelay';
import { SafeVideo } from '@/remotion/components/video-helpers';
import { PreviewVideoRenderer } from './renderers/PreviewVideoRenderer';
import { VideoClipRenderer } from './renderers/VideoClipRenderer';
import { GeneratedClipRenderer } from './renderers/GeneratedClipRenderer';
import { MockupLayer } from './layers/MockupLayer';
import { calculateMockupPosition, type MockupPositionResult } from '@/lib/mockups/mockup-transform';
import { PreviewGuides } from '@/components/preview-guides';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Props for the SharedVideoController component.
 */
/**
 * Internal state for tracking preview video across generated clip transitions.
 */
type PreviewVideoState = {
  recording: Recording;
  clip: any;
  layoutItem: FrameLayoutItem;
  sourceTimeMs: number;
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Central video orchestration component for the Remotion composition.
 *
 * This component serves as the main controller for video rendering, managing:
 * - Which clips are currently visible and should be rendered
 * - All visual transforms (zoom, crop, 3D screen effects)
 * - Memory optimization by limiting concurrent video decoders
 * - Camera motion blur calculations for smooth zoom transitions
 *
 * The component operates in two modes:
 * 1. **Preview mode** (isRendering=false): Uses PreviewVideoRenderer with native
 *    HTML video for responsive scrubbing, only renders active clip
 * 2. **Export mode** (isRendering=true): Uses VideoClipRenderer with Remotion
 *    Sequences for frame-accurate rendering of all visible clips
 *
 * @remarks
 * - Uses frame layout system to determine clip visibility and timing
 * - Precomputes camera path for smooth zoom transitions
 * - Implements sophisticated memory optimization to prevent VTDecoder leaks
 */
export const SharedVideoController: React.FC<SharedVideoControllerProps> = ({
  videoWidth,
  videoHeight,
  sourceVideoWidth,
  sourceVideoHeight,
  effects,
  children,
  cameraSettings,

  // New Config Objects
  resources,
  playback,
  renderSettings,
  cropSettings,
}) => {
  // ==========================================================================
  // REMOTION HOOKS & CONTEXT
  // ==========================================================================
  const currentFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { fps, clips, getRecording, recordingsMap } = useTimeContext();
  const { isRendering } = getRemotionEnvironment();
  const isPreview = !isRendering;

  // Destructure for easier access internally
  const { isPlaying, isScrubbing, isHighQualityPlaybackEnabled, previewMuted, previewVolume } = playback;
  const { isGlowMode, isEditingCrop, preferOffthreadVideo, enhanceAudio } = renderSettings;
  const { cropData, onCropChange, onCropConfirm, onCropReset } = cropSettings;
  const { videoUrls, videoUrlsHighRes, videoFilePaths, metadataUrls } = resources;

  // ==========================================================================
  // TIMELINE & FRAME LAYOUT
  // ==========================================================================
  const currentTimeMs = (currentFrame / fps) * 1000;
  const cameraPathCache = useProjectStore((s) => s.cameraPathCache)

  /** Clips sorted by start time for consistent processing */
  const sortedClips = useMemo(() => [...clips].sort((a, b) => a.startTime - b.startTime), [clips]);

  /** Pre-computed frame layout for all clips (grouping, timing, etc.) */
  const frameLayout = useMemo(() => buildFrameLayout(sortedClips, fps), [sortedClips, fps]);

  /** Quick lookup: clip ID -> layout index */
  const layoutIndexByClipId = useMemo(() => {
    const map = new Map<string, number>();
    frameLayout.forEach((item, index) => {
      map.set(item.clip.id, index);
    });
    return map;
  }, [frameLayout]);

  // ==========================================================================
  // ACTIVE CLIP DETECTION
  // ==========================================================================
  /** Data for the clip at the current frame (clip, recording, timing, effects) */
  const activeClipData = useMemo(() => {
    return getActiveClipDataAtFrame({ frame: currentFrame, frameLayout, fps, effects, getRecording });
  }, [currentFrame, effects, fps, frameLayout, getRecording]);

  const activeRecording = activeClipData?.recording ?? null;

  // ==========================================================================
  // METADATA LOADING (lazy, for mouse events etc.)
  // ==========================================================================
  const { metadata: lazyMetadata } = useRecordingMetadata({
    recordingId: activeRecording?.id || '',
    folderPath: activeRecording?.folderPath,
    metadataChunks: activeRecording?.metadataChunks,
    metadataUrls,
    inlineMetadata: activeRecording?.metadata,
  });

  const loadedMetadata = useMemo(() => {
    if (!activeRecording?.id || !lazyMetadata) return undefined;
    return new Map([[activeRecording.id, lazyMetadata]]);
  }, [activeRecording?.id, lazyMetadata]);

  // ==========================================================================
  // ZOOM & RESOLUTION
  // ==========================================================================
  /** Maximum zoom scale across all zoom effects (for resolution selection) */
  const memoizedMaxZoomScale = useMemo(() => getMaxZoomScale(effects), [effects]);

  // ==========================================================================
  // LAYOUT ITEM NAVIGATION
  // ==========================================================================
  const activeLayoutIndex = useMemo(() => findActiveFrameLayoutIndex(frameLayout, currentFrame), [frameLayout, currentFrame]);
  const activeLayoutItem = activeLayoutIndex >= 0 ? frameLayout[activeLayoutIndex] : null;
  const prevLayoutItem = activeLayoutIndex > 0 ? frameLayout[activeLayoutIndex - 1] : null;
  const nextLayoutItem = activeLayoutIndex >= 0 && activeLayoutIndex < frameLayout.length - 1 ? frameLayout[activeLayoutIndex + 1] : null;

  // ==========================================================================
  // BOUNDARY OVERLAP STATE
  // ==========================================================================
  /**
   * Determines when to show overlapping clips during transitions.
   * Memory optimizations:
   * - Skip overlap during normal playback to reduce decoder count
   * - Shorter overlap for high-res source videos
   * - Disable overlap entirely during scrubbing
   */
  const boundaryState = useMemo(() => {
    // During normal playback, skip boundary overlap to keep only 1 decoder active
    if (!isRendering && isPlaying && !isScrubbing) {
      return {
        isNearBoundaryStart: false,
        isNearBoundaryEnd: false,
        shouldHoldPrevFrame: false,
        overlapFrames: 0,
      };
    }
    return getBoundaryOverlapState({
      currentFrame, fps, isRendering, activeLayoutItem, prevLayoutItem, nextLayoutItem,
      sourceWidth: sourceVideoWidth, sourceHeight: sourceVideoHeight,
      isScrubbing,
    });
  }, [currentFrame, fps, isRendering, isPlaying, isScrubbing, activeLayoutItem, prevLayoutItem, nextLayoutItem, sourceVideoWidth, sourceVideoHeight]);

  const { isNearBoundaryStart, isNearBoundaryEnd, shouldHoldPrevFrame, overlapFrames } = boundaryState;

  // MEMORY FIX: Scrub keep-alive disabled - was causing VTDecoder leak (3.5GB+)
  const keepVideoWarmOnScrub = false;
  const scrubKeepAliveFrames = 0;

  // STABILITY: Track previous renderable items to prevent unnecessary remounts
  const prevRenderableIdsRef = useRef<string>('');
  const prevRenderableItemsRef = useRef<FrameLayoutItem[]>([]);

  // ==========================================================================
  // RENDERABLE ITEMS CALCULATION
  // ==========================================================================
  /**
   * Determines which clips to render based on current mode:
   * - Preview: Only active clip + neighbors when active is generated
   * - Export: Active clip + boundary overlap clips for smooth transitions
   */
  const renderableItems = useMemo(() => {
    // Helper: Check if a layout item is a generated (non-video) clip
    const isGeneratedItem = (item: FrameLayoutItem | null) => {
      if (!item) return false;
      return recordingsMap.get(item.clip.recordingId)?.sourceType === 'generated';
    };

    // Helper: Find previous non-generated clip
    const findPrevVideo = (startIndex: number) => {
      for (let i = startIndex - 1; i >= 0; i -= 1) {
        const candidate = frameLayout[i];
        if (!isGeneratedItem(candidate)) return candidate;
      }
      return null;
    };

    // Helper: Find next non-generated clip
    const findNextVideo = (startIndex: number) => {
      for (let i = startIndex + 1; i < frameLayout.length; i += 1) {
        const candidate = frameLayout[i];
        if (!isGeneratedItem(candidate)) return candidate;
      }
      return null;
    };

    // PREVIEW MODE: Optimize to minimize concurrent decoders
    if (!isRendering && activeLayoutItem) {
      const itemsByGroupId = new Map<string, FrameLayoutItem>();
      const activeIsGenerated = isGeneratedItem(activeLayoutItem);
      const shouldIncludePrevVideo = keepVideoWarmOnScrub || activeIsGenerated;
      const shouldIncludeNextVideo = keepVideoWarmOnScrub || activeIsGenerated;

      // Include prev video clip if needed (for warm transition from generated)
      if (shouldIncludePrevVideo) {
        const prevVideo = findPrevVideo(activeLayoutIndex);
        if (prevVideo && !itemsByGroupId.has(prevVideo.groupId)) {
          itemsByGroupId.set(prevVideo.groupId, prevVideo);
        }
      }

      // Include next video clip if needed (for warm transition to generated)
      if (shouldIncludeNextVideo) {
        const nextVideo = findNextVideo(activeLayoutIndex);
        if (nextVideo && !itemsByGroupId.has(nextVideo.groupId)) {
          itemsByGroupId.set(nextVideo.groupId, nextVideo);
        }
      }

      // Active clip always wins when sharing group with neighbors
      itemsByGroupId.set(activeLayoutItem.groupId, activeLayoutItem);

      return Array.from(itemsByGroupId.values())
        .sort((a, b) => a.startFrame - b.startFrame);
    }

    // EXPORT MODE: Use full visibility calculation for correctness
    const items = getVisibleFrameLayout({
      frameLayout,
      currentFrame,
      fps,
      isRendering,
      prevLayoutItem,
      nextLayoutItem,
      activeLayoutItem,
      shouldHoldPrevFrame,
      isNearBoundaryEnd,
    });

    // Deduplicate by groupId (O(N) with Map vs O(N²) with filter)
    const uniqueItems = new Map<string, FrameLayoutItem>();
    for (const item of items) {
      if (!uniqueItems.has(item.groupId)) {
        uniqueItems.set(item.groupId, item);
      }
    }

    const sortedItems = Array.from(uniqueItems.values())
      .sort((a, b) => a.startFrame - b.startFrame);

    // STABILITY FIX: Return previous array reference if groupIds haven't changed
    // This prevents VideoClipRenderer remounts when only play/pause state changes
    const currentIds = sortedItems.map(i => i.groupId).join(',');
    if (currentIds === prevRenderableIdsRef.current) {
      return prevRenderableItemsRef.current;
    }

    // GroupIds changed - update refs and return new array
    prevRenderableIdsRef.current = currentIds;
    prevRenderableItemsRef.current = sortedItems;
    return sortedItems;
  }, [
    frameLayout,
    currentFrame,
    fps,
    isRendering,
    isPlaying,
    isScrubbing,
    keepVideoWarmOnScrub,
    activeLayoutIndex,
    prevLayoutItem,
    nextLayoutItem,
    activeLayoutItem,
    shouldHoldPrevFrame,
    isNearBoundaryEnd,
    recordingsMap,
  ]);

  // ==========================================================================
  // RENDER DELAY (for export synchronization)
  // ==========================================================================
  const { markRenderReady, handleVideoReady } = useRenderDelay(isRendering);

  // ==========================================================================
  // PRECOMPUTED CAMERA PATH (zoom animations)
  // ==========================================================================
  const precomputedCamera = usePrecomputedCameraPath({
    enabled: true, isRendering, currentFrame, frameLayout, fps, videoWidth, videoHeight,
    sourceVideoWidth, sourceVideoHeight, effects, getRecording, loadedMetadata,
    cachedPath: cameraPathCache
  });

  const calculatedZoomBlock = precomputedCamera?.activeZoomBlock;
  const calculatedZoomCenter = precomputedCamera?.zoomCenter ?? { x: 0.5, y: 0.5 };

  // ==========================================================================
  // RENDER DATA COMPUTATION
  // ==========================================================================

  // FREEZE LOGIC: Capture layout dimensions when entering crop mode to prevent drift
  // during playback (due to animated padding, resolution changes, etc).
  // We track the *last* valid geometry to use as the frozen state.
  interface FrozenLayout {
    drawWidth: number;
    drawHeight: number;
    offsetX: number;
    offsetY: number;
    padding: number;
    scaleFactor: number;
    activeSourceWidth: number;
    activeSourceHeight: number;
    mockupPosition: MockupPositionResult | null;
  }
  const frozenLayoutRef = useRef<FrozenLayout | null>(null);

  // Clear frozen state when not editing
  useEffect(() => {
    if (!isEditingCrop) {
      frozenLayoutRef.current = null;
    }
  }, [isEditingCrop]);

  /**
   * Computes all rendering data for the current frame:
   * - Background styling (padding, corner radius, shadow)
   * - Video positioning and dimensions
   * - Zoom, crop, and 3D transforms
   */
  const computedRenderData = useMemo(() => {
    let effectiveClipData = activeClipData;

    // Handle boundary cases: get clip data from adjacent clips when near transitions
    if (!effectiveClipData && !isRendering) {
      if (isNearBoundaryStart && prevLayoutItem) {
        effectiveClipData = getActiveClipDataAtFrame({
          frame: activeLayoutItem!.startFrame - 1, frameLayout, fps, effects, getRecording,
        });
      } else if (isNearBoundaryEnd && nextLayoutItem) {
        effectiveClipData = getActiveClipDataAtFrame({
          frame: nextLayoutItem.startFrame, frameLayout, fps, effects, getRecording,
        });
      }
    }
    if (!effectiveClipData) return null;

    const { clip, recording, sourceTimeMs, effects: clipEffects } = effectiveClipData;

    // Extract background effect data
    const backgroundEffect = EffectsFactory.getActiveEffectAtTime(clipEffects, EffectType.Background, sourceTimeMs);
    const backgroundData = backgroundEffect ? EffectsFactory.getBackgroundData(backgroundEffect) : null;

    // Calculate LIVE values first
    const livePadding = backgroundData?.padding || 0;

    const REFERENCE_WIDTH = 1920;
    const REFERENCE_HEIGHT = 1080;
    const liveScaleFactor = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
    const liveActiveSourceWidth = recording.width || sourceVideoWidth || videoWidth;
    const liveActiveSourceHeight = recording.height || sourceVideoHeight || videoHeight;

    // FREEZE LOGIC APPLIED HERE
    // If we have a frozen layout and we are editing crop, use it.
    // Otherwise calculate fresh.
    let layout: FrozenLayout;

    if (isEditingCrop && frozenLayoutRef.current) {
      layout = frozenLayoutRef.current;
    } else {
      // Compute fresh layout
      const paddingScaled = livePadding * liveScaleFactor;
      const vidPos = calculateVideoPosition(
        width, height, liveActiveSourceWidth, liveActiveSourceHeight, paddingScaled
      );

      let mockupPosition: MockupPositionResult | null = null;
      if (backgroundData?.mockup?.enabled) {
        mockupPosition = calculateMockupPosition(
          width, height, backgroundData.mockup, liveActiveSourceWidth, liveActiveSourceHeight, paddingScaled
        );
      }

      layout = {
        drawWidth: Math.round(vidPos.drawWidth),
        drawHeight: Math.round(vidPos.drawHeight),
        offsetX: Math.round(vidPos.offsetX),
        offsetY: Math.round(vidPos.offsetY),
        padding: livePadding,
        scaleFactor: liveScaleFactor,
        activeSourceWidth: liveActiveSourceWidth,
        activeSourceHeight: liveActiveSourceHeight,
        mockupPosition
      };

      // If we are editing, capture this as the frozen state (first frame only)
      if (isEditingCrop && !frozenLayoutRef.current) {
        frozenLayoutRef.current = layout;
      }
    }

    // Destructure the authoritative layout
    const {
      drawWidth, drawHeight, offsetX, offsetY, padding, scaleFactor,
      activeSourceWidth, activeSourceHeight, mockupPosition
    } = layout;

    // Derive dependent values from authoritative layout
    const paddingScaled = padding * scaleFactor;
    const cornerRadius = (backgroundData?.cornerRadius || 0) * scaleFactor;
    const shadowIntensity = backgroundData?.shadowIntensity || 0;
    const mockupData = backgroundData?.mockup;
    const mockupEnabled = mockupData?.enabled ?? false;

    // Zoom/Crop Logic (using authorized dimensions)
    const zoomDrawWidth = mockupEnabled && mockupPosition ? mockupPosition.mockupWidth : drawWidth;
    const zoomDrawHeight = mockupEnabled && mockupPosition ? mockupPosition.mockupHeight : drawHeight;
    const zoomCenterForMockup = mockupEnabled && mockupPosition ? {
      x: (mockupPosition.videoX + calculatedZoomCenter.x * mockupPosition.videoWidth - mockupPosition.mockupX) / mockupPosition.mockupWidth,
      y: (mockupPosition.videoY + calculatedZoomCenter.y * mockupPosition.videoHeight - mockupPosition.mockupY) / mockupPosition.mockupHeight,
    } : calculatedZoomCenter;

    // Calculate zoom transform
    const fillScale = zoomDrawWidth > 0 && zoomDrawHeight > 0 ? Math.max(width / zoomDrawWidth, height / zoomDrawHeight) : 1;
    const zoomOverrideScale = calculatedZoomBlock?.autoScale === 'fill' ? fillScale : undefined;

    const zoomTransform = calculateZoomTransform(
      calculatedZoomBlock,
      currentTimeMs,
      zoomDrawWidth,
      zoomDrawHeight,
      zoomCenterForMockup,
      zoomOverrideScale,
      paddingScaled,
      calculatedZoomBlock?.autoScale === 'fill',
      Boolean(mockupEnabled)
    );
    const zoomTransformStr = getZoomTransformString(zoomTransform);

    // Calculate crop transform
    const cropEffect = EffectsFactory.getActiveEffectAtTime(clipEffects, EffectType.Crop, currentTimeMs);
    const resolvedCropData = isEditingCrop ? null : cropEffect ? (cropEffect.data as CropEffectData) : null;

    // IMPORTANT: Crop uses the VIDEO dimensions, derived from the frozen/live layout
    const cropBaseDrawWidth = mockupEnabled && mockupPosition ? mockupPosition.videoWidth : drawWidth;
    const cropBaseDrawHeight = mockupEnabled && mockupPosition ? mockupPosition.videoHeight : drawHeight;

    const cropTransform = calculateCropTransform(
      resolvedCropData,
      cropBaseDrawWidth,
      cropBaseDrawHeight
    );

    const cropTransformStr = getCropTransformString(cropTransform);

    // Bake corner radius into the clip-path if present
    const cropClipPath = cropTransform.isActive && cropTransform.clipPath && cornerRadius > 0
      ? `${cropTransform.clipPath.slice(0, -1)} round ${cornerRadius / cropTransform.scale}px)`
      : cropTransform.clipPath;

    // Calculate 3D screen transform
    const extra3DTransform = calculateScreenTransform(clipEffects, currentTimeMs);

    return {
      clip, recording, sourceTimeMs, clipEffects, backgroundData, padding, cornerRadius, shadowIntensity,
      scaleFactor, activeSourceWidth, activeSourceHeight, drawWidth, drawHeight, offsetX, offsetY,

      // CRITICAL: Disable all transforms when editing crop to prevent drift
      outerTransform: isEditingCrop ? '' : zoomTransformStr,
      cropTransformStr,
      extra3DTransform: isEditingCrop ? '' : extra3DTransform,

      // Force zoomTransform to null when editing crop so VideoPositionContext consumers 
      // see the raw, un-zoomed dimensions/coordinates.
      zoomTransform: isEditingCrop ? null : zoomTransform,

      cropTransform,
      cropClipPath,
      cropEffectId: cropEffect?.id,
      mockupEnabled, mockupData, mockupPosition,
    };
  }, [activeClipData, width, height, videoWidth, videoHeight, sourceVideoWidth, sourceVideoHeight, calculatedZoomBlock, calculatedZoomCenter, currentTimeMs, isEditingCrop, isNearBoundaryStart, isNearBoundaryEnd, prevLayoutItem, nextLayoutItem, activeLayoutItem, frameLayout, fps, effects, getRecording, isRendering]);

  // Keep last valid render data for stability during transitions
  const lastRenderDataRef = useRef<typeof computedRenderData | null>(null);
  useEffect(() => { if (computedRenderData) lastRenderDataRef.current = computedRenderData; }, [computedRenderData]);
  const renderData = computedRenderData ?? lastRenderDataRef.current;

  // Track last video state for generated clip transitions
  const lastVideoStateRef = useRef<PreviewVideoState | null>(null);

  // ==========================================================================
  // MOTION BLUR CALCULATION
  // ==========================================================================
  /** Previous pan position for delta-based motion blur (preview mode) */
  const prevPanRef = useRef<{ panX: number; panY: number } | null>(null);
  const blurConfig = getMotionBlurConfig(cameraSettings);

  /**
   * Calculates camera motion blur based on pan/zoom velocity.
   * Preview mode uses simple delta from previous frame.
   * Export mode uses precomputed camera path for accuracy.
   */
  const motionBlur = useMemo(() => {
    return calculateCameraMotionBlur({
      blurConfig,
      renderData,
      currentFrame,
      fps,
      outputWidth: width,
      outputHeight: height,
      isRendering,
      isNearBoundaryStart,
      isNearBoundaryEnd,
      shouldHoldPrevFrame,
      precomputedPath: precomputedCamera?.path,
      calculatedZoomCenter,
      calculatedZoomBlock,
      prevPanRef: prevPanRef.current,
    });
  }, [
    blurConfig,
    renderData,
    currentFrame,
    fps,
    width,
    height,
    isRendering,
    isNearBoundaryStart,
    isNearBoundaryEnd,
    shouldHoldPrevFrame,
    precomputedCamera?.path,
    calculatedZoomCenter,
    calculatedZoomBlock,
  ]);

  // Update previous pan ref for next frame's delta calculation
  useEffect(() => {
    if (!isRendering && renderData?.zoomTransform) {
      prevPanRef.current = { panX: renderData.zoomTransform.panX, panY: renderData.zoomTransform.panY };
    }
  }, [isRendering, renderData?.zoomTransform]);

  // ==========================================================================
  // EARLY RETURN: No clips to render
  // ==========================================================================
  if (!renderData || sortedClips.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: '#000' }} />;
  }

  // ==========================================================================
  // DESTRUCTURE RENDER DATA
  // ==========================================================================
  const {
    clip, recording, sourceTimeMs, padding, cornerRadius, shadowIntensity, scaleFactor, activeSourceWidth, activeSourceHeight,
    drawWidth, drawHeight, offsetX, offsetY, outerTransform, cropTransformStr, extra3DTransform, zoomTransform, cropTransform,
    cropClipPath,
    mockupEnabled, mockupData, mockupPosition,
  } = renderData;

  const renderLayoutIndex = layoutIndexByClipId.get(clip.id);
  const renderLayoutItem = renderLayoutIndex === undefined ? activeLayoutItem : frameLayout[renderLayoutIndex];
  const isActiveGenerated = recording?.sourceType === 'generated';

  // Track last video state for generated clip transitions
  if (!isActiveGenerated && recording && renderLayoutItem) {
    lastVideoStateRef.current = {
      recording,
      clip,
      layoutItem: renderLayoutItem,
      sourceTimeMs,
    };
  }

  // Determine preview video state (use last video state when on generated clip)
  const previewVideoState = isActiveGenerated ? lastVideoStateRef.current : (recording && renderLayoutItem
    ? {
      recording,
      clip,
      layoutItem: renderLayoutItem,
      sourceTimeMs,
    }
    : null);
  const previewVideoVisible = !isActiveGenerated;

  // ==========================================================================
  // VIDEO COMPONENT SELECTION
  // ==========================================================================
  const VideoComponent = (isRendering && preferOffthreadVideo) ? OffthreadVideo : (isRendering ? SafeVideo : Video);

  const videoContent = isPreview ? (
    <>
      {/* Native video element for responsive preview */}
      <PreviewVideoRenderer
        recording={previewVideoState?.recording}
        clipForVideo={previewVideoState?.clip}
        startFrame={previewVideoState?.layoutItem.startFrame ?? 0}
        durationFrames={previewVideoState?.layoutItem.durationFrames ?? 1}
        sourceTimeMs={previewVideoState?.sourceTimeMs ?? 0}
        currentFrame={currentFrame}
        fps={fps}
        cornerRadius={cornerRadius}
        drawWidth={drawWidth}
        drawHeight={drawHeight}
        compositionWidth={width}
        compositionHeight={height}
        maxZoomScale={memoizedMaxZoomScale}
        currentZoomScale={renderData?.zoomTransform?.scale ?? 1}
        mockupEnabled={mockupEnabled}
        visible={previewVideoVisible}
        resources={resources}
        playback={playback}
        renderSettings={renderSettings}
      />
      {/* Generated clip overlay (blank clips, plugins) */}
      {isActiveGenerated && renderLayoutItem && recording ? (
        <GeneratedClipRenderer
          key={renderLayoutItem.groupId}
          clipForVideo={renderLayoutItem.clip}
          recording={recording}
          startFrame={renderLayoutItem.startFrame}
          durationFrames={renderLayoutItem.durationFrames}
          groupStartFrame={renderLayoutItem.groupStartFrame}
          groupDuration={renderLayoutItem.groupDuration}
          currentFrame={currentFrame}
          fps={fps}
          isRendering={isRendering}
          drawWidth={drawWidth}
          drawHeight={drawHeight}
          compositionWidth={width}
          compositionHeight={height}
          activeLayoutItem={activeLayoutItem}
          prevLayoutItem={prevLayoutItem}
          nextLayoutItem={nextLayoutItem}
          shouldHoldPrevFrame={shouldHoldPrevFrame}
          isNearBoundaryEnd={isNearBoundaryEnd}
          overlapFrames={overlapFrames}
          renderSettings={renderSettings}
        />
      ) : null}
    </>
  ) : (
    <>
      {/*
       * Z-ORDER: Render clips chronologically (prev → current → next)
       * so current clip is visible on top during transitions.
       * STABILITY: Use groupId as key to prevent remounting when
       * transitioning between contiguous clips of the same recording.
       */ }
      {renderableItems.map((item) => {
        const isPrev = item.clip.id === prevLayoutItem?.clip.id;
        const isNext = item.clip.id === nextLayoutItem?.clip.id;
        const isActive = item.clip.id === activeLayoutItem?.clip.id;

        // Determine if this group should be rendered
        const isGroupActive = activeLayoutItem && item.groupId === activeLayoutItem.groupId;
        const isGroupPrev = prevLayoutItem && item.groupId === prevLayoutItem.groupId;
        const isGroupNext = nextLayoutItem && item.groupId === nextLayoutItem.groupId;

        const shouldRender = isRendering
          ? ((isGroupActive) ||
            (isGroupPrev && shouldHoldPrevFrame) ||
            (isGroupNext && isNearBoundaryEnd))
          : true;

        if (!shouldRender) return null;

        const renderStartFrom = Math.round((item.groupStartSourceIn / 1000) * fps);

        const recording = recordingsMap.get(item.clip.recordingId);

        // Render generated clips with GeneratedClipRenderer
        if (recording?.sourceType === 'generated') {
          return (
            <GeneratedClipRenderer
              key={item.groupId}
              clipForVideo={item.clip}
              recording={recording}
              startFrame={item.startFrame}
              durationFrames={item.durationFrames}
              groupStartFrame={item.groupStartFrame}
              groupDuration={item.groupDuration}
              currentFrame={currentFrame}
              fps={fps}
              isRendering={isRendering}
              drawWidth={drawWidth}
              drawHeight={drawHeight}
              compositionWidth={width}
              compositionHeight={height}
              activeLayoutItem={activeLayoutItem}
              prevLayoutItem={prevLayoutItem}
              nextLayoutItem={nextLayoutItem}
              shouldHoldPrevFrame={isPrev ? shouldHoldPrevFrame : (isActive ? shouldHoldPrevFrame : false)}
              isNearBoundaryEnd={isNearBoundaryEnd}
              overlapFrames={overlapFrames}
              renderSettings={renderSettings}
            />
          );
        }

        // Render video clips with VideoClipRenderer
        const clipIndex = layoutIndexByClipId.get(item.clip.id);
        const shouldExtendSequence = keepVideoWarmOnScrub && clipIndex !== undefined;
        const premountFor = shouldExtendSequence ? scrubKeepAliveFrames : 0;
        const postmountFor = shouldExtendSequence ? scrubKeepAliveFrames : 0;

        return (
          <VideoClipRenderer
            key={item.groupId}
            clipForVideo={item.clip}
            recording={recording}
            startFrame={item.startFrame}
            durationFrames={item.durationFrames}
            groupStartFrame={item.groupStartFrame}
            renderStartFrom={renderStartFrom}
            groupDuration={item.groupDuration}
            currentFrame={currentFrame}
            fps={fps}
            isRendering={isRendering}
            cornerRadius={cornerRadius}
            drawWidth={drawWidth}
            drawHeight={drawHeight}
            compositionWidth={width}
            compositionHeight={height}
            maxZoomScale={memoizedMaxZoomScale}
            currentZoomScale={renderData?.zoomTransform?.scale ?? 1}
            mockupEnabled={mockupEnabled}
            activeLayoutItem={activeLayoutItem}
            prevLayoutItem={prevLayoutItem}
            nextLayoutItem={nextLayoutItem}
            shouldHoldPrevFrame={isPrev ? shouldHoldPrevFrame : (isActive ? shouldHoldPrevFrame : false)}
            isNearBoundaryEnd={isNearBoundaryEnd}
            overlapFrames={overlapFrames}
            markRenderReady={markRenderReady}
            handleVideoReady={handleVideoReady}
            VideoComponent={VideoComponent}
            premountFor={premountFor}
            postmountFor={postmountFor}
            resources={resources}
            playback={playback}
            renderSettings={renderSettings}
          />
        );
      })}
    </>
  );

  // ==========================================================================
  // TRANSFORM STRINGS
  // ==========================================================================
  const combinedTransform = `${outerTransform}${extra3DTransform}`.trim();
  const contentTransform = `translate3d(0,0,0) ${combinedTransform} ${cropTransformStr}`.trim();

  // ==========================================================================
  // DROP SHADOW
  // ==========================================================================
  const shadowOpacity = (shadowIntensity / 100) * 0.5;
  const baseShadowBlur = 25 + (shadowIntensity / 100) * 25;
  const shadowBlur = baseShadowBlur * scaleFactor;
  const dropShadow = shadowIntensity > 0
    ? `drop-shadow(0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0, 0, 0, ${shadowOpacity})) drop-shadow(0 ${shadowBlur * 0.6}px ${shadowBlur * 1.2}px rgba(0, 0, 0, ${shadowOpacity * 0.8}))`
    : '';


  // ==========================================================================
  // MOTION BLUR SVG FILTER
  // ==========================================================================
  const motionBlurFilterId = 'camera-motion-blur';
  const hasMotionBlur = blurConfig.enabled && motionBlur.blurRadius > 0.2 && !isEditingCrop;
  // PERFORMANCE FIX: Only generate SVG if blur is active to avoid re-rendering/DOM thrashing
  const motionBlurSvg = hasMotionBlur ? createMotionBlurSvg(motionBlur.blurRadius, motionBlurFilterId) : null;

  // ==========================================================================
  // VIDEO POSITION CONTEXT VALUE
  // ==========================================================================
  // When mockup is enabled, overlay positions need to account for mockup screen region
  const effectiveOffsetX = mockupEnabled && mockupPosition ? mockupPosition.videoX : offsetX;
  const effectiveOffsetY = mockupEnabled && mockupPosition ? mockupPosition.videoY : offsetY;
  const effectiveDrawWidth = mockupEnabled && mockupPosition ? mockupPosition.videoWidth : drawWidth;
  const effectiveDrawHeight = mockupEnabled && mockupPosition ? mockupPosition.videoHeight : drawHeight;

  // MEMOIZATION: Prevent context value from updating every frame unless transform actually changes.
  // This is critical for preventing CursorLayer / MockupLayer re-renders during static playback.
  const videoPositionValue = useMemo(() => ({
    offsetX: effectiveOffsetX,
    offsetY: effectiveOffsetY,
    drawWidth: effectiveDrawWidth,
    drawHeight: effectiveDrawHeight,
    zoomTransform,
    contentTransform,
    padding,
    videoWidth: activeSourceWidth,
    videoHeight: activeSourceHeight,
    cameraMotionBlur: { enabled: hasMotionBlur, angle: motionBlur.angle, filterId: motionBlurFilterId },
    mockupEnabled,
    mockupPosition,
  }), [
    effectiveOffsetX, effectiveOffsetY, effectiveDrawWidth, effectiveDrawHeight,
    // Decompose zoomTransform to primitives to ignore reference changes
    zoomTransform?.scale, zoomTransform?.panX, zoomTransform?.panY, zoomTransform?.refocusBlur,
    contentTransform, padding, activeSourceWidth, activeSourceHeight,
    hasMotionBlur, motionBlur.angle, motionBlurFilterId,
    mockupEnabled,
    // Decompose mockupPosition to primitives
    mockupPosition?.videoX, mockupPosition?.videoY, mockupPosition?.videoWidth, mockupPosition?.videoHeight
  ]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <VideoPositionProvider value={videoPositionValue}>
      {/* SVG filter definition for motion blur */}
      {motionBlurSvg}

      <AbsoluteFill style={{
        zIndex: 10,
        filter: hasMotionBlur ? `url(#${motionBlurFilterId})` : undefined,
        transform: hasMotionBlur ? `rotate(${motionBlur.angle}deg)` : undefined,
        transformOrigin: '50% 50%',
      }}>
        {/* Counter-rotate wrapper to apply blur at correct angle */}
        <div style={{
          transform: hasMotionBlur ? `rotate(${-motionBlur.angle}deg)` : undefined,
          transformOrigin: '50% 50%', width: '100%', height: '100%',
        }}>
          {/* ========== MOCKUP MODE RENDERING ========== */}
          {mockupEnabled && mockupPosition && mockupData ? (
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              // CRITICAL PERFORMANCE FIX: Always enforce overflow hidden.
              // Previous logic enabled 'visible' during zoom, causing WindowServer to 
              // allocate massive textures (e.g. 8000x8000) for zoomed content.
              overflow: 'hidden',
              transform: `translate3d(0,0,0) ${combinedTransform}`,
              transformOrigin: '50% 50%',
              willChange: 'transform',
              backfaceVisibility: 'hidden' as const,
            }}>
              <MockupLayer
                mockupData={mockupData}
                mockupPosition={mockupPosition}
                screenFillColor={mockupData.screenFillColor}
              >
                {/* Video content inside mockup screen */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  overflow: 'hidden',
                  borderRadius: `${mockupPosition.screenCornerRadius}px`,
                  // PERFORMANCE: Only apply refocus blur when paused AND strictly not interacting. 
                  // Disabling during scrubbing/playback is mandatory for performance.
                  filter: (cameraSettings?.refocusBlurEnabled !== false && (zoomTransform?.refocusBlur ?? 0) > 0.01 && !isPlaying && !isScrubbing && (isRendering || isHighQualityPlaybackEnabled))
                    ? `blur(${(zoomTransform?.refocusBlur ?? 0) * ((cameraSettings?.refocusBlurIntensity ?? 40) / 100) * 12}px)`
                    : undefined,
                }}>
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    transform: cropTransformStr || undefined,
                    transformOrigin: '50% 50%',
                    clipPath: cropClipPath || undefined,
                  }}>
                    {isPreview ? (
                      <>
                        <PreviewVideoRenderer
                          recording={previewVideoState?.recording}
                          clipForVideo={previewVideoState?.clip}
                          startFrame={previewVideoState?.layoutItem.startFrame ?? 0}
                          durationFrames={previewVideoState?.layoutItem.durationFrames ?? 1}
                          sourceTimeMs={previewVideoState?.sourceTimeMs ?? 0}
                          currentFrame={currentFrame}
                          fps={fps}
                          cornerRadius={0}
                          drawWidth={mockupPosition.videoWidth}
                          drawHeight={mockupPosition.videoHeight}
                          compositionWidth={width}
                          compositionHeight={height}
                          maxZoomScale={memoizedMaxZoomScale}
                          currentZoomScale={renderData?.zoomTransform?.scale ?? 1}
                          mockupEnabled={mockupEnabled}
                          visible={previewVideoVisible}
                          resources={resources}
                          playback={playback}
                          renderSettings={renderSettings}
                        />
                        {isActiveGenerated && renderLayoutItem && recording ? (
                          <GeneratedClipRenderer
                            key={renderLayoutItem.groupId}
                            clipForVideo={renderLayoutItem.clip}
                            recording={recording}
                            startFrame={renderLayoutItem.startFrame}
                            durationFrames={renderLayoutItem.durationFrames}
                            groupStartFrame={renderLayoutItem.groupStartFrame}
                            groupDuration={renderLayoutItem.groupDuration}
                            currentFrame={currentFrame}
                            fps={fps}
                            isRendering={isRendering}
                            drawWidth={mockupPosition.videoWidth}
                            drawHeight={mockupPosition.videoHeight}
                            compositionWidth={width}
                            compositionHeight={height}
                            activeLayoutItem={activeLayoutItem}
                            prevLayoutItem={prevLayoutItem}
                            nextLayoutItem={nextLayoutItem}
                            shouldHoldPrevFrame={shouldHoldPrevFrame}
                            isNearBoundaryEnd={isNearBoundaryEnd}
                            overlapFrames={overlapFrames}
                            renderSettings={renderSettings}
                          />
                        ) : null}
                      </>
                    ) : (
                      renderableItems.map((item) => {
                        const rec = recordingsMap.get(item.clip.recordingId);
                        if (rec?.sourceType === 'generated') {
                          return (
                            <GeneratedClipRenderer
                              key={item.groupId}
                              clipForVideo={item.clip}
                              recording={rec}
                              startFrame={item.startFrame}
                              durationFrames={item.durationFrames}
                              groupStartFrame={item.groupStartFrame}
                              groupDuration={item.groupDuration}
                              currentFrame={currentFrame}
                              fps={fps}
                              isRendering={isRendering}
                              drawWidth={mockupPosition.videoWidth}
                              drawHeight={mockupPosition.videoHeight}
                              compositionWidth={width}
                              compositionHeight={height}
                              activeLayoutItem={activeLayoutItem}
                              prevLayoutItem={prevLayoutItem}
                              nextLayoutItem={nextLayoutItem}
                              shouldHoldPrevFrame={shouldHoldPrevFrame}
                              isNearBoundaryEnd={isNearBoundaryEnd}
                              overlapFrames={overlapFrames}
                              renderSettings={renderSettings}
                            />
                          );
                        }
                        const renderStartFrom = Math.round((item.groupStartSourceIn / 1000) * fps);
                        return (
                          <VideoClipRenderer
                            key={item.groupId}
                            clipForVideo={item.clip}
                            recording={rec}
                            startFrame={item.startFrame}
                            durationFrames={item.durationFrames}
                            groupStartFrame={item.groupStartFrame}
                            renderStartFrom={renderStartFrom}
                            groupDuration={item.groupDuration}
                            currentFrame={currentFrame}
                            fps={fps}
                            isRendering={isRendering}
                            cornerRadius={0}
                            drawWidth={mockupPosition.videoWidth}
                            drawHeight={mockupPosition.videoHeight}
                            compositionWidth={width}
                            compositionHeight={height}
                            maxZoomScale={memoizedMaxZoomScale}
                            currentZoomScale={renderData?.zoomTransform?.scale ?? 1}
                            mockupEnabled={mockupEnabled}
                            activeLayoutItem={activeLayoutItem}
                            prevLayoutItem={prevLayoutItem}
                            nextLayoutItem={nextLayoutItem}
                            shouldHoldPrevFrame={shouldHoldPrevFrame}
                            isNearBoundaryEnd={isNearBoundaryEnd}
                            overlapFrames={overlapFrames}
                            markRenderReady={markRenderReady}
                            handleVideoReady={handleVideoReady}
                            VideoComponent={VideoComponent}
                            premountFor={0}
                            postmountFor={0}
                            resources={resources}
                            playback={playback}
                            renderSettings={renderSettings}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              </MockupLayer>
            </div>
          ) : (
            /* ========== NORMAL MODE RENDERING (no mockup) ========== */
            <div style={{
              position: 'absolute', left: offsetX, top: offsetY, width: drawWidth, height: drawHeight,
              // CRITICAL PERFORMANCE FIX: Always enforce overflow hidden.
              // Prevents massive texture allocation during zoom (was 'visible' when scale > 1).
              overflow: 'hidden',
              transform: `translate3d(0,0,0) ${combinedTransform}`,
              transformOrigin: '50% 50%',
              // PERFORMANCE: Only apply drop shadow when paused AND strictly not interacting.
              // During playback/scrubbing, the cost of recomposing large layers is too high unless user opts in.
              filter: (!isPlaying && !isScrubbing && (isRendering || isHighQualityPlaybackEnabled)) ? (dropShadow || undefined) : undefined,
              willChange: 'transform, filter', backfaceVisibility: 'hidden' as const,
            }}>
              {/* Clipping container with corner radius and refocus blur */}
              <div style={{
                position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: `${cornerRadius}px`,
                // PERFORMANCE: Only apply refocus blur when paused AND strictly not interacting.
                filter: (cameraSettings?.refocusBlurEnabled !== false && (zoomTransform?.refocusBlur ?? 0) > 0.01 && !isPlaying && !isScrubbing && (isRendering || isHighQualityPlaybackEnabled))
                  ? `blur(${(zoomTransform?.refocusBlur ?? 0) * ((cameraSettings?.refocusBlurIntensity ?? 40) / 100) * 12}px)`
                  : undefined,
                transition: undefined, // No transition - must be frame-deterministic
              }}>
                {/* Crop transform container */}
                <div
                  key={renderData?.cropEffectId || 'no-crop'}
                  style={{
                    position: 'absolute', inset: 0, transform: cropTransformStr || undefined,
                    transformOrigin: '50% 50%', willChange: cropTransformStr ? 'transform' : undefined,
                    backfaceVisibility: 'hidden' as const,
                    clipPath: cropClipPath || undefined,
                  }}>
                  {videoContent}
                </div>
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* Children layer (overlays, effects UI) */}
      <AbsoluteFill style={{ zIndex: 20 }}>{children}</AbsoluteFill>

      {/* Preview Guides - Rendered on top of everything */}
      {!isRendering && isActiveGenerated === false && (
        <PreviewGuides
          rect={{
            x: effectiveOffsetX,
            y: effectiveOffsetY,
            width: effectiveDrawWidth,
            height: effectiveDrawHeight,
          }}
        />
      )}
    </VideoPositionProvider>
  );
};
