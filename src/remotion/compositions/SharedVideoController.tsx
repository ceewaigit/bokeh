/**
 * SharedVideoController.tsx
 *
 * Central video orchestration component for the Remotion composition.
 * Manages video clip rendering, transforms, and visual effects for both
 * preview playback and export rendering modes.
 *
 * Uses extracted hooks for clean separation of concerns:
 * - useEffectiveClipData: Resolves clip with inheritance logic
 * - useLayoutCalculation: Computes dimensions and positions
 * - useTransformCalculation: Computes zoom, crop, 3D transforms
 * - useRenderableItems: Determines which clips to render
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Video, OffthreadVideo, AbsoluteFill, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion';
import {
  useVideoData,
  useActiveClipData,
  useLayoutNavigation
} from '../context/video-data-context';
import { useComposition } from '../context/CompositionContext';
import { useProjectStore } from '@/stores/project-store';
import { VideoPositionProvider } from '../context/layout/VideoPositionContext';
import type { SharedVideoControllerProps } from '@/types';
import { type FrameLayoutItem, findActiveFrameLayoutItems, getBoundaryOverlapState } from '@/features/timeline/utils/frame-layout';
import { useCameraPath } from '@/remotion/hooks/camera/useCameraPath';
import { getMaxZoomScale } from '@/remotion/hooks/media/useVideoUrl';
import { useRenderDelay } from '@/remotion/hooks/render/useRenderDelay';
import { useRenderableItems } from '@/remotion/hooks/render/useRenderableItems';
import { useEffectiveClipData } from '@/remotion/hooks/clip/useEffectiveClipData';
import { useLayoutCalculation } from '@/remotion/hooks/layout/useLayoutCalculation';
import { useTransformCalculation } from '../hooks/transforms/useTransformCalculation';
import { frameToMs } from './utils/time/frame-time';

import { VideoClipRenderer } from './renderers/VideoClipRenderer';
import { GeneratedClipRenderer } from './renderers/GeneratedClipRenderer';
import { ImageClipRenderer } from './renderers/ImageClipRenderer';
import { MockupLayer } from './layers/MockupLayer';
import { MotionBlurLayer } from './layers/MotionBlurLayer';
import { MotionBlurDebugLayer } from './layers/MotionBlurDebugLayer';
import { PreviewGuides } from '@/components/preview-guides';
import { getMotionBlurConfig } from './utils/transforms/zoom-transform';

// ============================================================================
// COMPONENT
// ============================================================================

export const SharedVideoController: React.FC<SharedVideoControllerProps> = ({
  videoWidth,
  videoHeight,
  sourceVideoWidth,
  sourceVideoHeight,
  children,
  cameraSettings,
  renderSettings,
}) => {
  // ==========================================================================
  // REMOTION HOOKS & CONTEXT
  // ==========================================================================
  const currentFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { fps } = useComposition();
  const { isRendering } = getRemotionEnvironment();
  const isPreview = !isRendering;

  // Consume computed video data from context
  const { frameLayout, getRecording, recordingsMap, effects, getActiveClipData } = useVideoData();

  const { isEditingCrop, preferOffthreadVideo } = renderSettings;
  const useOffthreadVideo = isRendering && preferOffthreadVideo;

  const currentTimeMs = frameToMs(currentFrame, fps);
  const cameraPathCache = useProjectStore((s) => s.cameraPathCache);
  const isScrubbing = useProjectStore((s) => s.isScrubbing);

  // ==========================================================================
  // ACTIVE CLIP DATA (from Context)
  // ==========================================================================
  const activeClipData = useActiveClipData(currentFrame);

  // Previous frame's clip data (for cursor smoothing)
  const prevFrameClipData = useMemo(
    () => currentFrame > 0 ? getActiveClipData(currentFrame - 1) : null,
    [currentFrame, getActiveClipData]
  );

  // Layout navigation
  const layoutNav = useLayoutNavigation(currentFrame);
  const { activeItem: activeLayoutItem, prevItem: prevLayoutItem, nextItem: nextLayoutItem } = layoutNav;

  const visualLayoutNav = useMemo(() => {
    const isVisualItem = (item: FrameLayoutItem | null) => {
      if (!item) return false;
      const recording = recordingsMap.get(item.clip.recordingId);
      return recording?.sourceType === 'video' || recording?.sourceType === 'image';
    };

    const activeItems = findActiveFrameLayoutItems(frameLayout, currentFrame);
    let activeVisualItem: FrameLayoutItem | null = null;
    for (const item of activeItems) {
      if (isVisualItem(item) && (!activeVisualItem || item.startFrame > activeVisualItem.startFrame)) {
        activeVisualItem = item;
      }
    }

    const activeVisualIndex = activeVisualItem
      ? frameLayout.findIndex((item) => item.clip.id === activeVisualItem?.clip.id)
      : -1;

    let prevVisualItem: FrameLayoutItem | null = null;
    for (let i = activeVisualIndex - 1; i >= 0; i -= 1) {
      const candidate = frameLayout[i];
      if (isVisualItem(candidate)) {
        prevVisualItem = candidate;
        break;
      }
    }

    let nextVisualItem: FrameLayoutItem | null = null;
    for (let i = activeVisualIndex + 1; i < frameLayout.length; i += 1) {
      const candidate = frameLayout[i];
      if (isVisualItem(candidate)) {
        nextVisualItem = candidate;
        break;
      }
    }

    return {
      activeVisualItem,
      prevVisualItem,
      nextVisualItem,
    };
  }, [frameLayout, recordingsMap, currentFrame]);

  const renderActiveLayoutItem = visualLayoutNav.activeVisualItem ?? activeLayoutItem;
  const renderPrevLayoutItem = visualLayoutNav.prevVisualItem ?? prevLayoutItem;
  const renderNextLayoutItem = visualLayoutNav.nextVisualItem ?? nextLayoutItem;

  // ==========================================================================
  // BOUNDARY STATE
  // ==========================================================================
  const boundaryState = useMemo(() => {
    return getBoundaryOverlapState({
      currentFrame,
      fps,
      isRendering,
      activeLayoutItem: renderActiveLayoutItem,
      prevLayoutItem: renderPrevLayoutItem,
      nextLayoutItem: renderNextLayoutItem,
      sourceWidth: sourceVideoWidth, sourceHeight: sourceVideoHeight,
    });
  }, [
    currentFrame,
    fps,
    isRendering,
    renderActiveLayoutItem,
    renderPrevLayoutItem,
    renderNextLayoutItem,
    sourceVideoWidth,
    sourceVideoHeight,
  ]);

  const { isNearBoundaryStart, isNearBoundaryEnd, shouldHoldPrevFrame, overlapFrames } = boundaryState;

  // ==========================================================================
  // CLIP DATA RESOLUTION
  // ==========================================================================

  // Pre-compute camera path
  const cameraPathFrame = useCameraPath({
    enabled: true,
    isRendering,
    currentFrame,
    frameLayout,
    fps,
    videoWidth,
    videoHeight,
    sourceVideoWidth,
    sourceVideoHeight,
    effects,
    getRecording: (id) => getRecording(id) ?? null,
    cachedPath: cameraPathCache
  });

  // Resolve effective clip data (handling inheritance, "Return Cursor" logic)
  const effectiveResult = useEffectiveClipData({
    activeClipData,
    currentFrame,
    frameLayout,
    fps,
    effects,
    getRecording: (id) => getRecording(id) ?? null,
    isRendering,
    isNearBoundaryStart,
    isNearBoundaryEnd,
    activeLayoutItem,
    prevLayoutItem,
    nextLayoutItem,
  });
  const { effectiveClipData: resolvedClipData } = effectiveResult;

  // ==========================================================================
  // RENDER DELAY
  // ==========================================================================
  const { markRenderReady, handleVideoReady } = useRenderDelay(isRendering);

  // ==========================================================================
  // LAYOUT CALCULATION
  // ==========================================================================
  const layout = useLayoutCalculation({
    compositionWidth: width,
    compositionHeight: height,
    videoWidth,
    videoHeight,
    sourceVideoWidth,
    sourceVideoHeight,
    recordingWidth: resolvedClipData?.recording.width,
    recordingHeight: resolvedClipData?.recording.height,
    clipEffects: resolvedClipData?.effects ?? effects,
    currentTimeMs,
    isEditingCrop
  });

  // ==========================================================================
  // TRANSFORM CALCULATION
  // ==========================================================================
  const transforms = useTransformCalculation({
    ...layout, // Spread layout properties
    currentTimeMs,
    sourceTimeMs: resolvedClipData?.sourceTimeMs ?? 0,
    clipEffects: resolvedClipData?.effects ?? effects,
    calculatedZoomBlock: cameraPathFrame?.activeZoomBlock,
    calculatedZoomCenter: cameraPathFrame?.zoomCenter ?? { x: 0.5, y: 0.5 },
    // NOTE: calculatedZoomScale removed - zoom scale now computed by calculateZoomTransform directly
    compositionWidth: width,
    compositionHeight: height,
    isEditingCrop
  });

  const { zoomTransform, outerTransform, cropClipPath } = transforms;

  // ==========================================================================
  // CAMERA MOTION BLUR (WebGL-based directional blur)
  // ==========================================================================

  // Video container ref for motion blur to discover video element from DOM
  // This makes motion blur clip-agnostic - it always finds the active video
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Get motion blur config from camera settings
  const motionBlurConfig = useMemo(
    () => getMotionBlurConfig(cameraSettings),
    [cameraSettings]
  );
  const motionBlurIntensity = cameraSettings?.motionBlurIntensity ?? 0;
  const motionBlurEnabled = motionBlurConfig.enabled && motionBlurIntensity > 0;
  const setPreviewReady = useProjectStore((s) => s.setPreviewReady);

  // Convert precomputed velocity to pixels for WebGL directional blur (DETERMINISTIC)
  // Uses camera-path-calculator.ts precomputed velocity for consistency
  const MOTION_BLUR_MIN_WIDTH = 200;  // Only apply to main video, not webcam
  const isMainVideo = layout.drawWidth >= MOTION_BLUR_MIN_WIDTH;
  const isMotionBlurActive = motionBlurEnabled && isMainVideo;

  // Calculate camera velocity in pixels using existing utility logic
  // DETERMINISTIC MOTION BLUR SMOOTHING
  // We calculate smoothed velocity by looking back at the cached path.
  // This ensures that Frame X always has the same blur, regardless of render order/threading.
  const cameraVelocity = useMemo(() => {
    if (!isMotionBlurActive) return { x: 0, y: 0 };
    if (!cameraPathCache) return { x: 0, y: 0 };

    // Increased to 12 frames for smoother velocity ramp (prevents 1-frame pop)
    const smoothWindow = Math.max(1, cameraSettings?.motionBlurSmoothWindow ?? 12);
    let sumVx = 0;
    let sumVy = 0;
    let totalWeight = 0;

    // OFFSET TRAILING WINDOW: Motion blur uses velocity from PREVIOUS frames.
    // The velocity at frame N represents motion that happened from N-1 to N.
    // But the visual render at frame N shows the RESULT of that motion.
    // So blur at frame N should use velocity from frames N-1 and earlier,
    // not including frame N's velocity which represents "motion just completed".
    // This prevents the "blur one frame before movement" artifact.
    // Window: [currentFrame - smoothWindow, currentFrame - 1] (offset by -1)
    for (let offset = -smoothWindow; offset <= -1; offset++) {
      const targetFrame = currentFrame + offset;
      if (targetFrame < 0 || targetFrame >= cameraPathCache.length) continue;
      const frameData = cameraPathCache[targetFrame];
      if (!frameData?.velocity) continue;

      // Gaussian-like weighting: smoother falloff for more natural blur ramp
      // Maps offset [-smoothWindow, -1] to normalized [0, 1]
      const normalized = (offset + smoothWindow) / (smoothWindow - 1);
      // Gaussian curve centered at 1 (most recent frame)
      const weight = Math.exp(-2 * Math.pow(1 - normalized, 2));
      sumVx += frameData.velocity.x * weight;
      sumVy += frameData.velocity.y * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return { x: 0, y: 0 };

    // Average and Scale to Pixels
    const avgVx = sumVx / totalWeight;
    const avgVy = sumVy / totalWeight;
    const scale = zoomTransform?.scale ?? 1;

    // SOFT THRESHOLD FOR MID-FLIGHT BLUR:
    // The problem: Physics calculates velocity before visual pan occurs.
    // During zoom-in intro, visual pan is scaled by (scale-1)/(targetScale-1).
    // So at the START of zoom (scale ≈ 1), visual pan ≈ 0, but velocity is non-zero.
    // 
    // Solution: Suppress blur during early intro phase (first ~25% of zoom-in).
    // Once zoom is established, full blur applies.
    // During hold phase (scale = targetScale), blur is at full strength.
    // During outro, blur naturally fades as velocity decreases.
    const activeZoomBlock = cameraPathCache[currentFrame]?.activeZoomBlock;
    const targetScale = activeZoomBlock?.scale ?? scale;

    // scaleProgress: 0 = start of zoom, 1 = fully zoomed in
    // Default to 1 (full blur) when no zoom is active for cursor-following motion
    const scaleProgress = targetScale > 1 ? Math.max(0, Math.min(1, (scale - 1) / (targetScale - 1))) : 1;

    // Soft ramp: 0 at start, ramps to 1 by 25% progress, stays at 1 thereafter
    // Using smoothstep for gradual transition
    const INTRO_THRESHOLD = 0.25;
    const t = Math.min(1, scaleProgress / INTRO_THRESHOLD);
    const introRamp = t * t * (3 - 2 * t); // smoothstep formula

    const rawX = avgVx * layout.drawWidth * scale * introRamp;
    const rawY = avgVy * layout.drawHeight * scale * introRamp;

    // Sanitize to prevent NaN
    return {
      x: Number.isFinite(rawX) ? rawX : 0,
      y: Number.isFinite(rawY) ? rawY : 0,
    };
  }, [
    isMotionBlurActive,
    cameraPathCache, // SSOT for path
    currentFrame,
    cameraSettings?.motionBlurSmoothWindow,
    zoomTransform?.scale,
    layout.drawWidth,
    layout.drawHeight
  ]);

  // ============================================================================
  // REFOCUS BLUR (Zoom transitions only - motion blur handled by WebGL)
  // ============================================================================
  const refocusEnabled = cameraSettings?.refocusBlurEnabled !== false;
  const refocusIntensity = refocusEnabled
    ? Math.max(0, Math.min(1, (cameraSettings?.refocusBlurIntensity ?? 50) / 100))
    : 0;

  // Refocus blur during zoom transitions (intro/outro phases)
  const refocusBlurRaw = (zoomTransform?.refocusBlur ?? 0) * 12 * refocusIntensity;
  const effectiveBlurPx = refocusBlurRaw < 0.5 ? 0 : Math.round(refocusBlurRaw);

  useEffect(() => {
    // Preview ready when no motion blur (which handles its own readiness)
    if (!isRendering && !motionBlurEnabled) {
      setPreviewReady(true);
    }
  }, [isRendering, motionBlurEnabled, setPreviewReady]);

  // ==========================================================================
  // RENDERABLE ITEMS
  // ==========================================================================
  const renderableItems = useRenderableItems({
    frameLayout,
    currentFrame,
    fps,
    isRendering,
    recordingsMap,
    prevLayoutItem: renderPrevLayoutItem,
    nextLayoutItem: renderNextLayoutItem,
    shouldHoldPrevFrame,
    isNearBoundaryEnd,
  });

  useEffect(() => {
    if (!isRendering && renderableItems.length === 0) {
      setPreviewReady(true);
    }
  }, [isRendering, renderableItems.length, setPreviewReady]);

  // ==========================================================================
  // RENDER CONTENT
  // ==========================================================================

  const renderedContent = useMemo(() => {
    // Keep preloadFrames stable to prevent flash on play/pause transitions
    // The Sequence will handle visibility internally without needing dynamic premount
    const preloadFrames = !isRendering ? 30 : 0;
    return renderableItems.map((item) => {
      const recording = recordingsMap.get(item.clip.recordingId);
      if (!recording) return null;

      if (recording.sourceType === 'video') {
        return (
          <VideoClipRenderer
            key={item.groupId}
            clipForVideo={item.clip}
            recording={recording}
            startFrame={item.startFrame}
            durationFrames={item.durationFrames}
            groupStartFrame={item.groupStartFrame}
            groupStartSourceIn={item.groupStartSourceIn}
            groupDuration={item.groupDuration}
            markRenderReady={markRenderReady}
            handleVideoReady={handleVideoReady}
            VideoComponent={useOffthreadVideo ? OffthreadVideo : Video}
            premountFor={preloadFrames}
            postmountFor={preloadFrames}
            isScrubbing={isScrubbing}
          />
        );
      } else if (recording.sourceType === 'image') {
        return (
          <ImageClipRenderer
            key={item.clip.id}
            clipForVideo={item.clip}
            recording={recording}
            startFrame={item.startFrame}
            durationFrames={item.durationFrames}
            groupStartFrame={item.startFrame}
            groupDuration={item.durationFrames}
            currentFrame={currentFrame}
            fps={fps}
            isRendering={isRendering}
            cornerRadius={layout.cornerRadius}
            drawWidth={layout.drawWidth}
            drawHeight={layout.drawHeight}
            compositionWidth={width}
            compositionHeight={height}
            activeLayoutItem={renderActiveLayoutItem}
            prevLayoutItem={renderPrevLayoutItem}
            nextLayoutItem={renderNextLayoutItem}
            shouldHoldPrevFrame={shouldHoldPrevFrame}
            isNearBoundaryEnd={isNearBoundaryEnd}
            overlapFrames={overlapFrames}
          />
        );
      } else if (recording.sourceType === 'generated') {
        return (
          <GeneratedClipRenderer
            key={item.clip.id}
            clipForVideo={item.clip}
            recording={recording}
            startFrame={item.startFrame}
            durationFrames={item.durationFrames}
            groupStartFrame={item.startFrame}
            groupDuration={item.durationFrames}
            currentFrame={currentFrame}
            fps={fps}
            isRendering={isRendering}
            drawWidth={layout.drawWidth}
            drawHeight={layout.drawHeight}
            compositionWidth={width}
            compositionHeight={height}
            activeLayoutItem={activeLayoutItem}
            prevLayoutItem={prevLayoutItem}
            nextLayoutItem={nextLayoutItem}
            shouldHoldPrevFrame={shouldHoldPrevFrame}
            isNearBoundaryEnd={isNearBoundaryEnd}
            overlapFrames={overlapFrames}
          />
        );
      }
      return null;
    });
  }, [
    renderableItems, recordingsMap, width, height,
    currentFrame, fps, isRendering, layout,
    activeLayoutItem, prevLayoutItem, nextLayoutItem,
    renderActiveLayoutItem, renderPrevLayoutItem, renderNextLayoutItem,
    shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
    markRenderReady, handleVideoReady, useOffthreadVideo,
    isScrubbing
  ]);

  // ==========================================================================
  // RETURN
  // ==========================================================================

  // Prepare context value
  const videoPositionContextValue = {
    ...layout,
    zoomTransform: zoomTransform ?? null,
    contentTransform: outerTransform,
    refocusBlurPx: effectiveBlurPx,
    cameraMotionBlur: { enabled: false, angle: 0, filterId: '' },
    activeClipData,
    effectiveClipData: resolvedClipData,
    prevFrameClipData,
    frameLayout,
    activeLayoutItem,
    prevLayoutItem,
    nextLayoutItem,
    videoWidth,
    videoHeight,
    maxZoomScale: getMaxZoomScale(effects),
    boundaryState
  };

  // If no active content, render children (overlays) or empty container
  if (!resolvedClipData && !shouldHoldPrevFrame) {
    return (
      <AbsoluteFill>
        <div style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />
        <VideoPositionProvider value={videoPositionContextValue}>
          {children}
        </VideoPositionProvider>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <VideoPositionProvider value={videoPositionContextValue}>
        {/* Main Transform Container */}
        <AbsoluteFill>
          <div
            style={{
              position: 'absolute',
              left: layout.mockupEnabled ? 0 : layout.offsetX,
              top: layout.mockupEnabled ? 0 : layout.offsetY,
              width: layout.mockupEnabled ? '100%' : layout.drawWidth,
              height: layout.mockupEnabled ? '100%' : layout.drawHeight,
              transform: outerTransform,
              transformOrigin: 'center center',
              filter: effectiveBlurPx > 0 ? `blur(${effectiveBlurPx}px)` : undefined,
              clipPath: layout.mockupEnabled ? undefined : cropClipPath,
              borderRadius: layout.mockupEnabled ? undefined : layout.cornerRadius,
              overflow: cropClipPath ? 'hidden' : undefined,
              willChange: isRendering ? undefined : 'transform, filter',
            }}
          >
            {/* Video content container - also used by MotionBlurLayer to find active video */}
            <div ref={videoContainerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
              {layout.mockupEnabled && layout.mockupData && layout.mockupPosition ? (
                <MockupLayer
                  mockupData={layout.mockupData}
                  mockupPosition={layout.mockupPosition}
                >
                  {renderedContent}
                </MockupLayer>
              ) : (
                renderedContent
              )}
            </div>

            {/* WebGL Motion Blur - Conditionally mounted to SAVE RAM on idle.
                Only mount when moving > 0.1px/frame. 
                This prevents allocating 4K canvases when stationary. */}
            {(motionBlurEnabled && isMainVideo) && (() => {
              const speed = Math.hypot(cameraVelocity.x, cameraVelocity.y);
              const shouldMount = speed > 0.1;
              return shouldMount ? (
                <MotionBlurLayer
                  enabled={true}
                  velocity={cameraVelocity}
                  containerRef={videoContainerRef}
                  drawWidth={layout.drawWidth}
                  drawHeight={layout.drawHeight}
                  offsetX={0}
                  offsetY={0}
                />
              ) : null;
            })()}

            {/* Debug Overlay - Independent visual guide if needed */}
            {false && (
              <MotionBlurDebugLayer
                enabled={true}
                drawWidth={layout.drawWidth}
                drawHeight={layout.drawHeight}
              />
            )}
          </div>

          {/* Preview Guides */}
          {isPreview && (
            <PreviewGuides
              rect={{
                x: layout.offsetX,
                y: layout.offsetY,
                width: layout.drawWidth,
                height: layout.drawHeight
              }}
            />
          )}
        </AbsoluteFill>

        {/* Overlays */}
        {children}
      </VideoPositionProvider>
    </AbsoluteFill>
  );
};
