/**
 * SharedVideoController.tsx
 *
 * Central video orchestration component for the Remotion composition.
 * Manages video clip rendering, transforms, and visual effects for both
 * preview playback and export rendering modes.
 *
 * Uses consolidated hook for performance:
 * - useFrameSnapshot: Consolidates layout, transforms, clip resolution, and renderable items
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
import { useFrameSnapshot } from '@/remotion/hooks/use-frame-snapshot';
import { frameToMs } from './utils/time/frame-time';

import { VideoClipRenderer } from './renderers/VideoClipRenderer';
import { GeneratedClipRenderer } from './renderers/GeneratedClipRenderer';
import { ImageClipRenderer } from './renderers/ImageClipRenderer';
import { MockupLayer } from './layers/MockupLayer';

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
  cameraPath,
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
  // cameraPathCache is now passed via props as `cameraPath` (SSOT)
  // const cameraPathCache = useProjectStore((s) => s.cameraPathCache); // Removed
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

  const { shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames } = boundaryState;

  // ==========================================================================
  // CLIP DATA RESOLUTION & CAMERA
  // ==========================================================================

  // Pre-compute camera path
  const cameraPathFrame = useCameraPath({
    enabled: true,
    currentFrame,
    cachedPath: cameraPath
  });

  // ==========================================================================
  // RENDER DELAY
  // ==========================================================================
  const { markRenderReady, handleVideoReady } = useRenderDelay(isRendering);

  // ==========================================================================
  // LAYOUT + TRANSFORM CALCULATION (Single Pass)
  // ==========================================================================

  // Precomputed zoom from camera path cache
  const zoomTransform = cameraPathFrame?.zoomTransform ?? null;
  const zoomTransformStr = cameraPathFrame?.zoomTransformStr ?? '';

  // Single hook for all layout and transform calculations
  const snapshot = useFrameSnapshot({
    compositionWidth: width,
    compositionHeight: height,
    videoWidth,
    videoHeight,
    sourceVideoWidth,
    sourceVideoHeight,
    // Clip resolution props
    currentFrame,
    currentTimeMs,
    fps,
    frameLayout,
    recordingsMap,
    activeClipData,
    clipEffects: effects,
    getRecording: (id) => getRecording(id) ?? null,
    isRendering,
    boundaryState: {
      ...boundaryState,
      activeLayoutItem: renderActiveLayoutItem,
      prevLayoutItem: renderPrevLayoutItem,
      nextLayoutItem: renderNextLayoutItem,
    },
    // Transform props
    zoomTransform: zoomTransform as any,
    zoomTransformStr,
    isEditingCrop
  });

  const { effectiveClipData: resolvedClipData, renderableItems } = snapshot;

  // Destructure for backwards compatibility with existing code
  const layout = {
    ...snapshot.layout,
    // Include mockup properties for backwards compatibility
    mockupEnabled: snapshot.mockup.enabled,
    mockupData: snapshot.mockup.data,
    mockupPosition: snapshot.mockup.position,
  };
  const outerTransform = snapshot.transforms.combined;
  const cropClipPath = snapshot.transforms.clipPath;

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
  const MOTION_BLUR_MIN_WIDTH = 200;  // Only apply to main video, not webcam
  const isMainVideo = layout.drawWidth >= MOTION_BLUR_MIN_WIDTH;
  const isMotionBlurActive = motionBlurEnabled && isMainVideo;

  // Read precomputed velocity directly from cache (already smoothed in calculator)
  const cameraVelocity = useMemo(() => {
    if (!isMotionBlurActive || !cameraPathFrame?.velocity) return { x: 0, y: 0 };

    // Scale normalized velocity to pixels
    const scale = zoomTransform?.scale ?? 1;

    // Calculate final pixel velocity
    // NOTE: Precomputed velocity is already normalized delta-per-frame (0-1)
    // We just need to scale it to current dimensions
    const pxVelocityX = cameraPathFrame.velocity.x * layout.drawWidth * scale;
    const pxVelocityY = cameraPathFrame.velocity.y * layout.drawHeight * scale;

    return {
      x: Number.isFinite(pxVelocityX) ? pxVelocityX : 0,
      y: Number.isFinite(pxVelocityY) ? pxVelocityY : 0,
    };
  }, [
    isMotionBlurActive,
    cameraPathFrame?.velocity,
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
  // Allow fractional blur for smooth transitions (prevents 0->1px snap blink)
  const effectiveBlurPx = refocusBlurRaw < 0.1 ? 0 : Number(refocusBlurRaw.toFixed(2));

  useEffect(() => {
    // Preview ready when no motion blur (which handles its own readiness)
    if (!isRendering && !motionBlurEnabled) {
      setPreviewReady(true);
    }
  }, [isRendering, motionBlurEnabled, setPreviewReady]);

  // ==========================================================================
  // RENDERABLE ITEMS
  // ==========================================================================

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
    // NEW: Motion blur state for IoC pattern (VideoClipRenderer consumes this)
    motionBlur: {
      enabled: motionBlurEnabled && isMainVideo,
      velocity: cameraVelocity,
      intensity: motionBlurIntensity / 100,
      drawWidth: layout.drawWidth,
      drawHeight: layout.drawHeight,
    },
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
