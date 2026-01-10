import { DeviceMockupData } from '../mockups/types';

// Background type enum
export enum BackgroundType {
  None = 'none',
  Color = 'color',
  Gradient = 'gradient',
  Image = 'image',
  Wallpaper = 'wallpaper',
  Parallax = 'parallax'
}

// Parallax layer definition
export interface ParallaxLayer {
  image: string;      // Path or URL to the layer image
  factor: number;     // Movement sensitivity (smaller = more movement)
  zIndex: number;     // Visual stacking order
}

export interface BackgroundEffectData {
  type: BackgroundType;
  color?: string;
  gradient?: {
    colors: string[];
    angle: number;
  };
  image?: string;
  wallpaper?: string;
  /** Identifier for the selected wallpaper source (typically a path/absolutePath). */
  wallpaperKey?: string;
  blur?: number;
  padding: number;
  cornerRadius?: number;  // Video corner radius in pixels
  shadowIntensity?: number;  // Shadow intensity 0-100
  parallaxLayers?: ParallaxLayer[];  // Layers for parallax background
  parallaxIntensity?: number;  // Movement intensity 0-100 (default 50)
  /** Device mockup settings (per-clip) */
  mockup?: DeviceMockupData;
}
