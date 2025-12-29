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
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';
import {
  findActiveFrameLayoutItems,
  getBoundaryOverlapState,
} from '@/lib/timeline/frame-layout';
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

    // Default to 6 frames if not set (matches "Balanced" preset)
    const smoothWindow = Math.max(1, cameraSettings?.motionBlurSmoothWindow ?? 6);
    const halfWindow = Math.floor(smoothWindow / 2);
    let sumVx = 0;
    let sumVy = 0;
    let totalWeight = 0;

    // Use a symmetric, shutter-like window to avoid trailing bias.
    for (let offset = -halfWindow; offset <= halfWindow; offset++) {
      const targetFrame = currentFrame + offset;
      if (targetFrame < 0 || targetFrame >= cameraPathCache.length) continue;
      const frameData = cameraPathCache[targetFrame];
      if (!frameData?.velocity) continue;

      // Triangular weighting emphasizes the center for a more cinematic exposure.
      const weight = 1 + (halfWindow - Math.abs(offset));
      sumVx += frameData.velocity.x * weight;
      sumVy += frameData.velocity.y * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return { x: 0, y: 0 };

    // Average and Scale to Pixels
    const avgVx = sumVx / totalWeight;
    const avgVy = sumVy / totalWeight;
    const scale = zoomTransform?.scale ?? 1;

    const rawX = avgVx * layout.drawWidth * scale;
    const rawY = avgVy * layout.drawHeight * scale;

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
    // Compute zoom scales once for all clips
    const maxZoom = getMaxZoomScale(effects);
    const currentScale = zoomTransform?.scale ?? 1;

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
            cornerRadius={layout.cornerRadius}
            drawWidth={layout.drawWidth}
            drawHeight={layout.drawHeight}
            maxZoomScale={maxZoom}
            currentZoomScale={currentScale}
            activeLayoutItem={renderActiveLayoutItem}
            prevLayoutItem={renderPrevLayoutItem}
            nextLayoutItem={renderNextLayoutItem}
            shouldHoldPrevFrame={shouldHoldPrevFrame}
            isNearBoundaryEnd={isNearBoundaryEnd}
            overlapFrames={overlapFrames}
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
    renderableItems, recordingsMap, width, height, zoomTransform, effects,
    currentFrame, fps, isRendering, layout,
    activeLayoutItem, prevLayoutItem, nextLayoutItem,
    renderActiveLayoutItem, renderPrevLayoutItem, renderNextLayoutItem,
    shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
    markRenderReady, handleVideoReady, useOffthreadVideo, isMotionBlurActive
  ]);

  // ==========================================================================
  // RETURN
  // ==========================================================================
  // If no active content, render children (overlays) or empty container
  if (!resolvedClipData && !shouldHoldPrevFrame) {
    return (
      <AbsoluteFill>
        <div style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />
        <VideoPositionProvider value={{
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
          videoHeight
        }}>
          {children}
        </VideoPositionProvider>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
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

          {/* WebGL Motion Blur - overlays on video when blur is active */}
          <MotionBlurLayer
            enabled={motionBlurEnabled && isMainVideo}
            blurIntensity={Number.isFinite(motionBlurIntensity) ? motionBlurIntensity / 100 : 0}
            velocity={cameraVelocity}
            maxBlurRadius={Number.isFinite(motionBlurConfig.maxBlurRadius) ? motionBlurConfig.maxBlurRadius : 20}
            velocityThreshold={Number.isFinite(motionBlurConfig.velocityThreshold) ? motionBlurConfig.velocityThreshold : 1}
            gamma={Number.isFinite(cameraSettings?.motionBlurGamma) ? (cameraSettings?.motionBlurGamma ?? 1.0) : 1.0}
            rampRange={Number.isFinite(cameraSettings?.motionBlurRampRange) ? (cameraSettings?.motionBlurRampRange ?? 0.5) : 0.5}
            clamp={Number.isFinite(cameraSettings?.motionBlurClamp) ? (cameraSettings?.motionBlurClamp ?? 60) : 60}
            containerRef={videoContainerRef}
            drawWidth={layout.drawWidth}
            drawHeight={layout.drawHeight}
            offsetX={0}
            offsetY={0}
            // Enable Debug Split to verify exact color matching
            debugSplit={cameraSettings?.motionBlurDebugSplit ?? false}
            // COLOR MATCHING STRATEGY: FULLY CONFIGURABLE
            colorSpace={cameraSettings?.motionBlurColorSpace ?? 'srgb'}
            unpackColorspaceConversion="default"
            useSRGBBuffer={false}
            samples={cameraSettings?.motionBlurSamples === 0 ? undefined : cameraSettings?.motionBlurSamples}
            blackLevel={Number.isFinite(cameraSettings?.motionBlurBlackLevel) ? (cameraSettings?.motionBlurBlackLevel ?? 0) : 0}
            saturation={Number.isFinite(cameraSettings?.motionBlurSaturation) ? (cameraSettings?.motionBlurSaturation ?? 1.0) : 1.0}
            unpackPremultiplyAlpha={cameraSettings?.motionBlurUnpackPremultiply ?? false}
            force={cameraSettings?.motionBlurForce ?? false}
          />

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
      <VideoPositionProvider value={{
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
        videoHeight
      }}>
        {children}
      </VideoPositionProvider>
    </AbsoluteFill>
  );
};
