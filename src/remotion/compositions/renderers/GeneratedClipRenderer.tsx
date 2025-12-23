/**
 * GeneratedClipRenderer.tsx
 *
 * Renders plugin-generated clips (e.g., blank clips, animated backgrounds)
 * within a Remotion composition. Unlike VideoClipRenderer, this component
 * does not load video files - instead it delegates rendering to a registered
 * plugin from the PluginRegistry.
 *
 * Key responsibilities:
 * - Looks up the plugin by ID and invokes its render method
 * - Wraps generated content in a Remotion Sequence for proper timing
 * - Handles fade-in/out transitions and glow mode crossfades
 * - Scales plugin output to match the target draw dimensions
 *
 * @see VideoClipRenderer for video-based clip rendering
 * @see PluginRegistry for plugin registration and lookup
 */
import React from 'react';
import { Sequence } from 'remotion';
import type { GeneratedClipRendererProps } from '@/types';
import { PluginRegistry } from '@/lib/effects/config/plugin-registry';
import type { PluginFrameContext, PluginRenderProps } from '@/lib/effects/config/plugin-sdk';
import {
  calculateClipFadeDurations,
  calculateClipFadeOpacity,
  calculateGlowCrossfadeOpacity,
} from '../utils/clip-fade';

// ============================================================================
// COMPONENT
// ============================================================================
export const GeneratedClipRenderer: React.FC<GeneratedClipRendererProps> = ({
  clipForVideo,
  recording,
  startFrame,
  durationFrames,
  groupStartFrame,
  groupDuration,
  currentFrame,
  fps,
  isRendering,
  drawWidth,
  drawHeight,
  compositionWidth,
  compositionHeight,
  activeLayoutItem,
  prevLayoutItem,
  nextLayoutItem,
  shouldHoldPrevFrame,
  isNearBoundaryEnd,
  overlapFrames,
  // New Config Object
  renderSettings,
}) => {
  // Destructure config objects
  const { isGlowMode } = renderSettings;

  // ==========================================================================
  // PLUGIN LOOKUP
  // ==========================================================================
  const generatedPluginId = recording.generatedSource?.pluginId;
  const generatedPlugin = generatedPluginId ? PluginRegistry.get(generatedPluginId) : null;

  if (!generatedPlugin) {
    console.warn('[GeneratedClipRenderer] ⚠️ Plugin not found:', generatedPluginId);
    return null;
  }

  // ==========================================================================
  // SEQUENCE TIMING CALCULATIONS
  // ==========================================================================
  // Group-based rendering uses the parent group's start frame for stability
  const currentClipEndFrame = startFrame + durationFrames;
  const durationFromGroupStart = currentClipEndFrame - groupStartFrame;

  // Determine if this clip should hold its last frame during transitions
  const isHoldPrevClip = !isRendering && shouldHoldPrevFrame && prevLayoutItem?.clip.id === clipForVideo.id;
  const isHoldActiveClipAtEnd = !isRendering && isNearBoundaryEnd && activeLayoutItem?.clip.id === clipForVideo.id;
  const isHoldClip = isHoldPrevClip || isHoldActiveClipAtEnd;

  // Calculate gap between this clip and the next (for extending duration)
  const gapFrames = nextLayoutItem ? Math.max(0, nextLayoutItem.startFrame - currentClipEndFrame) : 0;
  const finalDuration = Math.max(groupDuration, durationFromGroupStart + (isHoldClip ? overlapFrames : gapFrames));

  // Calculate local frame position (clamped for hold mode)
  const localFrameRaw = currentFrame - startFrame;
  const localFrame = isHoldClip ? Math.min(localFrameRaw, durationFrames - 1) : localFrameRaw;

  // ==========================================================================
  // FADE & CROSSFADE CALCULATIONS
  // ==========================================================================
  // Don't apply fade if clips are contiguous (same group)
  const isNextContiguous = nextLayoutItem && nextLayoutItem.groupId === activeLayoutItem?.groupId;
  const isPrevContiguous = prevLayoutItem && prevLayoutItem.groupId === activeLayoutItem?.groupId;

  // Glow mode intro/outro triggers
  const wantsGlowIntro = isGlowMode && (
    (clipForVideo.id === activeLayoutItem?.clip.id && shouldHoldPrevFrame && !isPrevContiguous) ||
    (clipForVideo.id === nextLayoutItem?.clip.id && !isNextContiguous)
  );
  const wantsGlowOutro = isGlowMode && (
    (clipForVideo.id === activeLayoutItem?.clip.id && isNearBoundaryEnd && !isNextContiguous) ||
    (clipForVideo.id === prevLayoutItem?.clip.id && !isPrevContiguous)
  );

  const { introFadeDuration, outroFadeDuration } = calculateClipFadeDurations(
    clipForVideo, fps, isGlowMode, wantsGlowIntro, wantsGlowOutro
  );

  const fadeOpacity = calculateClipFadeOpacity({ localFrame, durationFrames, introFadeDuration, outroFadeDuration });
  const glowOpacityOverride = calculateGlowCrossfadeOpacity({
    isGlowMode, clipId: clipForVideo.id, currentFrame, fps, shouldHoldPrevFrame,
    isNearBoundaryEnd, prevLayoutItem, activeLayoutItem, nextLayoutItem,
  });

  // ==========================================================================
  // OPACITY CALCULATION
  // ==========================================================================
  const needsFade = introFadeDuration > 0 || outroFadeDuration > 0;
  const isPreloading = currentFrame < startFrame;
  const effectiveOpacity = isPreloading
    ? 0
    : (glowOpacityOverride ?? (needsFade ? fadeOpacity : 1));

  // ==========================================================================
  // PLUGIN RENDERING
  // ==========================================================================
  const renderWidth = recording.width || compositionWidth;
  const renderHeight = recording.height || compositionHeight;
  const clampedFrame = Math.max(0, Math.min(localFrame, durationFrames - 1));
  const progress = durationFrames > 1 ? clampedFrame / Math.max(1, durationFrames - 1) : 0;

  // Build frame context for plugin
  const frameContext: PluginFrameContext = {
    frame: clampedFrame,
    fps,
    progress,
    durationFrames,
    width: renderWidth,
    height: renderHeight,
  };

  // Build render props for plugin
  const renderProps: PluginRenderProps = {
    params: recording.generatedSource?.params ?? {},
    frame: frameContext,
    width: renderWidth,
    height: renderHeight,
  };

  // Invoke plugin render with error handling
  let generatedContent: React.ReactNode = null;
  try {
    generatedContent = generatedPlugin.render(renderProps);
  } catch (err) {
    console.error(`[SharedVideoController] Generated clip render error for plugin "${generatedPluginId}":`, err);
  }

  // ==========================================================================
  // SCALING
  // ==========================================================================
  // Scale plugin output to match target draw dimensions
  const baseWidth = recording.width || drawWidth;
  const baseHeight = recording.height || drawHeight;
  const scaleX = baseWidth > 0 ? drawWidth / baseWidth : 1;
  const scaleY = baseHeight > 0 ? drawHeight / baseHeight : 1;

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <Sequence from={groupStartFrame} durationInFrames={finalDuration}>
      <div style={{
        width: baseWidth,
        height: baseHeight,
        transform: `scale(${scaleX}, ${scaleY})`,
        transformOrigin: '0 0',
        position: 'absolute',
        top: 0,
        left: 0,
        opacity: effectiveOpacity,
      }}>
        {generatedContent}
      </div>
    </Sequence>
  );
};
