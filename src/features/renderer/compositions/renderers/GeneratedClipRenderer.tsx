/**
 * GeneratedClipRenderer.tsx
 *
 * Renders plugin-generated clips (e.g., blank clips, animated backgrounds).
 * Delegates rendering to a registered plugin from the PluginRegistry.
 */
import React from 'react';
import { Sequence } from 'remotion';
import { useClipRenderState } from '@/features/renderer/hooks/render/useClipRenderState';
import { PluginRegistry } from '@/features/effects/config/plugin-registry';
import type { PluginFrameContext, PluginRenderProps } from '@/features/effects/config/plugin-sdk';
import type { Clip, Recording } from '@/types/project';
import { assertDefined } from '@/shared/errors';
import { useVideoPosition } from '@/features/renderer/context/layout/VideoPositionContext';

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
  compositionWidth: number;
  compositionHeight: number;
}

export const GeneratedClipRenderer: React.FC<GeneratedClipRendererProps> = ({
  clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
  currentFrame, fps, isRendering, compositionWidth, compositionHeight,
}) => {
  // Shared render state (timing, fades, opacity, scaling)
  const renderState = useClipRenderState({
    clip: clipForVideo, recording, startFrame, durationFrames, groupStartFrame, groupDuration,
    currentFrame, fps, isRendering
  });
  const { useParentFade } = useVideoPosition();
  const visualOpacity = useParentFade ? 1 : renderState.effectiveOpacity;

  // Plugin lookup
  const generatedPluginId = assertDefined(
    recording.generatedSource?.pluginId,
    '[GeneratedClipRenderer] Missing generated plugin id'
  );
  const generatedPlugin = assertDefined(
    PluginRegistry.get(generatedPluginId),
    `[GeneratedClipRenderer] Plugin not found: ${generatedPluginId}`
  );

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

  const generatedContent = generatedPlugin.render(renderProps);

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
        opacity: visualOpacity,
      }}>
        {generatedContent}
      </div>
    </Sequence>
  );
};
