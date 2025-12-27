import type { BackgroundEffectData, CursorEffectData, CursorMotionPreset, KeystrokeEffectData, ParallaxLayer, ScreenEffectData, ZoomEffectData, WebcamEffectData } from '@/types/project'
import { BackgroundType, CursorStyle, KeystrokePosition, ScreenEffectPreset, ZoomFollowStrategy } from '@/types/project'
import { DEFAULT_CROP_DATA } from '@/remotion/compositions/utils/transforms/crop-transform'

// Re-export schema helpers for gradual migration
export { getEffectDefaults, getEffectSchema, getParamConstraints } from '@/lib/effects/config/effect-schemas'


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
  padding: 60,
  cornerRadius: 15,
  shadowIntensity: 85,
  parallaxLayers: DEFAULT_PARALLAX_LAYERS,
  blur: 0,
  parallaxIntensity: 50
}

// Default zoom data
export const DEFAULT_ZOOM_DATA: ZoomEffectData = {
  origin: 'manual',
  scale: 2.0,
  introMs: 500,
  outroMs: 500,
  smoothing: 50,
  followStrategy: ZoomFollowStrategy.Mouse,
  mouseIdlePx: 3
}

// Default screen effect data
export const DEFAULT_SCREEN_DATA: ScreenEffectData = {
  preset: ScreenEffectPreset.Subtle,
  introMs: 300,
  outroMs: 300
}

// Default screen effect presets
export const SCREEN_EFFECT_PRESETS: Record<string, { tiltX: number; tiltY: number; perspective: number }> = {
  [ScreenEffectPreset.Subtle]: { tiltX: -2, tiltY: 4, perspective: 1000 },
  [ScreenEffectPreset.Medium]: { tiltX: -4, tiltY: 8, perspective: 900 },
  [ScreenEffectPreset.Dramatic]: { tiltX: -8, tiltY: 14, perspective: 800 },
  [ScreenEffectPreset.Window]: { tiltX: -3, tiltY: 12, perspective: 700 },
  [ScreenEffectPreset.Cinematic]: { tiltX: -5, tiltY: 10, perspective: 850 },
  [ScreenEffectPreset.Hero]: { tiltX: -10, tiltY: 16, perspective: 760 },
  [ScreenEffectPreset.Isometric]: { tiltX: -25, tiltY: 25, perspective: 950 },
  [ScreenEffectPreset.Flat]: { tiltX: 0, tiltY: 0, perspective: 1200 },
  [ScreenEffectPreset.TiltLeft]: { tiltX: -6, tiltY: -10, perspective: 900 },
  [ScreenEffectPreset.TiltRight]: { tiltX: -6, tiltY: 10, perspective: 900 }
}

// Cursor motion presets - maps preset name to speed/smoothness/glide values
export const CURSOR_MOTION_PRESETS: Record<Exclude<CursorMotionPreset, 'custom'>, { speed: number; smoothness: number; glide: number }> = {
  cinematic: { speed: 0.01, smoothness: 1.0, glide: 1.0 },    // Ultra-smooth, maximum lag - like Screen Studio
  smooth: { speed: 0.05, smoothness: 0.9, glide: 0.85 },      // Very smooth, slight response
  balanced: { speed: 0.15, smoothness: 0.7, glide: 0.6 },     // Middle ground
  responsive: { speed: 0.5, smoothness: 0.4, glide: 0.3 }     // Snappy, tight following
}

// Default cursor effect data
export const DEFAULT_CURSOR_DATA: CursorEffectData = {
  style: CursorStyle.MacOS,
  size: 4.0,
  color: '#ffffff',
  clickEffects: true,
  clickEffectStyle: 'none',
  clickEffectAnimation: 'expand',
  clickEffectDurationMs: 300,
  clickEffectMaxRadius: 50,
  clickEffectLineWidth: 2,
  clickEffectColor: '#ffffff',
  clickTextWords: ['click!'],
  clickTextMode: 'random',
  clickTextAnimation: 'float',
  clickTextSize: 16,
  clickTextColor: '#ffffff',
  clickTextOffsetY: -12,
  clickTextRise: 24,
  motionBlur: true,
  motionBlurIntensity: 40,
  directionalTilt: true,
  directionalTiltMaxDeg: 10,
  hideOnIdle: true,
  fadeOnIdle: true,
  idleTimeout: 3000,
  gliding: true,
  // Motion preset controls cursor smoothing behavior
  motionPreset: 'cinematic',
  // Values derived from cinematic preset - ultra-smooth like Screen Studio
  speed: 0.01,
  smoothness: 1.0,
  glide: 1.0,
  smoothingJumpThreshold: 0.9
}

// Default keystroke effect data
export const DEFAULT_KEYSTROKE_DATA: KeystrokeEffectData = {
  fontSize: 18,
  fontFamily: 'SF Pro Display, system-ui, -apple-system, sans-serif',
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  textColor: '#ffffff',
  borderColor: 'rgba(255, 255, 255, 0.15)',
  borderRadius: 15,
  padding: 8,
  fadeOutDuration: 400,
  displayDuration: 2000,
  position: KeystrokePosition.BottomCenter,
  maxWidth: 400,
  stylePreset: 'glass',
  showModifierSymbols: true,
  scale: 1
}

// Default webcam effect data - Apple-quality PiP styling
export const DEFAULT_WEBCAM_DATA: WebcamEffectData = {
  // Position anchored to bottom-right, padding controls edge distance
  position: {
    x: 100,
    y: 100,
    anchor: 'bottom-right'
  },
  size: 18, // 18% of canvas width - compact but visible
  padding: 24, // Edge padding in pixels

  // Squircle shape for clean, modern Apple-esque look
  shape: 'squircle',
  cornerRadius: 40, // Larger radius for smoother squircle

  // No border by default for cleaner appearance
  borderEnabled: false,
  borderWidth: 3,
  borderColor: '#ffffff',

  // Soft shadow for depth
  shadowEnabled: true,
  shadowColor: 'rgba(0, 0, 0, 0.25)',
  shadowBlur: 24,
  shadowOffsetX: 0,
  shadowOffsetY: 8,

  // No background blur by default
  backgroundBlur: false,
  backgroundBlurAmount: 10,

  // No animations by default - cleaner experience
  animations: {
    entry: {
      type: 'none',
      durationMs: 0
    },
    exit: {
      type: 'none',
      durationMs: 0
    },
    pip: {
      type: 'none'
    }
  },

  // Mirror by default (natural for webcam)
  mirror: true,

  // Full opacity
  opacity: 1.0,

  // Reduce opacity when zoomed in
  reduceOpacityOnZoom: false,

  // No crop by default (full frame)
  sourceCrop: DEFAULT_CROP_DATA
}

// Webcam shape presets for quick selection
export const WEBCAM_SHAPE_PRESETS = {
  circle: { shape: 'circle' as const, cornerRadius: 0 },
  'rounded-rect': { shape: 'rounded-rect' as const, cornerRadius: 16 },
  squircle: { shape: 'squircle' as const, cornerRadius: 32 },
  rectangle: { shape: 'rectangle' as const, cornerRadius: 0 }
}

// Webcam position presets (percentage-based)
export const WEBCAM_POSITION_PRESETS = {
  'top-left': { x: 6, y: 6, anchor: 'top-left' as const },
  'top-center': { x: 50, y: 6, anchor: 'top-center' as const },
  'top-right': { x: 94, y: 6, anchor: 'top-right' as const },
  'center-left': { x: 6, y: 50, anchor: 'center-left' as const },
  'center': { x: 50, y: 50, anchor: 'center' as const },
  'center-right': { x: 94, y: 50, anchor: 'center-right' as const },
  'bottom-left': { x: 6, y: 94, anchor: 'bottom-left' as const },
  'bottom-center': { x: 50, y: 94, anchor: 'bottom-center' as const },
  'bottom-right': { x: 94, y: 94, anchor: 'bottom-right' as const }
}

// Store for default wallpaper once loaded
let defaultWallpaper: string | undefined = undefined
let wallpaperInitialized = false

export function setDefaultWallpaper(wallpaper: string) {
  defaultWallpaper = wallpaper
  DEFAULT_BACKGROUND_DATA.wallpaper = wallpaper
}

export function getDefaultWallpaper(): string | undefined {
  return defaultWallpaper
}

// Initialize default wallpaper on app startup
export async function initializeDefaultWallpaper() {
  // Skip if already initialized
  if (wallpaperInitialized) {
    return
  }

  wallpaperInitialized = true

  if (typeof window === 'undefined' || !window.electronAPI?.loadWallpaperImage) {
    return
  }

  try {
    const dataUrl = await window.electronAPI.loadWallpaperImage('/System/Library/Desktop Pictures/Sonoma.heic')
    if (dataUrl) {
      setDefaultWallpaper(dataUrl)
    }
  } catch (error) {
    // Silently fail - will use gradient background
  }
}
