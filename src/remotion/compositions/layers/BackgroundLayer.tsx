import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { BackgroundEffectData } from '@/types/project';
import type { BackgroundLayerProps } from '@/types';
import { BackgroundType } from '@/types/project';
import { useClipContext } from '../../context/ClipContext';
import { interpolateMousePositionNormalized } from '@/lib/effects/utils/mouse-interpolation';
import { ParallaxBackgroundLayer } from './ParallaxBackgroundLayer';
import { DEFAULT_PARALLAX_LAYERS } from '@/lib/constants/default-effects';

/**
 * BATTERY OPTIMIZATION: Static background component that doesn't use useCurrentFrame.
 * This prevents 30-60fps re-renders for backgrounds that don't need frame data.
 */
const StaticBackgroundLayer: React.FC<{
  backgroundData: BackgroundEffectData;
}> = React.memo(({ backgroundData }) => {
  let backgroundStyle: React.CSSProperties = {};

  switch (backgroundData.type) {
    case BackgroundType.Wallpaper:
      // Wallpaper type must render gradient (wallpaper is optional enhancement)
      if (backgroundData.gradient?.colors?.length) {
        const { colors, angle = 135 } = backgroundData.gradient;
        const gradientColors = colors.map((color, index) => {
          const percentage = (index / (colors.length - 1)) * 100;
          return `${color} ${percentage}%`;
        }).join(', ');
        backgroundStyle = {
          background: `linear-gradient(${angle}deg, ${gradientColors})`
        };

        // Layer wallpaper on top if available
        if (backgroundData.wallpaper) {
          backgroundStyle = {
            backgroundImage: `url(${backgroundData.wallpaper})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          };
        }
      }
      break;

    case BackgroundType.Color:
      backgroundStyle = {
        backgroundColor: backgroundData.color || '#000000'
      };
      break;

    case BackgroundType.Gradient:
      if (!backgroundData.gradient?.colors?.length) return null;
      const { colors, angle = 135 } = backgroundData.gradient;
      const gradientColors = colors.map((color, index) => {
        const percentage = (index / (colors.length - 1)) * 100;
        return `${color} ${percentage}%`;
      }).join(', ');
      backgroundStyle = {
        background: `linear-gradient(${angle}deg, ${gradientColors})`
      };
      break;

    case BackgroundType.Image:
      if (!backgroundData.image) return null;
      backgroundStyle = {
        backgroundImage: `url(${backgroundData.image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      };
      break;

    case BackgroundType.None:
      return null;

    default:
      return null;
  }

  // Apply blur for image-based backgrounds
  if (backgroundData.blur && backgroundData.blur > 0 && (backgroundData.type === BackgroundType.Wallpaper || backgroundData.type === BackgroundType.Image)) {
    backgroundStyle.filter = `blur(${backgroundData.blur}px)`;
  }

  return <AbsoluteFill style={{ ...backgroundStyle, zIndex: 5, pointerEvents: 'none' }} />;
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
    : DEFAULT_PARALLAX_LAYERS;

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
