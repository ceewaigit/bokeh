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

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Video, OffthreadVideo, AbsoluteFill, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion';
import { useTimeContext } from '../context/TimeContext';
import { useProjectStore } from '@/stores/project-store';
import { VideoPositionProvider } from '../context/VideoPositionContext';
import {
  createMotionBlurSvg,
  getMotionBlurConfig,
} from './utils/zoom-transform';
import { calculateCameraMotionBlur } from './utils/camera-motion-blur';
import type { SharedVideoControllerProps } from '@/types';
import type { Clip, Recording } from '@/types/project';
import {
  buildFrameLayout,
  findActiveFrameLayoutIndex,
  getBoundaryOverlapState,
  type FrameLayoutItem,
} from '@/lib/timeline/frame-layout';
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame';
import { usePrecomputedCameraPath } from '@/remotion/hooks/usePrecomputedCameraPath';
import { useRecordingMetadata } from '@/remotion/hooks/useRecordingMetadata';
import { getMaxZoomScale } from '@/remotion/hooks/useVideoUrl';
import { useRenderDelay } from '@/remotion/hooks/useRenderDelay';
import { useRenderableItems } from '@/remotion/hooks/useRenderableItems';
import { useEffectiveClipData } from '@/remotion/hooks/useEffectiveClipData';
import { useLayoutCalculation } from '@/remotion/hooks/useLayoutCalculation';
import { useTransformCalculation } from '@/remotion/hooks/useTransformCalculation';
import { SafeVideo } from '@/remotion/components/video-helpers';
import { frameToMs } from './utils/frame-time';

import { VideoClipRenderer } from './renderers/VideoClipRenderer';
import { GeneratedClipRenderer } from './renderers/GeneratedClipRenderer';
import { ImageClipRenderer } from './renderers/ImageClipRenderer';
import { MockupLayer } from './layers/MockupLayer';
import { PreviewGuides } from '@/components/preview-guides';

// ============================================================================
// TYPES
// ============================================================================

type PreviewVideoState = {
  recording: Recording;
  clip: any;
  layoutItem: FrameLayoutItem;
  sourceTimeMs: number;
  maxZoomScale?: number;
};

// ============================================================================
// COMPONENT
// ============================================================================

export const SharedVideoController: React.FC<SharedVideoControllerProps> = ({
  videoWidth,
  videoHeight,
  sourceVideoWidth,
  sourceVideoHeight,
  effects,
  children,
  cameraSettings,
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

  // SSOT: isScrubbing kept for type compatibility but no longer affects behavior
  const { isPlaying, isScrubbing: _isScrubbing, isHighQualityPlaybackEnabled, previewMuted, previewVolume } = playback;
  const { isGlowMode, isEditingCrop, preferOffthreadVideo, enhanceAudio } = renderSettings;
  const { metadataUrls } = resources;

  const currentTimeMs = frameToMs(currentFrame, fps);
  const cameraPathCache = useProjectStore((s) => s.cameraPathCache);

  // ==========================================================================
  // FRAME LAYOUT
  // ==========================================================================
  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => a.startTime - b.startTime),
    [clips]
  );

  const frameLayout = useMemo(
    () => buildFrameLayout(sortedClips, fps, recordingsMap),
    [sortedClips, fps, recordingsMap]
  );

  // ==========================================================================
  // ACTIVE CLIP DETECTION
  // ==========================================================================
  const activeLayoutIndex = useMemo(
    () => findActiveFrameLayoutIndex(frameLayout, currentFrame),
    [frameLayout, currentFrame]
  );
  const activeLayoutItem = activeLayoutIndex >= 0 ? frameLayout[activeLayoutIndex] : null;
  const prevLayoutItem = activeLayoutIndex > 0 ? frameLayout[activeLayoutIndex - 1] : null;
  const nextLayoutItem = activeLayoutIndex >= 0 && activeLayoutIndex < frameLayout.length - 1
    ? frameLayout[activeLayoutIndex + 1]
    : null;

  const activeClipData = useMemo(
    () => getActiveClipDataAtFrame({ frame: currentFrame, frameLayout, fps, effects, getRecording }),
    [currentFrame, effects, fps, frameLayout, getRecording]
  );

  // ==========================================================================
  // BOUNDARY STATE
  // ==========================================================================
  const boundaryState = useMemo(() => {
    return getBoundaryOverlapState({
      currentFrame, fps, isRendering, activeLayoutItem, prevLayoutItem, nextLayoutItem,
      sourceWidth: sourceVideoWidth, sourceHeight: sourceVideoHeight,
    });
  }, [currentFrame, fps, isRendering, isPlaying, activeLayoutItem, prevLayoutItem, nextLayoutItem, sourceVideoWidth, sourceVideoHeight]);

  const { isNearBoundaryStart, isNearBoundaryEnd, shouldHoldPrevFrame, overlapFrames } = boundaryState;

  // ==========================================================================
  // EFFECTIVE CLIP DATA (with inheritance)
  // ==========================================================================
  const { effectiveClipData, persistedVideoState } = useEffectiveClipData({
    activeClipData,
    currentFrame,
    frameLayout,
    fps,
    effects,
    getRecording,
    isRendering,
    isNearBoundaryStart,
    isNearBoundaryEnd,
    activeLayoutItem,
    prevLayoutItem,
    nextLayoutItem,
  });

  // ==========================================================================
  // METADATA & ZOOM
  // ==========================================================================
  const activeRecording = effectiveClipData?.recording ?? null;

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

  const memoizedMaxZoomScale = useMemo(() => getMaxZoomScale(effects), [effects]);

  const precomputedCamera = usePrecomputedCameraPath({
    enabled: true, isRendering, currentFrame, frameLayout, fps, videoWidth, videoHeight,
    sourceVideoWidth, sourceVideoHeight, effects, getRecording, loadedMetadata,
    cachedPath: cameraPathCache,
  });

  const calculatedZoomBlock = precomputedCamera?.activeZoomBlock;
  const calculatedZoomCenter = precomputedCamera?.zoomCenter ?? { x: 0.5, y: 0.5 };

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
    recordingWidth: effectiveClipData?.recording.width,
    recordingHeight: effectiveClipData?.recording.height,
    clipEffects: effectiveClipData?.effects ?? [],
    sourceTimeMs: effectiveClipData?.sourceTimeMs ?? 0,
    isEditingCrop,
  });

  // ==========================================================================
  // TRANSFORM CALCULATION
  // ==========================================================================
  const transforms = useTransformCalculation({
    currentTimeMs,
    sourceTimeMs: effectiveClipData?.sourceTimeMs ?? 0,
    clipEffects: effectiveClipData?.effects ?? [],
    calculatedZoomBlock,
    calculatedZoomCenter,
    compositionWidth: width,
    compositionHeight: height,
    drawWidth: layout.drawWidth,
    drawHeight: layout.drawHeight,
    paddingScaled: layout.paddingScaled,
    cornerRadius: layout.cornerRadius,
    mockupEnabled: layout.mockupEnabled,
    mockupPosition: layout.mockupPosition,
    isEditingCrop,
  });

  // ==========================================================================
  // RENDERABLE ITEMS
  // ==========================================================================
  const renderableItems = useRenderableItems({
    frameLayout,
    currentFrame,
    fps,
    isRendering,
    isPlaying,
    isScrubbing: false,  // SSOT: unified code path
    recordingsMap,
    activeLayoutIndex,
    activeLayoutItem,
    prevLayoutItem,
    nextLayoutItem,
    shouldHoldPrevFrame,
    isNearBoundaryEnd,
  });

  // ==========================================================================
  // RENDER DELAY
  // ==========================================================================
  const { markRenderReady, handleVideoReady } = useRenderDelay(isRendering);

  // ==========================================================================
  // MOTION BLUR
  // ==========================================================================
  const prevPanRef = useRef<{ panX: number; panY: number; frame: number } | null>(null);
  const blurConfig = getMotionBlurConfig(cameraSettings);

  const currentPan = transforms.zoomTransform ? {
    panX: transforms.zoomTransform.panX,
    panY: transforms.zoomTransform.panY,
    frame: currentFrame,
  } : null;

  const prevPanForBlur = (prevPanRef.current && prevPanRef.current.frame !== currentFrame)
    ? prevPanRef.current
    : null;

  const motionBlur = useMemo(() => calculateCameraMotionBlur({
    blurConfig,
    renderData: {
      zoomTransform: transforms.zoomTransform,
      drawWidth: layout.drawWidth,
      drawHeight: layout.drawHeight,
      padding: layout.padding,
      scaleFactor: layout.scaleFactor,
    },
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
    prevPanRef: prevPanForBlur,
  }), [
    blurConfig, transforms.zoomTransform, layout.drawWidth, layout.drawHeight,
    layout.padding, layout.scaleFactor, currentFrame, fps, width, height,
    isRendering, isNearBoundaryStart, isNearBoundaryEnd, shouldHoldPrevFrame,
    precomputedCamera?.path, calculatedZoomCenter, calculatedZoomBlock, prevPanForBlur,
  ]);

  useLayoutEffect(() => {
    if (!isRendering && currentPan) {
      prevPanRef.current = currentPan;
    }
  }, [isRendering, currentPan?.panX, currentPan?.panY, currentPan?.frame]);

  // ==========================================================================
  // EARLY RETURN
  // ==========================================================================
  if (!effectiveClipData || sortedClips.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: '#000' }} />;
  }

  // ==========================================================================
  // DERIVED VALUES
  // ==========================================================================
  const { clip, recording, sourceTimeMs } = effectiveClipData;
  const { drawWidth, drawHeight, offsetX, offsetY, cornerRadius, shadowIntensity, scaleFactor,
    activeSourceWidth, activeSourceHeight, padding, mockupEnabled, mockupData, mockupPosition } = layout;
  const { outerTransform, cropTransformStr, extra3DTransform, zoomTransform, cropClipPath, cropEffectId } = transforms;

  const isActiveGenerated = recording?.sourceType === 'generated';

  const previewVideoState: PreviewVideoState | null = isActiveGenerated
    ? (persistedVideoState ? { ...persistedVideoState, maxZoomScale: memoizedMaxZoomScale } : null)
    : (recording && activeLayoutItem ? {
      recording,
      clip: activeClipData?.clip as Clip,
      layoutItem: activeLayoutItem,
      sourceTimeMs: activeClipData?.sourceTimeMs ?? 0,
      maxZoomScale: memoizedMaxZoomScale
    } : null);


  const VideoComponent = (isRendering && preferOffthreadVideo) ? OffthreadVideo : (isRendering ? SafeVideo : Video);

  // ==========================================================================
  // UNIFIED CLIP RENDERING
  // ==========================================================================

  // Common props shared across all clip renderers
  const commonRenderProps = {
    currentFrame, fps, isRendering,
    compositionWidth: width, compositionHeight: height,
    activeLayoutItem, prevLayoutItem, nextLayoutItem,
    isNearBoundaryEnd, overlapFrames,
  };

  // Render a single clip item for preview and export
  const renderClipItem = (
    item: FrameLayoutItem,
    itemRecording: Recording | undefined,
    targetWidth: number,
    targetHeight: number,
    targetRadius: number,
    options: { isPrev?: boolean; isActive?: boolean; isPreviewBackground?: boolean } = {}
  ) => {
    if (!itemRecording) return null;

    const { isPrev = false, isActive = false, isPreviewBackground = false } = options;
    const itemShouldHoldPrevFrame = isPreviewBackground ? false : (isPrev ? shouldHoldPrevFrame : (isActive ? shouldHoldPrevFrame : false));
    const renderStartFrom = Math.round(((item.clip.sourceIn || 0) / 1000) * fps);

    // Generated clips (plugins, cursor return, etc.)
    if (itemRecording.sourceType === 'generated') {
      return (
        <GeneratedClipRenderer
          key={item.groupId}
          clipForVideo={item.clip}
          recording={itemRecording}
          startFrame={item.startFrame}
          durationFrames={item.durationFrames}
          groupStartFrame={item.groupStartFrame}
          groupDuration={item.groupDuration}
          {...commonRenderProps}
          drawWidth={targetWidth}
          drawHeight={targetHeight}
          shouldHoldPrevFrame={itemShouldHoldPrevFrame}
        />
      );
    }

    // Image clips (freeze frames, etc.)
    if (itemRecording.sourceType === 'image') {
      return (
        <ImageClipRenderer
          key={`image-${item.groupId}`}
          clipForVideo={item.clip}
          recording={itemRecording}
          startFrame={item.startFrame}
          durationFrames={item.durationFrames}
          groupStartFrame={item.groupStartFrame}
          groupDuration={item.groupDuration}
          {...commonRenderProps}
          cornerRadius={targetRadius}
          drawWidth={targetWidth}
          drawHeight={targetHeight}
          shouldHoldPrevFrame={itemShouldHoldPrevFrame}
        />
      );
    }

    // Video clips
    return (
      <VideoClipRenderer
        key={item.groupId}
        clipForVideo={item.clip}
        recording={itemRecording}
        startFrame={item.startFrame}
        durationFrames={item.durationFrames}
        groupStartFrame={item.groupStartFrame}
        renderStartFrom={renderStartFrom}
        groupDuration={item.groupDuration}
        {...commonRenderProps}
        cornerRadius={targetRadius}
        drawWidth={targetWidth}
        drawHeight={targetHeight}
        maxZoomScale={memoizedMaxZoomScale}
        currentZoomScale={zoomTransform?.scale ?? 1}
        mockupEnabled={mockupEnabled}
        shouldHoldPrevFrame={itemShouldHoldPrevFrame}
        markRenderReady={markRenderReady}
        handleVideoReady={handleVideoReady}
        VideoComponent={VideoComponent}
        premountFor={0}
        postmountFor={0}
      />
    );
  };

  // ==========================================================================
  // RENDER CONTENT
  // ==========================================================================
  const renderContent = (targetWidth: number, targetHeight: number, targetRadius: number) => {
    // PREVIEW MODE: Render single active clip + generated overlay if applicable
    if (isPreview) {
      return (
        <>
          {previewVideoState && previewVideoState.layoutItem && (
            renderClipItem(
              previewVideoState.layoutItem,
              previewVideoState.recording,
              targetWidth,
              targetHeight,
              targetRadius,
              { isPreviewBackground: true }
            )
          )}

          {isActiveGenerated && activeLayoutItem && recording && (
            renderClipItem(
              activeLayoutItem,
              recording,
              targetWidth,
              targetHeight,
              targetRadius,
              { isActive: true }
            )
          )}
        </>
      );
    }

    // EXPORT MODE: Render all visible items
    return (
      <>
        {renderableItems.map((item) => {
          const isPrev = item.clip.id === prevLayoutItem?.clip.id;
          const isActive = item.clip.id === activeLayoutItem?.clip.id;
          const isGroupActive = activeLayoutItem && item.groupId === activeLayoutItem.groupId;
          const isGroupPrev = prevLayoutItem && item.groupId === prevLayoutItem.groupId;
          const isGroupNext = nextLayoutItem && item.groupId === nextLayoutItem.groupId;

          const shouldRender = isGroupActive || (isGroupPrev && shouldHoldPrevFrame) || (isGroupNext && isNearBoundaryEnd);
          if (!shouldRender) return null;

          const itemRecording = recordingsMap.get(item.clip.recordingId);
          return renderClipItem(item, itemRecording, targetWidth, targetHeight, targetRadius, { isPrev, isActive });
        })}
      </>
    );
  };

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
  // MOTION BLUR SVG
  // ==========================================================================
  const motionBlurFilterId = 'camera-motion-blur';
  const hasMotionBlur = blurConfig.enabled && motionBlur.blurRadius > 0.2 && !isEditingCrop;
  const motionBlurSvg = hasMotionBlur ? createMotionBlurSvg(motionBlur.blurRadius, motionBlurFilterId) : null;

  // ==========================================================================
  // VIDEO POSITION CONTEXT
  // ==========================================================================
  const effectiveOffsetX = mockupEnabled && mockupPosition ? mockupPosition.videoX : offsetX;
  const effectiveOffsetY = mockupEnabled && mockupPosition ? mockupPosition.videoY : offsetY;
  const effectiveDrawWidth = mockupEnabled && mockupPosition ? mockupPosition.videoWidth : drawWidth;
  const effectiveDrawHeight = mockupEnabled && mockupPosition ? mockupPosition.videoHeight : drawHeight;

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
    zoomTransform?.scale, zoomTransform?.panX, zoomTransform?.panY, zoomTransform?.refocusBlur,
    contentTransform, padding, activeSourceWidth, activeSourceHeight,
    hasMotionBlur, motionBlur.angle, mockupEnabled,
    mockupPosition?.videoX, mockupPosition?.videoY, mockupPosition?.videoWidth, mockupPosition?.videoHeight,
  ]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <VideoPositionProvider value={videoPositionValue}>
      {motionBlurSvg}

      <AbsoluteFill style={{
        zIndex: 10,
        filter: hasMotionBlur ? `url(#${motionBlurFilterId})` : undefined,
        transform: hasMotionBlur ? `rotate(${motionBlur.angle}deg)` : undefined,
        transformOrigin: '50% 50%',
      }}>
        <div style={{
          transform: hasMotionBlur ? `rotate(${-motionBlur.angle}deg)` : undefined,
          transformOrigin: '50% 50%', width: '100%', height: '100%',
        }}>
          {mockupEnabled && mockupPosition && mockupData ? (
            <div style={{
              position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
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
                <div style={{
                  position: 'absolute', inset: 0, overflow: 'hidden',
                  borderRadius: `${mockupPosition.screenCornerRadius}px`,
                  filter: (cameraSettings?.refocusBlurEnabled !== false && (zoomTransform?.refocusBlur ?? 0) > 0.01 && !isPlaying && (isRendering || isHighQualityPlaybackEnabled))
                    ? `blur(${(zoomTransform?.refocusBlur ?? 0) * ((cameraSettings?.refocusBlurIntensity ?? 40) / 100) * 12}px)`
                    : undefined,
                }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    transform: cropTransformStr || undefined,
                    transformOrigin: '50% 50%',
                    clipPath: cropClipPath || undefined,
                  }}>
                    {renderContent(mockupPosition.videoWidth, mockupPosition.videoHeight, 0)}
                  </div>
                </div>
              </MockupLayer>
            </div>
          ) : (
            <div style={{
              position: 'absolute', left: offsetX, top: offsetY, width: drawWidth, height: drawHeight,
              overflow: 'hidden',
              transform: `translate3d(0,0,0) ${combinedTransform}`,
              transformOrigin: '50% 50%',
              filter: dropShadow || undefined,
              willChange: 'transform, filter', backfaceVisibility: 'hidden' as const,
            }}>
              <div style={{
                position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: `${cornerRadius}px`,
                filter: (cameraSettings?.refocusBlurEnabled !== false && (zoomTransform?.refocusBlur ?? 0) > 0.01 && (isRendering || isHighQualityPlaybackEnabled))
                  ? `blur(${(zoomTransform?.refocusBlur ?? 0) * ((cameraSettings?.refocusBlurIntensity ?? 40) / 100) * 12}px)`
                  : undefined,
              }}>
                <div
                  key={cropEffectId || 'no-crop'}
                  style={{
                    position: 'absolute', inset: 0, transform: cropTransformStr || undefined,
                    transformOrigin: '50% 50%', willChange: cropTransformStr ? 'transform' : undefined,
                    backfaceVisibility: 'hidden' as const,
                    clipPath: cropClipPath || undefined,
                  }}>
                  {renderContent(drawWidth, drawHeight, cornerRadius)}
                </div>
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ zIndex: 20 }}>{children}</AbsoluteFill>

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
