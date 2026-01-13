// Screen effect preset enum
export enum ScreenEffectPreset {
  Subtle = 'subtle',
  Medium = 'medium',
  Dramatic = 'dramatic',
  Window = 'window',
  Cinematic = 'cinematic',
  Hero = 'hero',
  Isometric = 'isometric',
  Flat = 'flat',
  TiltLeft = 'tilt-left',
  TiltRight = 'tilt-right',
  TableView = 'table-view',
  Showcase = 'showcase',
  FloatingCard = 'floating-card'
}

export interface ScreenEffectData {
  // Simple preset selector; actual parameters derived by renderer
  preset: ScreenEffectPreset;
  // Optional fine-tune overrides
  tiltX?: number;
  tiltY?: number;
  perspective?: number;
  // Optional easing durations for tilt intro/outro (ms)
  introMs?: number;
  outroMs?: number;
}
