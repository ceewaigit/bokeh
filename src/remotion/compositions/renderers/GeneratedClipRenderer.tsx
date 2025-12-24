/**
 * GeneratedClipRenderer.tsx
 *
 * Renders plugin-generated clips (e.g., blank clips, animated backgrounds).
 * Delegates rendering to a registered plugin from the PluginRegistry.
 */
import React from 'react';
import { Sequence } from 'remotion';
import { useClipRenderState } from '@/remotion/hooks/useClipRenderState';
import { PluginRegistry } from '@/lib/effects/config/plugin-registry';
import type { PluginFrameContext, PluginRenderProps } from '@/lib/effects/config/plugin-sdk';
import type { Clip, Recording } from '@/types/project';
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';

interface GeneratedClipRendererProps {
  clipForVideo: Clip;
  recording: Recording;
  startFrame: number;
  durationFrames: number;
  groupStartFrame: number;
  groupDuration: number;
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  drawWidth: number;
  drawHeight: number;
  compositionWidth: number;
  compositionHeight: number;
  activeLayoutItem: FrameLayoutItem | null;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
  overlapFrames: number;
}

export const GeneratedClipRenderer: React.FC<GeneratedClipRendererProps> = ({
  clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
  currentFrame, fps, isRendering, drawWidth, drawHeight, compositionWidth, compositionHeight,
  activeLayoutItem, prevLayoutItem, nextLayoutItem, shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
}) => {
  // Shared render state (timing, fades, opacity, scaling)
  const renderState = useClipRenderState({
    clip: clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
    currentFrame, fps, isRendering, drawWidth, drawHeight,
    activeLayoutItem, prevLayoutItem, nextLayoutItem, shouldHoldPrevFrame, isNearBoundaryEnd, overlapFrames,
  });

  // Plugin lookup
  const generatedPluginId = recording.generatedSource?.pluginId;
  const generatedPlugin = generatedPluginId ? PluginRegistry.get(generatedPluginId) : null;

  if (!generatedPlugin) {
    console.warn('[GeneratedClipRenderer] Plugin not found:', generatedPluginId);
    return null;
  }

  // Plugin rendering
  const renderWidth = recording.width || compositionWidth;
  const renderHeight = recording.height || compositionHeight;
  const clampedFrame = Math.max(0, Math.min(renderState.localFrame, durationFrames - 1));
  const progress = durationFrames > 1 ? clampedFrame / Math.max(1, durationFrames - 1) : 0;

  const frameContext: PluginFrameContext = {
    frame: clampedFrame, fps, progress, durationFrames, width: renderWidth, height: renderHeight,
  };
  const renderProps: PluginRenderProps = {
    params: recording.generatedSource?.params ?? {}, frame: frameContext, width: renderWidth, height: renderHeight,
  };

  let generatedContent: React.ReactNode = null;
  try {
    generatedContent = generatedPlugin.render(renderProps);
  } catch (err) {
    console.error(`[GeneratedClipRenderer] Render error for plugin "${generatedPluginId}":`, err);
  }

  return (
    <Sequence from={groupStartFrame} durationInFrames={renderState.finalDuration}>
      <div style={{
        width: renderState.baseWidth,
        height: renderState.baseHeight,
        transform: renderState.scaleTransform,
        transformOrigin: '0 0',
        position: 'absolute',
        top: 0,
        left: 0,
        opacity: renderState.effectiveOpacity,
      }}>
        {generatedContent}
      </div>
    </Sequence>
  );
};
