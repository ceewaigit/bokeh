/**
 * Project format for non-destructive editing
 * Keeps original recordings separate from effects metadata
 * 
 * This file contains ONLY type definitions - no business logic
 */

// Import and re-export EffectType for convenience
import type { EffectType } from './effects'
export { EffectType } from './effects'

// Enums for various types
export enum TrackType {
  Video = 'video',
  Audio = 'audio',
  Webcam = 'webcam',
  Annotation = 'annotation'
}

// Timeline display track types (includes effect lanes)
export enum TimelineTrackType {
  Video = 'video',
  Audio = 'audio',
  Webcam = 'webcam',
  Zoom = 'zoom',
  Screen = 'screen',
  Keystroke = 'keystroke',
  Plugin = 'plugin',
  Annotation = 'annotation'
}

// Track group for collapsible sections
export interface TrackGroup {
  id: string
  name: string
  collapsed: boolean
  trackTypes: TimelineTrackType[]
}

export enum TransitionType {
  Fade = 'fade',
  Dissolve = 'dissolve',
  Wipe = 'wipe',
  Slide = 'slide'
}

export enum RecordingSourceType {
  Screen = 'screen',
  Window = 'window',
  Area = 'area'
}

// Media kind for recordings stored in the project.
export type RecordingMediaType = 'video' | 'generated' | 'image'

export enum ExportFormat {
  MP4 = 'mp4',
  MOV = 'mov',
  WEBM = 'webm',
  GIF = 'gif'
}

export enum QualityLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Ultra = 'ultra',
  Custom = 'custom'
}

// Aspect ratio presets for canvas sizing
export enum AspectRatioPreset {
  Original = 'original',
  Landscape16x9 = '16:9',
  Portrait9x16 = '9:16',
  Square1x1 = '1:1',
  Portrait4x5 = '4:5',
  Ultrawide21x9 = '21:9',
  LandingPageFeature = 'landing-feature',
  LandingPageHero = 'landing-hero',
  Custom = 'custom'
}

// Device types for mockups
export enum DeviceType {
  None = 'none',
  IPhone = 'iphone',
  IPad = 'ipad',
  MacBook = 'macbook',
  AppleWatch = 'apple-watch',
  IMac = 'imac'
}

// Specific Apple device models for mockups
export enum DeviceModel {
  // iPhones
  IPhone15Pro = 'iphone-15-pro',
  IPhone15ProMax = 'iphone-15-pro-max',
  IPhone14Pro = 'iphone-14-pro',
  IPhoneSE = 'iphone-se',
  // iPads
  IPadPro11 = 'ipad-pro-11',
  IPadPro13 = 'ipad-pro-13',
  IPadAir = 'ipad-air',
  IPadMini = 'ipad-mini',
  // MacBooks
  MacBookPro14 = 'macbook-pro-14',
  MacBookPro16 = 'macbook-pro-16',
  MacBookAir13 = 'macbook-air-13',
  MacBookAir15 = 'macbook-air-15',
  // Apple Watch
  AppleWatchUltra = 'apple-watch-ultra',
  AppleWatch9 = 'apple-watch-9',
  // Desktop
  IMac24 = 'imac-24',
  StudioDisplay = 'studio-display'
}

export interface Project {
  version: string
  id: string
  name: string
  filePath?: string  // Path to the saved project file
  createdAt: string
  modifiedAt: string

  /** Schema version for migrations. */
  schemaVersion: number

  // Raw recording references
  recordings: Recording[]

  // Timeline with clips referencing recordings
  timeline: Timeline

  // Global project settings
  settings: ProjectSettings

  // Export presets
  exportPresets: ExportPreset[]
}

/**
 * Recording capabilities - explicitly describes what data is available.
 * This makes recordings self-describing so consumers don't need to infer
 * capabilities from other fields like folderPath or isExternal.
 */
export interface RecordingCapabilities {
  /** True if cursor/mouse events are available */
  hasCursorData?: boolean
  /** True if keyboard events are available */
  hasKeystrokeData?: boolean
  /** True if scroll events are available */
  hasScrollData?: boolean
  /** True if screen dimension events are available */
  hasScreenData?: boolean
}

interface RecordingBase {
  id: string
  duration: number
  width: number
  height: number
  frameRate: number

  // Audio information
  hasAudio?: boolean

  /** True if this recording was imported from an external file (not created by our app) */
  isExternal?: boolean

  /** True if the source file was verified missing at last load */
  isMissing?: boolean

  /**
   * Recording capabilities - explicitly describes what data is available.
   * Self-describing: consumers check these flags to determine behavior.
   * If undefined, capabilities are inferred from other fields (backward compat).
   */
  capabilities?: RecordingCapabilities

  /**
   * URL to a downscaled preview proxy video for memory-efficient preview playback.
   * Generated automatically for source videos larger than 1440p.
   * Only used for preview - export always uses the original full-resolution source.
   */
  previewProxyUrl?: string

  /**
   * URL to a "super low res" proxy (e.g. 64x36) specifically for the glow effect.
   * If available, this is prioritized over previewProxyUrl when isGlowMode is true.
   */
  glowProxyUrl?: string

  /**
   * URL to a low-latency "scrub" proxy (e.g. 360p/480p, GOP 15).
   * Prioritized when isScrubbing is true.
   */
  scrubProxyUrl?: string

  // Capture area information
  captureArea?: CaptureArea

  // Captured metadata during recording
  metadata?: RecordingMetadata

  // Effects stored in source space (timestamps relative to recording start).
  // Non-zoom, recording-scoped effects only (cursor/background/screen/etc).
  effects: Effect[]

  // Folder-based storage for this recording (absolute or project-relative)
  folderPath?: string

  // Manifest of metadata chunk files stored on disk under folderPath
  metadataChunks?: {
    mouse?: string[]
    keyboard?: string[]
    click?: string[]
    scroll?: string[]
    screen?: string[]
  }
}

export interface VideoRecording extends RecordingBase {
  sourceType: 'video'
  filePath: string
  generatedSource?: never
  imageSource?: never
  syntheticMouseEvents?: never
}

export interface ImageRecording extends RecordingBase {
  sourceType: 'image'
  filePath: string
  imageSource: ImageSourceData
  generatedSource?: never
  syntheticMouseEvents?: MouseEvent[]
}

export interface GeneratedRecording extends RecordingBase {
  sourceType: 'generated'
  filePath?: string
  generatedSource: {
    pluginId: string
    params: Record<string, unknown>
  }
  imageSource?: never
  syntheticMouseEvents?: never
}

export type Recording = VideoRecording | ImageRecording | GeneratedRecording

export interface CaptureArea {
  // Full screen bounds (including dock)
  fullBounds: {
    x: number
    y: number
    width: number
    height: number
  }
  // Work area bounds (excluding dock/taskbar)
  workArea: {
    x: number
    y: number
    width: number
    height: number
  }
  // Display scale factor for HiDPI screens
  scaleFactor: number
  // Source type for determining if cropping is needed
  sourceType?: RecordingSourceType
  // Source ID for the recording
  sourceId?: string
}

/** Image source configuration for image clips (freeze frames, imported images) */
export interface ImageSourceData {
  /** Path to the image file (absolute or project-relative) */
  imagePath: string
  /** Source video recording ID (for freeze frames captured from video) */
  sourceRecordingId?: string
  /** Source timestamp (ms) when the frame was captured */
  sourceTimestamp?: number
  /** Original width of the source at capture time */
  sourceWidth?: number
  /** Original height of the source at capture time */
  sourceHeight?: number
}

export interface RecordingMetadata {
  // Mouse/cursor events
  mouseEvents: MouseEvent[]

  // Keyboard events for overlay
  keyboardEvents: KeyboardEvent[]

  // Click events for ripples
  clickEvents: ClickEvent[]

  // Scroll events for cinematic scroll effects
  scrollEvents?: ScrollEvent[]

  // Screen dimensions changes
  screenEvents: ScreenEvent[]

  // Capture area information for cropping during export
  captureArea?: CaptureArea

  // Cached typing detection results (computed once, reused across clips)
  detectedTypingPeriods?: TypingPeriod[]

  // Cached idle detection results (computed once, reused across clips)
  detectedIdlePeriods?: IdlePeriod[]
}

// Typing period detected in recording
export interface TypingPeriod {
  startTime: number  // Source timestamp
  endTime: number    // Source timestamp
  keyCount: number
  averageWPM: number
  suggestedSpeedMultiplier: number
}

// Idle period detected in recording (no activity)
export interface IdlePeriod {
  startTime: number  // Source timestamp
  endTime: number    // Source timestamp
  suggestedSpeedMultiplier: number
  confidence: number // 0-1
}

export interface MouseEvent {
  timestamp: number
  sourceTimestamp?: number
  x: number
  y: number
  screenWidth: number
  screenHeight: number
  cursorType?: string  // Optional cursor type for rendering
  captureWidth?: number  // Width of the capture area for coordinate mapping
  captureHeight?: number  // Height of the capture area for coordinate mapping
}

export interface ScrollEvent {
  timestamp: number
  sourceTimestamp?: number
  deltaX: number
  deltaY: number
}

export interface KeyboardEvent {
  timestamp: number
  sourceTimestamp?: number
  key: string
  modifiers: string[]
}

export interface ClickEvent {
  timestamp: number
  sourceTimestamp?: number
  x: number
  y: number
  button: MouseButton
}

export interface ScreenEvent {
  timestamp: number
  width: number
  height: number
}

export interface Timeline {
  tracks: Track[]
  duration: number
  // Global effects (backgrounds, etc.) that apply to entire timeline
  // Note: Most effects now live on Recording in source space
  effects?: Effect[]
}

export interface Track {
  id: string
  name: string
  type: TrackType
  clips: Clip[]
  muted: boolean
  locked: boolean
}

export interface Clip {
  id: string
  recordingId: string  // References Recording.id

  // Timeline position
  startTime: number    // Position on timeline
  duration: number     // Clip duration

  // Source trimming
  sourceIn: number     // Start point in source recording
  sourceOut: number    // End point in source recording

  // Locked expansion bounds - when set, prevent expansion beyond these
  // Used by system-created clips (e.g., speed-up segments) to lock their bounds
  lockedSourceIn?: number   // Minimum sourceIn allowed (can't expand left past this)
  lockedSourceOut?: number  // Maximum sourceOut allowed (can't expand right past this)

  // Playback control
  playbackRate?: number // Speed multiplier (1.0 = normal, 2.0 = 2x speed, 0.5 = half speed)
  typingSpeedApplied?: boolean // Flag to indicate typing speed has been applied to this clip
  idleSpeedApplied?: boolean   // Flag to indicate idle speed has been applied to this clip

  // Time remapping for variable speed (typing speed, etc)
  timeRemapPeriods?: TimeRemapPeriod[]

  // Transitions
  transitionIn?: Transition
  transitionOut?: Transition

  // Fade effects (in milliseconds)
  introFadeMs?: number  // Fade in duration at clip start (default: 0 means no fade)
  outroFadeMs?: number  // Fade out duration at clip end (default: 0 means no fade)
}

// Time remapping period for variable playback speed
export interface TimeRemapPeriod {
  // Source time range (in recording coordinates)
  sourceStartTime: number
  sourceEndTime: number
  // Playback speed multiplier for this period
  speedMultiplier: number
}

// Effect entity - timing in source space (recording timestamps)
export type Effect =
  | ZoomEffect
  | CursorEffect
  | KeystrokeEffect
  | BackgroundEffect
  | AnnotationEffect
  | ScreenEffect
  | PluginEffect
  | CropEffect
  | WebcamEffect

export interface BaseEffect {
  id: string
  // Timing in source space (relative to recording start)
  startTime: number
  endTime: number
  enabled: boolean
  locked?: boolean
  // Explicit clip ID binding for clip-scoped effects (Crop, etc.)
  clipId?: string
}

export interface ZoomEffect extends BaseEffect {
  type: EffectType.Zoom
  data: ZoomEffectData
}

export interface CursorEffect extends BaseEffect {
  type: EffectType.Cursor
  data: CursorEffectData
}

export interface KeystrokeEffect extends BaseEffect {
  type: EffectType.Keystroke
  data: KeystrokeEffectData
}

export interface BackgroundEffect extends BaseEffect {
  type: EffectType.Background
  data: BackgroundEffectData
}

export interface AnnotationEffect extends BaseEffect {
  type: EffectType.Annotation
  data: AnnotationData
}

export interface ScreenEffect extends BaseEffect {
  type: EffectType.Screen
  data: ScreenEffectData
}

export interface PluginEffect extends BaseEffect {
  type: EffectType.Plugin
  data: PluginEffectData
}

export interface CropEffect extends BaseEffect {
  type: EffectType.Crop
  data: CropEffectData
}

export interface WebcamEffect extends BaseEffect {
  type: EffectType.Webcam
  data: WebcamEffectData
}

export type ZoomBlockOrigin = 'auto' | 'manual'

interface ZoomBlockBase {
  id: string
  startTime: number
  endTime: number
  scale: number
  targetX?: number        // Screen pixel coordinates
  targetY?: number        // Screen pixel coordinates
  screenWidth?: number    // Screen dimensions for normalization (fixes Retina display issues)
  screenHeight?: number   // Screen dimensions for normalization (fixes Retina display issues)
  introMs?: number        // Duration of zoom in animation
  outroMs?: number        // Duration of zoom out animation
  importance?: number     // Action importance score (0-1) for 3D effect decisions
  followStrategy?: ZoomFollowStrategy
  autoScale?: 'fill'
  smoothing?: number
  mouseIdlePx?: number
}

export interface AutoZoomBlock extends ZoomBlockBase {
  origin: 'auto'
}

export interface ManualZoomBlock extends ZoomBlockBase {
  origin: 'manual'
}

export type ZoomBlock = AutoZoomBlock | ManualZoomBlock

// Background type enum
export enum BackgroundType {
  None = 'none',
  Color = 'color',
  Gradient = 'gradient',
  Image = 'image',
  Wallpaper = 'wallpaper',
  Parallax = 'parallax'
}

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
  TiltRight = 'tilt-right'
}

// Annotation type enum
export enum AnnotationType {
  Text = 'text',
  Arrow = 'arrow',
  Highlight = 'highlight',
  Keyboard = 'keyboard'
}

// Cursor style enum
export enum CursorStyle {
  Default = 'default',
  MacOS = 'macOS',
  Custom = 'custom'
}

// Zoom follow strategy enum
export enum ZoomFollowStrategy {
  Mouse = 'mouse',
  Center = 'center',
  Manual = 'manual'
}

// Keystroke position enum
export enum KeystrokePosition {
  BottomCenter = 'bottom-center',
  BottomRight = 'bottom-right',
  TopCenter = 'top-center'
}

export enum MouseButton {
  Left = 'left',
  Right = 'right',
  Middle = 'middle'
}

export type ClickEffectStyle = 'ripple' | 'ripple-text' | 'text' | 'none'
export type ClickEffectAnimation = 'expand' | 'pulse'
export type ClickTextMode = 'random' | 'sequence' | 'single'
export type ClickTextAnimation = 'float' | 'pop'

// Cursor motion presets for smooth movement
export type CursorMotionPreset = 'cinematic' | 'smooth' | 'balanced' | 'responsive' | 'custom'

// New: Effect-specific data types for independent effects
export interface ZoomEffectData {
  origin: ZoomBlockOrigin
  scale: number
  targetX?: number          // Screen pixel coordinates
  targetY?: number          // Screen pixel coordinates
  screenWidth?: number      // Screen dimensions for normalization (fixes Retina display issues)
  screenHeight?: number     // Screen dimensions for normalization (fixes Retina display issues)
  introMs: number
  outroMs: number
  smoothing: number
  // Follow strategy: mouse or center lock
  followStrategy?: ZoomFollowStrategy
  autoScale?: 'fill'
  // Mouse idle threshold in pixels (physical) to consider idle within the velocity window
  mouseIdlePx?: number
}

export interface CursorEffectData {
  style: CursorStyle
  size: number
  color: string
  clickEffects: boolean
  clickEffectStyle?: ClickEffectStyle
  clickEffectAnimation?: ClickEffectAnimation
  clickEffectDurationMs?: number
  clickEffectMaxRadius?: number
  clickEffectLineWidth?: number
  clickEffectColor?: string
  clickTextWords?: string[]
  clickTextMode?: ClickTextMode
  clickTextAnimation?: ClickTextAnimation
  clickTextSize?: number
  clickTextColor?: string
  clickTextOffsetY?: number
  clickTextRise?: number
  motionBlur: boolean
  /**
   * Intensity of cursor motion blur (0-100). Optional for backward compatibility.
   */
  motionBlurIntensity?: number
  /**
   * Adds a slight rotation ("bank") in the direction of cursor travel.
   * Optional for backward compatibility with existing projects.
   */
  directionalTilt?: boolean
  /**
   * Maximum rotation amount in degrees when the cursor is moving fast.
   * Optional for backward compatibility with existing projects.
   */
  directionalTiltMaxDeg?: number
  hideOnIdle: boolean
  fadeOnIdle: boolean
  idleTimeout: number
  gliding: boolean
  speed: number
  smoothness: number
  /**
   * Extra inertia for cursor gliding (0 = most responsive, 1 = most "icy"/laggy).
   * Optional for backward compatibility with existing projects.
   */
  glide?: number
  /**
   * Multiplier for the smoothing jump threshold relative to capture diagonal.
   * Higher = fewer hard resets on fast movement.
   */
  smoothingJumpThreshold?: number
  /**
   * Motion preset for cursor smoothing (cinematic, smooth, balanced, responsive, custom).
   * When set to anything other than 'custom', speed/smoothness/glide are derived from preset.
   */
  motionPreset?: CursorMotionPreset
}

export interface KeystrokeEffectData {
  position?: KeystrokePosition
  fontSize?: number
  fontFamily?: string
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderRadius?: number
  padding?: number
  fadeOutDuration?: number
  maxWidth?: number
  // Extended options
  displayDuration?: number      // How long text stays visible (ms)
  stylePreset?: 'default' | 'glass' | 'minimal' | 'terminal' | 'outline'
  showModifierSymbols?: boolean // Show ⌘⌥⌃⇧ vs Cmd+Alt+Ctrl+Shift
  scale?: number                // Overall scale multiplier
}

export interface BackgroundEffectData {
  type: BackgroundType
  color?: string
  gradient?: {
    colors: string[]
    angle: number
  }
  image?: string
  wallpaper?: string
  blur?: number
  padding: number
  cornerRadius?: number  // Video corner radius in pixels
  shadowIntensity?: number  // Shadow intensity 0-100
  parallaxLayers?: ParallaxLayer[]  // Layers for parallax background
  parallaxIntensity?: number  // Movement intensity 0-100 (default 50)
  /** Device mockup settings (per-clip) */
  mockup?: DeviceMockupData
}

// Parallax layer definition
export interface ParallaxLayer {
  image: string      // Path or URL to the layer image
  factor: number     // Movement sensitivity (smaller = more movement)
  zIndex: number     // Visual stacking order
}

// Video fit mode within device mockup screen
export type MockupVideoFit = 'fill'

export interface MockupScreenRegion {
  x: number
  y: number
  width: number
  height: number
  cornerRadius: number
}

export interface MockupFrameBounds {
  x: number
  y: number
  width: number
  height: number
}

// Device mockup configuration (per-clip)
export interface DeviceMockupData {
  /** Whether the device mockup is enabled */
  enabled: boolean
  /** Category of device (iPhone, iPad, MacBook, etc.) */
  deviceType: DeviceType
  /** Specific device model */
  deviceModel: DeviceModel | string
  /** How the video fits within the device screen area */
  videoFit: MockupVideoFit
  /** Fill color behind the video content inside the device screen */
  screenFillColor?: string
  /** Device color variant (e.g., 'space-black', 'silver', 'natural-titanium') */
  colorVariant?: string
  /** Custom mockup frame image path for auto-discovered devices */
  customFramePath?: string
  /** Custom mockup frame dimensions (pixels) */
  customFrameDimensions?: { width: number; height: number }
  /** Screen region within the custom mockup frame */
  customScreenRegion?: MockupScreenRegion
  /** Visible bounds within the custom mockup frame (for trimming transparent padding) */
  customFrameBounds?: MockupFrameBounds
  /** Shadow intensity behind the device frame (0-100) */
  shadowIntensity?: number
  /** Device rotation in degrees (for tilted mockup displays) */
  rotation?: number
}

// Canvas settings for project-level aspect ratio
export interface CanvasSettings {
  /** Selected aspect ratio preset */
  aspectRatio: AspectRatioPreset
  /** Custom width (only used when aspectRatio is 'custom') */
  customWidth?: number
  /** Custom height (only used when aspectRatio is 'custom') */
  customHeight?: number
}

// Annotation style definition
export interface AnnotationStyle {
  color?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  textDecoration?: 'none' | 'underline'
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  padding?: number | { top: number; right: number; bottom: number; left: number }
  opacity?: number
  strokeWidth?: number
  arrowHeadSize?: number
}

export interface AnnotationData {
  type?: AnnotationType
  /** Position in 0-100% of canvas (top-left for text/highlight/keyboard, start point for arrows) */
  position?: { x: number; y: number }
  content?: string
  style?: AnnotationStyle
  // Optional discriminator for advanced behaviors (e.g., 'screen3d', 'scrollCinematic')
  kind?: string
  // Additional properties for specific annotation types
  /** End position for arrows (0-100% of canvas) */
  endPosition?: { x: number; y: number }
  /** Width in percentage of canvas (for highlights) */
  width?: number
  /** Height in percentage of canvas (for highlights) */
  height?: number
  keys?: string[] // For keyboard annotations
  /** Smoothing factor for scrollCinematic annotations */
  smoothing?: number
  /** Rotation in degrees (clockwise positive, 0-360) */
  rotation?: number
}

export interface Annotation {
  id: string
  type: AnnotationType
  startTime: number
  endTime: number
  position: { x: number; y: number }
  data: unknown  // Type-specific data
}

export interface Transition {
  type: TransitionType
  duration: number
  easing: string
}


export type AudioEnhancementPreset = 'off' | 'subtle' | 'balanced' | 'broadcast' | 'custom'

export interface PlayerConfiguration {
  clips: Clip[]
  audioClips: Clip[]
  webcamClips: Clip[]
  recordings: Recording[]
  effects: Effect[]
  videoWidth: number
  videoHeight: number
  fps: number
  backgroundColor: string
  enhanceAudio: boolean
  cameraSettings: ProjectSettings['camera']
  [key: string]: unknown
}


export interface AudioEnhancementSettings {
  threshold: number  // -60 to 0 dB
  ratio: number      // 1 to 20
  attack: number     // 0.001 to 1 seconds
  release: number    // 0.01 to 1 seconds
  knee: number       // 0 to 40 dB
}

export interface ProjectSettings {
  resolution: {
    width: number
    height: number
  }
  frameRate: number
  backgroundColor: string
  audio: {
    volume: number
    muted: boolean
    fadeInDuration: number
    fadeOutDuration: number
    enhanceAudio: boolean
    enhancementPreset?: AudioEnhancementPreset
    customEnhancement?: AudioEnhancementSettings
  }
  camera: {
    motionBlurEnabled?: boolean
    motionBlurIntensity?: number  // 0-100
    motionBlurThreshold?: number  // 0-100
    /** Ease-in rate: how fast blur fades in (0.1 = slow, 1.0 = instant) */
    motionBlurEaseIn?: number  // 0.1-1.0
    /** Ease-out rate: how fast blur fades out (0.1 = trailing, 1.0 = instant) */
    motionBlurEaseOut?: number  // 0.1-1.0
    /** Gamma correction for blur overlay: 1.0 = linear, 2.2 = sRGB standard */
    motionBlurGamma?: number  // 0.5-3.0
    /** Enable camera-like refocus blur during zoom transitions */
    refocusBlurEnabled?: boolean
    /** Intensity of refocus blur effect 0-100 (default: 40) */
    refocusBlurIntensity?: number

    // --- Advanced Motion Blur Tuning ---
    /** Window size for velocity smoothing (in frames). Default 3. 1 = Instant/Raw. */
    motionBlurSmoothWindow?: number // 1-15
    /** Range for soft knee transition (as factor of threshold). Default 0.5. */
    motionBlurRampRange?: number // 0.1-2.0
    /** Max blur radius clamp (in pixels). Default 60. */
    /** Max blur radius clamp (in pixels). Default 60. */
    motionBlurClamp?: number // 10-200

    // --- Advanced Color & Debug ---
    /** Number of samples for the blur (Quality). Default dynamic. */
    motionBlurSamples?: number // 5-64
    /** WebGL Context Color Space. Default 'srgb'. */
    motionBlurColorSpace?: 'srgb' | 'display-p3'
    /** Unpack Premultiply Alpha. Default false. */
    motionBlurUnpackPremultiply?: boolean
    /** Manual Black Level (0.0 - 0.2). Default 0.0. */
    motionBlurBlackLevel?: number
    /** Show Split-Screen Debug View. Default false. */
    motionBlurDebugSplit?: boolean
    /** Force enable blur for debugging (ignores velocity). Default false. */
    motionBlurForce?: boolean
    /** Saturation adjustment (0.0 - 2.0). Default 1.0. */
    motionBlurSaturation?: number
    /** Cameraman style smoothness (0-100). Controls how floaty camera panning feels. Default 48. */
    cameraSmoothness?: number
    /** Physics-based camera dynamics configuration */
    cameraDynamics?: CameraDynamics
  }
  /** Canvas settings for aspect ratio and output dimensions */
  canvas: CanvasSettings
}

export type CameraSettings = NonNullable<ProjectSettings['camera']>

export interface ExportPreset {
  id: string
  name: string
  format: ExportFormat
  codec: string
  quality: QualityLevel
  resolution: {
    width: number
    height: number
  }
  frameRate: number
  bitrate?: number
}

export type ExportStatus = 'idle' | 'preparing' | 'exporting' | 'complete' | 'error'

export interface ScreenEffectData {
  // Simple preset selector; actual parameters derived by renderer
  preset: ScreenEffectPreset
  // Optional fine-tune overrides
  tiltX?: number
  tiltY?: number
  perspective?: number
  // Optional easing durations for tilt intro/outro (ms)
  introMs?: number
  outroMs?: number
}

export interface PluginEffectData {
  /** Plugin ID from registry */
  pluginId: string
  /** Plugin-specific parameters */
  params: Record<string, unknown>
  /** Position for positionable plugins (0-100% of canvas) */
  position?: {
    x: number
    y: number
    width?: number
    height?: number
  }
  /** Z-index override (default based on category) */
  zIndex?: number
}

export interface CropEffectData {
  /** Left edge position (0-1 normalized to source video width) */
  x: number
  /** Top edge position (0-1 normalized to source video height) */
  y: number
  /** Width of crop region (0-1 normalized to source video width) */
  width: number
  /** Height of crop region (0-1 normalized to source video height) */
  height: number
}

// Webcam shape options
export type WebcamShape = 'circle' | 'rounded-rect' | 'squircle' | 'rectangle'

// Webcam position anchor points
export type WebcamAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

// Webcam animation types
export type WebcamEntryAnimation = 'none' | 'fade' | 'scale' | 'slide' | 'bounce'
export type WebcamExitAnimation = 'none' | 'fade' | 'scale'
export type WebcamPipAnimation = 'none' | 'float' | 'breathe'

export interface WebcamEffectData {
  // Position & Size
  position: {
    x: number  // 0-100 percentage of canvas width
    y: number  // 0-100 percentage of canvas height
    anchor: WebcamAnchor
  }
  size: number  // 5-50 percentage of canvas width
  padding: number  // Edge padding in pixels (distance from canvas edge)

  // Shape
  shape: WebcamShape
  cornerRadius: number  // 0-50 pixels for rounded-rect/squircle

  // Border
  borderEnabled: boolean
  borderWidth: number  // 0-10 pixels
  borderColor: string
  borderGradient?: {
    colors: string[]
    angle: number
  }

  // Shadow
  shadowEnabled: boolean
  shadowColor: string
  shadowBlur: number  // 0-50 pixels
  shadowOffsetX: number
  shadowOffsetY: number

  // Background blur (webcam background only, not video content)
  backgroundBlur: boolean
  backgroundBlurAmount: number  // 0-20 pixels

  // Animations
  animations: {
    entry: {
      type: WebcamEntryAnimation
      durationMs: number
      from?: number  // Scale/opacity start value
    }
    exit: {
      type: WebcamExitAnimation
      durationMs: number
    }
    pip: {
      type: WebcamPipAnimation
      amplitude?: number  // For float/breathe
      period?: number  // Animation cycle in ms
    }
  }

  // Mirror/flip the webcam horizontally (common preference)
  mirror: boolean

  // Opacity (0-1)
  opacity: number

  // Reduce opacity when zoomed in (to keep focus on content)
  reduceOpacityOnZoom?: boolean
  zoomInfluence?: number // 0 to 1, how much the webcam resists camera zoom (scale inversely)

  // Crop the webcam source (0-1 normalized)
  sourceCrop?: CropEffectData
}

export interface CameraDynamics {
  /** Spring stiffness (responsiveness). Higher = faster. Default ~120. */
  stiffness: number
  /** Spring damping (friction). Higher = less oscillation. Default ~25. */
  damping: number
  /** Mass (inertia). Default 1. */
  mass: number
}
