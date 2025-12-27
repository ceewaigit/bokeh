/**
 * SharedVideoController.tsx
 *
 * Central video orchestration component for the Remotion composition.
 * Manages video clip rendering, transforms, and visual effects for both
 * preview playback and export rendering modes.
 *
 * Now uses extracted hooks for clean separation of concerns:
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
import {
  createMotionBlurSvg,
  getMotionBlurConfig,
} from './utils/transforms/zoom-transform';
import { calculateCameraMotionBlur } from './utils/effects/camera-motion-blur';
import type { SharedVideoControllerProps } from '@/types';
import {
  getBoundaryOverlapState,
} from '@/lib/timeline/frame-layout';
import { usePrecomputedCameraPath } from '@/remotion/hooks/camera/usePrecomputedCameraPath';
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
import { PreviewGuides } from '@/components/preview-guides';

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
  playback,
  renderSettings,
  cropSettings: _cropSettings,
}) => {
  // ==========================================================================
  // FAIL-FAST VALIDATION
  // ==========================================================================

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

  // SSOT: isScrubbing is now used to optimize memory during rapid seeking
  const { isPlaying, isScrubbing } = playback;
  const { isEditingCrop, preferOffthreadVideo } = renderSettings;

  const currentTimeMs = frameToMs(currentFrame, fps);
  const cameraPathCache = useProjectStore((s) => s.cameraPathCache);

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
  const { activeIndex: activeLayoutIndex, activeItem: activeLayoutItem, prevItem: prevLayoutItem, nextItem: nextLayoutItem } = layoutNav;

  // ==========================================================================
  // BOUNDARY STATE
  // ==========================================================================
  const boundaryState = useMemo(() => {
    return getBoundaryOverlapState({
      currentFrame, fps, isRendering, activeLayoutItem, prevLayoutItem, nextLayoutItem,
      sourceWidth: sourceVideoWidth, sourceHeight: sourceVideoHeight,
    });
  }, [currentFrame, fps, isRendering, activeLayoutItem, prevLayoutItem, nextLayoutItem, sourceVideoWidth, sourceVideoHeight]);

  const { isNearBoundaryStart, isNearBoundaryEnd, shouldHoldPrevFrame, overlapFrames } = boundaryState;

  // ==========================================================================
  // CLIP DATA RESOLUTION
  // ==========================================================================

  // Pre-compute camera path
  const cameraPathFrame = usePrecomputedCameraPath({
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

  // Manual Motion Blur Config
  const motionBlurId = useMemo(() => `motion-blur-${Math.random().toString(36).substr(2, 9)}`, []);
  const motionBlurConfig = getMotionBlurConfig(cameraSettings);
  const prevPanRef = useRef<{ panX: number; panY: number } | null>(null);

  useEffect(() => {
    if (!isRendering && zoomTransform) {
      prevPanRef.current = { panX: zoomTransform.panX, panY: zoomTransform.panY };
    }
  }, [isRendering, zoomTransform?.panX, zoomTransform?.panY]);

  const cameraMotionBlur = useMemo(() => {
    return calculateCameraMotionBlur({
      blurConfig: motionBlurConfig,
      renderData: zoomTransform
        ? {
          zoomTransform,
          drawWidth: layout.drawWidth,
          drawHeight: layout.drawHeight,
          padding: layout.padding,
          scaleFactor: layout.scaleFactor,
        }
        : null,
      currentFrame,
      fps,
      outputWidth: width,
      outputHeight: height,
      isRendering,
      isNearBoundaryStart,
      isNearBoundaryEnd,
      shouldHoldPrevFrame,
      precomputedPath: cameraPathFrame?.path,
      calculatedZoomCenter: cameraPathFrame?.zoomCenter ?? { x: 0.5, y: 0.5 },
      calculatedZoomBlock: cameraPathFrame?.activeZoomBlock,
      prevPanRef: prevPanRef.current,
    });
  }, [
    motionBlurConfig,
    zoomTransform,
    layout.drawWidth,
    layout.drawHeight,
    layout.padding,
    layout.scaleFactor,
    currentFrame,
    fps,
    width,
    height,
    isRendering,
    isNearBoundaryStart,
    isNearBoundaryEnd,
    shouldHoldPrevFrame,
    cameraPathFrame?.path,
    cameraPathFrame?.zoomCenter,
    cameraPathFrame?.activeZoomBlock,
  ]);

  const motionBlurActive = motionBlurConfig.enabled && cameraMotionBlur.blurRadius > 0.2;
  const refocusIntensity = cameraSettings?.refocusBlurEnabled === false
    ? 0
    : Math.max(0, Math.min(1, (cameraSettings?.refocusBlurIntensity ?? 40) / 100));
  const refocusBlurPx = (zoomTransform?.refocusBlur ?? 0) * 12 * refocusIntensity;

  // ==========================================================================
  // RENDERABLE ITEMS
  // ==========================================================================
  const renderableItems = useRenderableItems({
    frameLayout,
    currentFrame,
    fps,
    isRendering,
    isPlaying,
    isScrubbing,
    recordingsMap,
    activeLayoutIndex,
    activeLayoutItem,
    prevLayoutItem,
    nextLayoutItem,
    shouldHoldPrevFrame,
    isNearBoundaryEnd,
  });

  // ==========================================================================
  // RENDER CONTENT
  // ==========================================================================

  const renderedContent = useMemo(() => {
    // Compute zoom scales once for all clips
    const maxZoom = getMaxZoomScale(effects);
    const currentScale = zoomTransform?.scale ?? 1;

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
            activeLayoutItem={activeLayoutItem}
            prevLayoutItem={prevLayoutItem}
            nextLayoutItem={nextLayoutItem}
            shouldHoldPrevFrame={shouldHoldPrevFrame}
            isNearBoundaryEnd={isNearBoundaryEnd}
            overlapFrames={overlapFrames}
            markRenderReady={markRenderReady}
            handleVideoReady={handleVideoReady}
            VideoComponent={preferOffthreadVideo ? OffthreadVideo : Video}
            premountFor={30}
            postmountFor={30}
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
            activeLayoutItem={activeLayoutItem}
            prevLayoutItem={prevLayoutItem}
            nextLayoutItem={nextLayoutItem}
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
    shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
    markRenderReady, handleVideoReady, preferOffthreadVideo
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
          refocusBlurPx,
          cameraMotionBlur: motionBlurActive
            ? { enabled: true, angle: cameraMotionBlur.angle, filterId: motionBlurId }
            : { enabled: false, angle: 0, filterId: motionBlurId },
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
      {motionBlurConfig.enabled && (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 0 }}>
          {createMotionBlurSvg(cameraMotionBlur.blurRadius, motionBlurId)}
        </AbsoluteFill>
      )}

      {/* Main Transform Container */}
      <AbsoluteFill>
        <AbsoluteFill
          style={{
            filter: motionBlurActive ? `url(#${motionBlurId})` : undefined,
            transform: motionBlurActive ? `rotate(${cameraMotionBlur.angle}deg)` : undefined,
            transformOrigin: '50% 50%',
            willChange: isRendering ? undefined : 'transform',
          }}
        >
          <AbsoluteFill
            style={{
              transform: motionBlurActive ? `rotate(${-cameraMotionBlur.angle}deg)` : undefined,
              transformOrigin: '50% 50%',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: layout.mockupEnabled ? 0 : layout.offsetX,
                top: layout.mockupEnabled ? 0 : layout.offsetY,
                width: layout.mockupEnabled ? '100%' : layout.drawWidth,
                height: layout.mockupEnabled ? '100%' : layout.drawHeight,
                transform: outerTransform,
                transformOrigin: 'center center',
                filter: refocusBlurPx > 0.01 ? `blur(${refocusBlurPx}px)` : undefined,
                clipPath: layout.mockupEnabled ? undefined : cropClipPath,
                borderRadius: layout.mockupEnabled ? undefined : layout.cornerRadius,
                overflow: cropClipPath ? 'hidden' : undefined,
              }}
            >
              {/* Render content, optionally wrapped in mockup */}
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
          </AbsoluteFill>
        </AbsoluteFill>

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
        refocusBlurPx,
        cameraMotionBlur: motionBlurActive
          ? { enabled: true, angle: cameraMotionBlur.angle, filterId: motionBlurId }
          : { enabled: false, angle: 0, filterId: motionBlurId },
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
