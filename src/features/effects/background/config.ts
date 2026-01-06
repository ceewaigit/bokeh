import type { BackgroundEffectData, ParallaxLayer } from '@/types/project'
import { BackgroundType } from '@/types/project'

// Default parallax layers (hill images with depth-based factors)
// Smaller factor = more movement (foreground), larger factor = less movement (background)
export const DEFAULT_PARALLAX_LAYERS: ParallaxLayer[] = [
    { image: '/parallax/hill/6.png', factor: 50, zIndex: 1 },  // Farthest background
    { image: '/parallax/hill/5.png', factor: 40, zIndex: 2 },
    { image: '/parallax/hill/4.png', factor: 30, zIndex: 3 },
    { image: '/parallax/hill/3.png', factor: 20, zIndex: 4 },
    { image: '/parallax/hill/2.png', factor: 10, zIndex: 5 },  // Closest foreground
]

// Default background effect data
export const DEFAULT_BACKGROUND_DATA: BackgroundEffectData = {
    type: BackgroundType.Wallpaper,
    gradient: {
        colors: ['#2D3748', '#1A202C'],
        angle: 135
    },
    wallpaper: undefined,
    padding: 120,
    cornerRadius: 30,
    shadowIntensity: 90,
    parallaxLayers: DEFAULT_PARALLAX_LAYERS,
    blur: 0,
    parallaxIntensity: 50
}
