// Cursor style enum (kept for backward compatibility)
export enum CursorStyle {
  Default = 'default',
  MacOS = 'macOS',
  Custom = 'custom'
}

// Cursor theme enum for cursor appearance selection
export enum CursorTheme {
  Default = 'default',  // macOS-style cursors
  Tahoe = 'tahoe',      // Tahoe cursors
  TahoeNoTail = 'tahoe-notail'  // Tahoe cursors without tail
}

export type ClickEffectStyle = 'ripple' | 'ripple-text' | 'text' | 'none';
export type ClickEffectAnimation = 'expand' | 'pulse';
export type ClickTextMode = 'random' | 'sequence' | 'single';
export type ClickTextAnimation = 'float' | 'pop';

// Cursor motion presets for smooth movement
export type CursorMotionPreset = 'cinematic' | 'smooth' | 'balanced' | 'responsive' | 'custom';

export interface CursorEffectData {
  style: CursorStyle;
  /** Cursor theme for appearance selection (default: macOS-style) */
  theme?: CursorTheme;
  size: number;
  color: string;
  clickEffects: boolean;
  clickEffectStyle?: ClickEffectStyle;
  clickEffectAnimation?: ClickEffectAnimation;
  clickEffectDurationMs?: number;
  clickEffectMaxRadius?: number;
  clickEffectLineWidth?: number;
  clickEffectColor?: string;
  clickTextWords?: string[];
  clickTextMode?: ClickTextMode;
  clickTextAnimation?: ClickTextAnimation;
  clickTextSize?: number;
  clickTextColor?: string;
  clickTextOffsetY?: number;
  clickTextRise?: number;
  motionBlur: boolean;
  /**
   * Intensity of cursor motion blur (0-100). Optional for backward compatibility.
   */
  motionBlurIntensity?: number;
  /**
   * Adds a slight rotation ("bank") in the direction of cursor travel.
   * Optional for backward compatibility with existing projects.
   */
  directionalTilt?: boolean;
  /**
   * Maximum rotation amount in degrees when the cursor is moving fast.
   * Optional for backward compatibility with existing projects.
   */
  directionalTiltMaxDeg?: number;
  hideOnIdle: boolean;
  fadeOnIdle: boolean;
  idleTimeout: number;
  gliding: boolean;
  speed: number;
  smoothness: number;
  /**
   * Extra inertia for cursor gliding (0 = most responsive, 1 = most "icy"/laggy).
   * Optional for backward compatibility with existing projects.
   */
  glide?: number;
  /**
   * Multiplier for the smoothing jump threshold relative to capture diagonal.
   * Higher = fewer hard resets on fast movement.
   */
  smoothingJumpThreshold?: number;
  /**
   * Motion preset for cursor smoothing (cinematic, smooth, balanced, responsive, custom).
   * When set to anything other than 'custom', speed/smoothness/glide are derived from preset.
   */
  motionPreset?: CursorMotionPreset;
}
