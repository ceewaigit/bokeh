import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { BackgroundEffectData } from '@/types/project';
import type { BackgroundLayerProps } from '@/types';
import { BackgroundType } from '@/types/project';
import { useClipContext } from '../context/ClipContext';
import { interpolateMousePositionNormalized } from '@/lib/effects/utils/mouse-interpolation';
import { ParallaxBackgroundLayer } from './ParallaxBackgroundLayer';
import { DEFAULT_PARALLAX_LAYERS } from '@/lib/constants/default-effects';

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  backgroundEffect,
  videoWidth,
  videoHeight
}) => {
  const backgroundData = backgroundEffect?.data as BackgroundEffectData | undefined;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Get clip context for mouse events - this component is always rendered inside ClipProvider
  const { cursorEvents, clip } = useClipContext();

  if (!backgroundData?.type) {
    return null;
  }

  // Handle Parallax type separately with its own component
  if (backgroundData.type === BackgroundType.Parallax) {
    // Calculate current source time for mouse interpolation
    // frame is relative to the Sequence start (clip start), not timeline
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
  }

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
          // We'll need to return a more complex structure for layered backgrounds
          // For now, just use wallpaper when available
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
};
