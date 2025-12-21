/**
 * Parallax Background Layer - Multi-layer parallax effect
 * 
 * Renders multiple layered images with depth-based movement
 * following the recorded mouse position for natural parallax effect.
 */

import React from 'react';
import { AbsoluteFill, getRemotionEnvironment, staticFile } from 'remotion';
import type { ParallaxBackgroundLayerProps } from '@/types';
import { getElectronAssetUrl } from '@/lib/assets/electron-asset-url';

/**
 * ParallaxBackgroundLayer
 * 
 * Renders layered parallax background with depth-based movement.
 * Each layer moves based on its factor - smaller factor = more movement (foreground),
 * larger factor = less movement (background).
 */
export const ParallaxBackgroundLayer: React.FC<ParallaxBackgroundLayerProps> = ({
    layers,
    mouseX,
    mouseY,
    intensity,
}) => {
    const { isRendering } = getRemotionEnvironment();

    // Convert normalized mouse (0-1) to centered offset (-0.5 to 0.5)
    // Scale by intensity (0-100 -> 0-2x multiplier, with 50 being 1x)
    const intensityMultiplier = intensity / 50; // 0=0x, 50=1x, 100=2x
    const offsetX = (mouseX - 0.5) * 300 * intensityMultiplier;
    const offsetY = (mouseY - 0.5) * 200 * intensityMultiplier;

    // Sort layers by zIndex to ensure proper stacking
    const sortedLayers = React.useMemo(() => {
        return [...layers].sort((a, b) => a.zIndex - b.zIndex);
    }, [layers]);

    const getImageSrc = (imagePath: string) => {
        if (isRendering) {
            const withoutLeadingSlash = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
            return staticFile(withoutLeadingSlash);
        }

        return getElectronAssetUrl(imagePath);
    };

    return (
        <AbsoluteFill style={{ backgroundColor: '#1a1a2e', zIndex: 5, pointerEvents: 'none' }}>
            {/* Sky gradient background */}
            <AbsoluteFill
                style={{
                    background: 'linear-gradient(to bottom, #667eea 0%, #764ba2 50%, #1a1a2e 100%)',
                }}
            />

            {/* Parallax layers */}
            {sortedLayers.map((layer, index) => {
                // Calculate movement based on layer factor
                // Higher factor = less movement (background layers)
                // Lower factor = more movement (foreground layers)
                const moveX = offsetX / layer.factor;
                const moveY = offsetY / layer.factor;

                const imageSrc = getImageSrc(layer.image);

                return (
                    <AbsoluteFill
                        key={`parallax-layer-${index}`}
                        style={{
                            zIndex: layer.zIndex + 10,
                            transform: `translate(${moveX}px, ${moveY}px) scale(1.1)`,
                            willChange: 'transform',
                            filter: 'grayscale(40%)',
                        }}
                    >
                        <img
                            src={imageSrc}
                            alt=""
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center bottom',
                            }}
                        />
                    </AbsoluteFill>
                );
            })}
        </AbsoluteFill>
    );
};
