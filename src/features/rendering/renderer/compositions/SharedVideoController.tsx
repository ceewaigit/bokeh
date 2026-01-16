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
import { useTimelineContext } from '../context/RenderingTimelineContext';
import { useComposition } from '../context/CompositionContext';
import { useProjectStore } from '@/features/core/stores/project-store';
import { VideoPositionProvider } from '../context/layout/VideoPositionContext';
import type { SharedVideoControllerProps } from '@/types';
import { getMaxZoomScale } from '@/features/rendering/renderer/hooks/media/useVideoUrl';
import { useRenderDelay } from '@/features/rendering/renderer/hooks/render/useRenderDelay';
import { useFrameSnapshot } from '@/features/rendering/renderer/hooks/use-frame-snapshot';
// resolveClipFade removed - each renderer now handles its own opacity via useClipRenderState

import { VideoClipRenderer } from './renderers/VideoClipRenderer';
import { GeneratedClipRenderer } from './renderers/GeneratedClipRenderer';
import { ImageClipRenderer } from './renderers/ImageClipRenderer';
import { MockupLayer } from './layers/MockupLayer';
import { AnnotationLayer } from './layers/AnnotationLayer';

import { PreviewGuides } from '@/components/preview-guides';
import { ZOOM_VISUAL_CONFIG } from '@/shared/config/physics-config'
import { getMotionBlurConfig } from '@/features/rendering/canvas/math/transforms/zoom-transform';

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
  // We still need this for recordingsMap and frameLayout which might not be fully in snapshot or needed for iterating
  const { recordingsMap, effects, getActiveClipData, frameLayout } = useTimelineContext();

  const { preferOffthreadVideo } = renderSettings;
  // Note: Motion blur works via DOM fallback + requestVideoFrameCallback for both preview and export.
  // OffthreadVideo caused blob URL failures in the compositor, so we use regular <Video>.
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
  const shouldHoldNextFrame = boundaryState?.shouldHoldNextFrame ?? false;
  // Extract layout items
  const { active: activeLayoutItem, prev: prevLayoutItem, next: nextLayoutItem } = layoutItems;

  // Destructure for backwards compatibility with existing code
  const layout = useMemo(() => ({
    ...snapshotLayout,
    // Include mockup properties for backwards compatibility
    mockupEnabled: snapshotMockup.enabled,
    mockupData: snapshotMockup.data,
    mockupPosition: snapshotMockup.position,
  }), [snapshotLayout, snapshotMockup]);
  const outerTransform = snapshotTransforms.combined;
  const cropClipPath = snapshotTransforms.clipPath;
  const zoomTransform = snapshotCamera.zoomTransform;
  const has3DTransform = Boolean(snapshotTransforms.screen3D);

  // ==========================================================================
  // ACTIVE CLIP DATA (Unified)
  // ==========================================================================
  // Use data directly from snapshot instead of legacy hook
  const activeClipData = snapshot.activeClipData;

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

  // SCRUBBING SAFETY: Cache last valid rendered content to prevent black screen
  // during fast scrubbing when effectiveClipData temporarily becomes null
  const lastValidContentRef = useRef<React.ReactNode>(null);

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
  const exportMotionBlurLoggedRef = useRef(false);
  useEffect(() => {
    if (!isRendering) return;
    if (exportMotionBlurLoggedRef.current) return;
    exportMotionBlurLoggedRef.current = true;
    const v = snapshotCamera.velocity ?? { x: 0, y: 0 };
    const speed = Math.hypot(v.x ?? 0, v.y ?? 0);
    console.log('[ExportDebug] motion-blur-state', JSON.stringify({
      enabled: isMotionBlurActive,
      intensity: motionBlurIntensity,
      velocityThreshold: motionBlurConfig.velocityThreshold,
      speed,
      useWebglVideo: Boolean(isMotionBlurActive ? (cameraSettings?.motionBlurUseWebglVideo ?? true) : false),
      drawWidth: layout.drawWidth,
      drawHeight: layout.drawHeight,
    }));
  }, [isRendering, isMotionBlurActive, motionBlurIntensity, motionBlurConfig.velocityThreshold, snapshotCamera.velocity, cameraSettings, layout.drawWidth, layout.drawHeight]);

  // ============================================================================
  // REFOCUS BLUR (Zoom transitions only - motion blur handled by WebGL)
  // ============================================================================
  const refocusEnabled = cameraSettings?.refocusBlurEnabled !== false;
  const refocusIntensity = refocusEnabled
    ? Math.max(0, Math.min(1, (cameraSettings?.refocusBlurIntensity ?? ZOOM_VISUAL_CONFIG.defaultRefocusBlurIntensity) / 100))
    : 0;

  // Refocus blur during zoom transitions (intro/outro phases)
  const refocusBlurRaw = ((zoomTransform as any)?.refocusBlur ?? 0) * 12 * refocusIntensity;
  // Allow fractional blur for smooth transitions (prevents 0->1px snap blink)
  const effectiveBlurPx = refocusBlurRaw < 0.1 ? 0 : Number(refocusBlurRaw.toFixed(2));

  // NOTE: clipFadeOpacity and useParentFade were removed from here.
  // Each VideoClipRenderer now calculates its own opacity via useClipRenderState.
  // This fixes the bug where clip-specific opacity was shared globally,
  // causing random transparency when multiple clips render simultaneously.

  useEffect(() => {
    // Preview ready when no motion blur (which handles its own readiness)
    if (!isRendering && !motionBlurEnabled) {
      setPreviewReady(true);
    }
  }, [isRendering, motionBlurEnabled, setPreviewReady]);

  // ==========================================================================
  // RENDERABLE ITEMS - Video Readiness
  // ==========================================================================

  // Note: Video elements are keyed by groupId and persist across seek operations.
  // They only remount when the underlying clips change, at which point 
  // VideoClipRenderer's onLoadedData will fire and set previewReady(true).

  // ==========================================================================
  // RENDER CONTENT
  // ==========================================================================

  const renderedContent = useMemo(() => {
    // Keep preloadFrames stable to prevent flash on play/pause transitions
    // The Sequence will handle visibility internally without needing dynamic premount
    const preloadFrames = !isRendering ? 30 : 0;
    return renderableItems.map((item) => {
      // Filter out webcam/PIP clips that are rendered by WebcamClipRenderer
      // These clips have a 'layout' property
      if (item.clip.layout) return null;

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
    renderableItems,
    recordingsMap,
    width,
    height,
    currentFrame,
    fps,
    isRendering,
    markRenderReady,
    handleVideoReady,
    useOffthreadVideo,
    isScrubbing,
  ]);

  // SCRUBBING SAFETY: Cache valid rendered content for fallback during fast scrubbing
  useEffect(() => {
    if (renderedContent && renderedContent.some(c => c !== null)) {
      lastValidContentRef.current = renderedContent;
    }
  }, [renderedContent]);

  // ==========================================================================
  // RETURN
  // ==========================================================================

  // Use velocity directly from camera path - it's deterministic (same frame = same velocity)
  // No caching/filtering - this ensures scrubbing to the same frame always looks identical
  // Memoized to ensure referential stability
  const velocity = useMemo(() => snapshotCamera.velocity ?? { x: 0, y: 0 }, [snapshotCamera.velocity]);

  // Prepare context value
  const videoPositionContextValue = useMemo(() => ({
    ...layout,
    zoomTransform: (zoomTransform as any) ?? null,
    contentTransform: outerTransform,
    has3DTransform,
    refocusBlurPx: effectiveBlurPx,
    // NEW: Motion blur state for IoC pattern (VideoClipRenderer consumes this)
    motionBlur: {
      enabled: isMotionBlurActive,
      velocity: velocity,
      intensity: motionBlurIntensity / 100,
      drawWidth: layout.drawWidth,
      drawHeight: layout.drawHeight,
      colorSpace: cameraSettings?.motionBlurColorSpace,
      gamma: cameraSettings?.motionBlurGamma ?? 1.0,
      blackLevel: cameraSettings?.motionBlurBlackLevel ?? 0,
      saturation: cameraSettings?.motionBlurSaturation ?? 1.0,
      // Respect user setting in both preview and export.
      // When enabled, the motion blur layer can force WebGL video to ensure deterministic frames.
      useWebglVideo: isMotionBlurActive ? (cameraSettings?.motionBlurUseWebglVideo ?? true) : false,
      samples: cameraSettings?.motionBlurSamples,
      unpackPremultiplyAlpha: cameraSettings?.motionBlurUnpackPremultiply ?? false,
      // Pass through settings that were previously ignored
      velocityThreshold: motionBlurConfig.velocityThreshold,
      rampRange: cameraSettings?.motionBlurRampRange ?? 0.5,
      clampRadius: cameraSettings?.motionBlurClamp ?? 60,
      smoothWindow: cameraSettings?.motionBlurSmoothWindow ?? 6,
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
    boundaryState,
    // clipFadeOpacity and useParentFade removed - each renderer calculates its own
  }), [
    layout,
    zoomTransform,
    outerTransform,
    has3DTransform,
    effectiveBlurPx,
    isMotionBlurActive,
    velocity,
    motionBlurIntensity,
    cameraSettings,
    motionBlurConfig.velocityThreshold,
    activeClipData,
    resolvedClipData,
    prevFrameClipData,
    frameLayout,
    activeLayoutItem,
    prevLayoutItem,
    nextLayoutItem,
    videoWidth,
    videoHeight,
    effects,
    boundaryState
  ]);

  // If no active content, render children (overlays) or empty container
  // SCRUBBING SAFETY: During scrubbing, use cached content to prevent black screen
  // ZOOM SAFETY: Don't show black screen while zooming - video may still be resolving
  const isZooming = ((zoomTransform as any)?.scale ?? 1) > 1.01;
  if (!resolvedClipData && !shouldHoldPrevFrame && !shouldHoldNextFrame && !isZooming) {
    // During scrubbing, show last known good content instead of black screen
    if (isScrubbing && lastValidContentRef.current) {
      return (
        <AbsoluteFill>
          <VideoPositionProvider value={videoPositionContextValue}>
            <AbsoluteFill>
              <div
                data-video-transform-container="true"
                data-scrubbing-fallback="true"
                style={{
                  position: 'absolute',
                  left: layout.mockupEnabled ? 0 : layout.offsetX,
                  top: layout.mockupEnabled ? 0 : layout.offsetY,
                  width: layout.mockupEnabled ? '100%' : layout.drawWidth,
                  height: layout.mockupEnabled ? '100%' : layout.drawHeight,
                  transform: outerTransform,
                  transformOrigin: 'center center',
                  willChange: 'transform',
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    clipPath: layout.mockupEnabled ? undefined : cropClipPath,
                    borderRadius: layout.mockupEnabled ? undefined : layout.cornerRadius,
                    overflow: (cropClipPath || layout.cornerRadius > 0) ? 'hidden' : undefined,
                    isolation: 'isolate',
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    {lastValidContentRef.current}
                  </div>
                </div>
              </div>
            </AbsoluteFill>
            {children}
          </VideoPositionProvider>
        </AbsoluteFill>
      );
    }
    // Not scrubbing or no cached content - show black fallback
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
            data-video-transform-container="true"
            style={{
              position: 'absolute',
              left: layout.mockupEnabled ? 0 : layout.offsetX,
              top: layout.mockupEnabled ? 0 : layout.offsetY,
              width: layout.mockupEnabled ? '100%' : layout.drawWidth,
              height: layout.mockupEnabled ? '100%' : layout.drawHeight,
              transform: outerTransform,
              transformOrigin: 'center center',
              // Opacity now handled per-clip by VideoClipRenderer via useClipRenderState
              // OUTER CONTAINER: Handles positioning, transforms
              // Shadows are now handled by the inner container for performance
              // NOTE: Refocus blur is now handled by WebGL (MotionBlurCanvas) for performance
              willChange: isRendering ? undefined : 'transform',
              zIndex: 1,
              // GPU OPTIMIZATION: These hints help browser allocate proper GPU textures
              // for 3D-transformed elements, preventing blur/quality degradation
              transformStyle: has3DTransform ? 'preserve-3d' : undefined,
              backfaceVisibility: has3DTransform ? 'hidden' : undefined,
            }}
          >
            {/* INNER CONTAINER: Handles CLIPPING (Border Radius, Crop) */}
            {/* This clips the video content but NOT the shadow (which is on the parent) */}
            <div
              style={{
                width: '100%',
                height: '100%',
                clipPath: layout.mockupEnabled ? undefined : cropClipPath,
                borderRadius: layout.mockupEnabled ? undefined : layout.cornerRadius,
                overflow: (cropClipPath || layout.cornerRadius > 0) ? 'hidden' : undefined,
                // Ensure border-radius clips children (like video)
                isolation: 'isolate',
                // PERF: Use box-shadow instead of filter: drop-shadow for significantly better performance
                // box-shadow is optimized by the browser/OS compositor, whereas filter requires an intermediate texture pass.
                boxShadow: (!layout.mockupEnabled && layout.shadowIntensity > 0)
                  ? `0px 10px ${layout.shadowIntensity * 0.5}px rgba(0,0,0,${Math.min(0.6, layout.shadowIntensity / 100)})`
                  : undefined,
              }}
            >
              {/* Video content container */}
              <div ref={videoContainerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
                {layout.mockupEnabled && layout.mockupData && layout.mockupPosition ? (
                  <MockupLayer>
                    {renderedContent}
                  </MockupLayer>
                ) : (
                  renderedContent
                )}
              </div>
            </div>

            {/* Debug Overlay - Independent visual guide if needed */}
          </div>

          {/* Preview Guides */}
          {isPreview && (
            <PreviewGuides />
          )}
        </AbsoluteFill>

        {/* Overlays */}
        {/* Render annotations above all other overlays (webcam, cursor, subtitles, etc.). */}
        {/* Previously this lived inside the transformed video container, which created a stacking context and prevented */}
        {/* annotations from appearing above composition-level overlays even with a high z-index. */}
        {!renderSettings.isGlowMode && (
          <AbsoluteFill
            data-annotation-overlay-root="true"
            style={{
              // PERF: Do NOT apply blur to the annotation overlay.
              // Blurring a full-screen DOM layer during zoom transitions forces large offscreen
              // rasterization passes and spikes GPU memory/CPU, especially with many annotations.
              // Video blur remains applied on the video transform container.
              // Above cursor (200), keystrokes (150), webcam (20), subtitles (60), etc.
              zIndex: 300,
            }}
          >
            {/* Render annotations in a video-bounds container to avoid transforming a full-screen layer. */}
            <div
              style={{
                position: 'absolute',
                left: layout.offsetX,
                top: layout.offsetY,
                width: layout.drawWidth,
                height: layout.drawHeight,
                transform: outerTransform,
                transformOrigin: 'center center',
                // Opacity handled per-clip by renderer
                willChange: isRendering ? undefined : 'transform',
                transformStyle: has3DTransform ? 'preserve-3d' : undefined,
                backfaceVisibility: has3DTransform ? 'hidden' : undefined,
              }}
            >
              <AnnotationLayer />
            </div>
          </AbsoluteFill>
        )}
        {children}
      </VideoPositionProvider>
    </AbsoluteFill>
  );
};
