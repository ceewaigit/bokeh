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
} from '../context/video-data-context';
import { useComposition } from '../context/CompositionContext';
import { useProjectStore } from '@/stores/project-store';
import { VideoPositionProvider } from '../context/layout/VideoPositionContext';
import type { SharedVideoControllerProps } from '@/types';
import { getMaxZoomScale } from '@/remotion/hooks/media/useVideoUrl';
import { useRenderDelay } from '@/remotion/hooks/render/useRenderDelay';
import { useFrameSnapshot } from '@/remotion/hooks/use-frame-snapshot';

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
  sourceVideoWidth: _sourceVideoWidth,
  sourceVideoHeight: _sourceVideoHeight,
  children,
  cameraSettings,
  renderSettings,
  cameraPath: _cameraPath,
}) => {
  // ==========================================================================
  // REMOTION HOOKS & CONTEXT
  // ==========================================================================
  const currentFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { fps } = useComposition();
  const { isRendering } = getRemotionEnvironment();
  const isPreview = !isRendering;

  // Consume computed video data from context (for rendering loop)
  const { recordingsMap, effects, getActiveClipData, frameLayout } = useVideoData();

  const { preferOffthreadVideo } = renderSettings;
  const useOffthreadVideo = isRendering && preferOffthreadVideo;

  const isScrubbing = useProjectStore((s) => s.isScrubbing);

  // ==========================================================================
  // SNAPSHOT (Zero-Prop)
  // ==========================================================================

  // Single hook for all layout, transform, and clip resolution calculations
  const snapshot = useFrameSnapshot();

  const {
    effectiveClipData: resolvedClipData,
    renderableItems,
    boundaryState,
    layout: snapshotLayout,
    mockup: snapshotMockup,
    transforms: snapshotTransforms,
    camera: snapshotCamera,
    layoutItems
  } = snapshot;

  // Extract boundary state
  const shouldHoldPrevFrame = boundaryState?.shouldHoldPrevFrame ?? false;
  const isNearBoundaryEnd = boundaryState?.isNearBoundaryEnd ?? false;
  const overlapFrames = boundaryState?.overlapFrames ?? 0;

  // Extract layout items
  const { active: activeLayoutItem, prev: prevLayoutItem, next: nextLayoutItem } = layoutItems;

  // Destructure for backwards compatibility with existing code
  const layout = {
    ...snapshotLayout,
    // Include mockup properties for backwards compatibility
    mockupEnabled: snapshotMockup.enabled,
    mockupData: snapshotMockup.data,
    mockupPosition: snapshotMockup.position,
  };
  const outerTransform = snapshotTransforms.combined;
  const cropClipPath = snapshotTransforms.clipPath;
  const zoomTransform = snapshotCamera.zoomTransform;

  // ==========================================================================
  // ACTIVE CLIP DATA (Legacy/Context)
  // ==========================================================================
  const activeClipData = useActiveClipData(currentFrame);

  // Previous frame's clip data (for cursor smoothing)
  const prevFrameClipData = useMemo(
    () => currentFrame > 0 ? getActiveClipData(currentFrame - 1) : null,
    [currentFrame, getActiveClipData]
  );

  // ==========================================================================
  // RENDER DELAY
  // ==========================================================================
  const { markRenderReady, handleVideoReady } = useRenderDelay(isRendering);

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

  // ============================================================================
  // REFOCUS BLUR (Zoom transitions only - motion blur handled by WebGL)
  // ============================================================================
  const refocusEnabled = cameraSettings?.refocusBlurEnabled !== false;
  const refocusIntensity = refocusEnabled
    ? Math.max(0, Math.min(1, (cameraSettings?.refocusBlurIntensity ?? 50) / 100))
    : 0;

  // Refocus blur during zoom transitions (intro/outro phases)
  const refocusBlurRaw = ((zoomTransform as any)?.refocusBlur ?? 0) * 12 * refocusIntensity;
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
            compositionWidth={width}
            compositionHeight={height}
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
            compositionWidth={width}
            compositionHeight={height}
          />
        );
      }
      return null;
    });
  }, [
    renderableItems, recordingsMap, width, height,
    currentFrame, fps, isRendering, layout,
    activeLayoutItem, prevLayoutItem, nextLayoutItem,
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
    zoomTransform: (zoomTransform as any) ?? null,
    contentTransform: outerTransform,
    refocusBlurPx: effectiveBlurPx,
    // NEW: Motion blur state for IoC pattern (VideoClipRenderer consumes this)
    motionBlur: {
      enabled: isMotionBlurActive,
      velocity: snapshotCamera.velocity,
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
                <MockupLayer>
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
              />
            )}
          </div>

          {/* Preview Guides */}
          {isPreview && (
            <PreviewGuides />
          )}
        </AbsoluteFill>

        {/* Overlays */}
        {children}
      </VideoPositionProvider>
    </AbsoluteFill>
  );
};
