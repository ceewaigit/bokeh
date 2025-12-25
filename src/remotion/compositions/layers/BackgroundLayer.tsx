import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { BackgroundEffectData } from '@/types/project';
import type { BackgroundLayerProps } from '@/types';
import { BackgroundType } from '@/types/project';
import { useClipContext } from '../../context/timeline/ClipContext';
import { interpolateMousePositionNormalized } from '@/lib/effects/utils/mouse-interpolation';
import { ParallaxBackgroundLayer } from './ParallaxBackgroundLayer';
import { DEFAULT_BACKGROUND_DATA } from '@/lib/constants/default-effects';
import { calculateBackgroundStyle } from '@/lib/effects/utils/background-calculator';

/**
 * BATTERY OPTIMIZATION: Static background component that doesn't use useCurrentFrame.
 * This prevents 30-60fps re-renders for backgrounds that don't need frame data.
 */
const StaticBackgroundLayer: React.FC<{
  backgroundData: BackgroundEffectData;
}> = React.memo(({ backgroundData }) => {
  const resolvedGradient = (!backgroundData.gradient?.colors || backgroundData.gradient.colors.length === 0)
    ? DEFAULT_BACKGROUND_DATA.gradient
    : {
      ...DEFAULT_BACKGROUND_DATA.gradient,
      ...backgroundData.gradient,
      colors: backgroundData.gradient.colors
    };

  const resolvedData: BackgroundEffectData = {
    ...DEFAULT_BACKGROUND_DATA,
    ...backgroundData,
    gradient: resolvedGradient,
    parallaxLayers: backgroundData.parallaxLayers ?? DEFAULT_BACKGROUND_DATA.parallaxLayers,
  };

  const style = calculateBackgroundStyle(resolvedData, 1920, 1080);
  if (!style.cssStyle || style.type === BackgroundType.None) return null;

  return <AbsoluteFill style={{ ...style.cssStyle, zIndex: 5, pointerEvents: 'none' }} />;
});

StaticBackgroundLayer.displayName = 'StaticBackgroundLayer';

/**
 * BATTERY OPTIMIZATION: Parallax background component that needs useCurrentFrame.
 * Only this component re-renders every frame - and only when Parallax is active.
 */
const ParallaxBackgroundWrapper: React.FC<{
  backgroundData: BackgroundEffectData;
}> = ({ backgroundData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { cursorEvents, clip } = useClipContext();

  // Calculate current source time for mouse interpolation
  const frameTimeMs = (frame / fps) * 1000;
  const sourceTimeMs = (clip.sourceIn ?? 0) + frameTimeMs;

  // Get normalized mouse position (0-1)
  const mousePos = interpolateMousePositionNormalized(cursorEvents, sourceTimeMs);
  const mouseX = mousePos?.x ?? 0.5;
  const mouseY = mousePos?.y ?? 0.5;

  // Use configured layers or defaults
  const layers = backgroundData.parallaxLayers?.length
    ? backgroundData.parallaxLayers
    : DEFAULT_BACKGROUND_DATA.parallaxLayers!;

  // Get intensity (default 50)
  const intensity = backgroundData.parallaxIntensity ?? 50;

  return (
    <ParallaxBackgroundLayer
      layers={layers}
      mouseX={mouseX}
      mouseY={mouseY}
      intensity={intensity}
    />
  );
};

/**
 * Main BackgroundLayer component - delegates to optimized sub-components.
 * Static backgrounds don't re-render on frame changes (major battery savings).
 */
export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  backgroundEffect,
}) => {
  const backgroundData = backgroundEffect?.data as BackgroundEffectData | undefined;

  if (!backgroundData?.type) {
    return null;
  }

  // BATTERY OPTIMIZATION: Only Parallax needs frame-by-frame updates
  if (backgroundData.type === BackgroundType.Parallax) {
    return <ParallaxBackgroundWrapper backgroundData={backgroundData} />;
  }

  // Static backgrounds don't need useCurrentFrame - avoids 30-60fps re-renders
  return <StaticBackgroundLayer backgroundData={backgroundData} />;
};
