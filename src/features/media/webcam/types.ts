import { OverlayAnchor } from '@/types/overlays';
import { type CropEffectData as CropData } from '@/features/effects/crop/types';

// Webcam shape options
export type WebcamShape = 'circle' | 'rounded-rect' | 'squircle' | 'rectangle';

// Webcam position anchor points - unified with OverlayAnchor
export type WebcamAnchor = OverlayAnchor;

// Webcam animation types
export type WebcamEntryAnimation = 'none' | 'fade' | 'scale' | 'slide' | 'bounce';
export type WebcamExitAnimation = 'none' | 'fade' | 'scale';
export type WebcamPipAnimation = 'none' | 'float' | 'breathe';

export interface WebcamLayoutData {
  // Position & Size
  position: {
    x: number;  // 0-100 percentage of canvas width
    y: number;  // 0-100 percentage of canvas height
    anchor: WebcamAnchor;
  };
  size: number;  // 5-50 percentage of canvas width
  padding: number;  // Edge padding in pixels (distance from canvas edge)

  // Shape
  shape: WebcamShape;
  cornerRadius: number;  // 0-50 pixels for rounded-rect/squircle

  // Border
  borderEnabled: boolean;
  borderWidth: number;  // 0-10 pixels
  borderColor: string;
  borderGradient?: {
    colors: string[];
    angle: number;
  };

  // Shadow
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;  // 0-50 pixels
  shadowOffsetX: number;
  shadowOffsetY: number;

  // Background blur (webcam background only, not video content)
  backgroundBlur: boolean;
  backgroundBlurAmount: number;  // 0-20 pixels

  // Animations
  animations: {
    entry: {
      type: WebcamEntryAnimation;
      durationMs: number;
      from?: number;  // Scale/opacity start value
    };
    exit: {
      type: WebcamExitAnimation;
      durationMs: number;
    };
    pip: {
      type: WebcamPipAnimation;
      amplitude?: number;  // For float/breathe
      period?: number;  // Animation cycle in ms
    };
  };

  // Mirror/flip the webcam horizontally (common preference)
  mirror: boolean;

  // Opacity (0-1)
  opacity: number;

  // Reduce opacity when zoomed in (to keep focus on content)
  reduceOpacityOnZoom?: boolean;
  zoomInfluence?: number; // 0 to 1, how much the webcam resists camera zoom (scale inversely)

  // Crop the webcam source (0-1 normalized)
  sourceCrop?: CropData;
}
