import type { ReactElement, ReactNode, SyntheticEvent } from 'react';
import type {
  Clip,
  Effect,
  Recording,
  RecordingMetadata,
  ParallaxLayer,
  CameraSettings,
  MouseEvent,
  ClickEvent,
  ScrollEvent,
  KeyboardEvent,
  CropEffectData,
  ZoomEffectData,
} from './project';
import type { MockupPositionResult } from '@/lib/mockups/mockup-transform';
import type { FrameLayoutItem } from '@/features/timeline/utils/frame-layout';
import type { ParsedZoomBlock } from '@/features/effects/utils/camera-calculator';
import type { MetadataUrlSet } from '@/lib/export/metadata-loader';

export type VideoUrlMap = Record<string, string>;
export type MetadataUrlMap = Record<string, MetadataUrlSet>;

// ============================================================================
// CONFIGURATION OBJECTS
// ============================================================================

export interface VideoResources {
  videoUrls?: VideoUrlMap;
  videoUrlsHighRes?: VideoUrlMap;
  videoFilePaths?: VideoUrlMap;
  metadataUrls?: MetadataUrlMap;
}

export interface PlaybackSettings {
  isPlaying: boolean;
  isScrubbing: boolean;
  isHighQualityPlaybackEnabled: boolean;
  previewMuted: boolean;
  previewVolume: number;
}

export interface RenderSettings {
  /** Whether we are in "glow" mode (ambient background blur) */
  isGlowMode: boolean;
  /** Whether to use offthread video rendering (safer but more memory intensive) */
  preferOffthreadVideo: boolean;
  /** Whether to enhance audio (normalize/compress) */
  enhanceAudio: boolean;
  /** Whether we are currently editing the crop */
  isEditingCrop: boolean;
}

export interface CropSettings {
  cropData?: CropEffectData | null;
  onCropChange?: (cropData: CropEffectData) => void;
  onCropConfirm?: () => void;
  onCropReset?: () => void;
}

export interface ZoomSettings {
  isEditing: boolean;
  zoomData?: ZoomEffectData | null;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface UseRecordingMetadataOptions {
  /** Recording ID to load metadata for */
  recordingId: string;
  /** Folder path for local file loading (preview mode) */
  folderPath?: string;
  /** Metadata chunk filenames (preview mode) */
  metadataChunks?: Recording['metadataChunks'];
  /** HTTP URLs for metadata chunks (export mode) - keyed by recordingId */
  metadataUrls?: MetadataUrlMap;
  /** Already-loaded metadata to use as fallback */
  inlineMetadata?: RecordingMetadata;
}

export interface UseRecordingMetadataResult {
  /** Loaded metadata (null while loading) */
  metadata: RecordingMetadata | null;
  /** Whether metadata is currently being loaded */
  isLoading: boolean;
  /** Error if loading failed */
  error: Error | null;
}

export interface UseVideoUrlProps {
  recording: Recording | null | undefined;
  resources: VideoResources;
  /** Clip ID for URL lock invalidation when clips change */
  clipId?: string;
  preferOffthreadVideo?: boolean;
  targetWidth?: number;
  targetHeight?: number;
  maxZoomScale?: number;
  currentZoomScale?: number;
  isPlaying?: boolean;
  isGlowMode?: boolean;
  forceProxy?: boolean;
  isHighQualityPlaybackEnabled?: boolean;
}

export interface UseRenderDelayResult {
  /** Call to release the render delay (marks component as ready) */
  markRenderReady: (source?: string) => void;
  /** Attach to video events (onLoadedData, onCanPlay, onSeeked) */
  handleVideoReady: (event: SyntheticEvent<HTMLVideoElement>) => void;
}

export type CameraPathFrame = {
  activeZoomBlock: ParsedZoomBlock | undefined;
  zoomCenter: { x: number; y: number };
  /** Precomputed velocity for motion blur (normalized 0-1 delta per frame) */
  velocity?: { x: number; y: number };
  /** Precomputed zoom transform (SSOT - no render-time calculation needed) */
  zoomTransform: ZoomTransform;
  /** Precomputed CSS transform string for GPU-accelerated rendering */
  zoomTransformStr: string;
};

export interface ZoomTransform {
  scale: number;
  scaleCompensationX: number;
  scaleCompensationY: number;
  panX: number;
  panY: number;
  /** Refocus blur amount (0-1) - peaks mid-transition like a camera pulling focus */
  refocusBlur: number;
}

export type ActiveClipDataAtFrame = {
  clip: Clip;
  recording: Recording;
  sourceTimeMs: number;
  effects: Effect[];
};

export interface VideoPositionContextValue {
  // Core layout dimensions
  offsetX: number;
  offsetY: number;
  drawWidth: number;
  drawHeight: number;
  zoomTransform: ZoomTransform | null;
  contentTransform: string;
  padding: number;
  videoWidth: number;
  videoHeight: number;

  // Extended layout properties (from useLayoutCalculation)
  paddingScaled?: number;
  scaleFactor?: number;
  cornerRadius?: number;
  shadowIntensity?: number;
  activeSourceWidth?: number;
  activeSourceHeight?: number;

  // Effects
  /** Refocus blur strength in pixels for zoom transitions */
  refocusBlurPx?: number;

  /** Motion blur state (IoC pattern - data flows down, not discovered via DOM) */
  motionBlur?: {
    /** Whether motion blur is enabled globally */
    enabled: boolean;
    /** Camera velocity in pixels per frame (precomputed from camera path) */
    velocity: { x: number; y: number };
    /** Intensity multiplier 0-1 (from camera settings) */
    intensity: number;
    /** Draw dimensions for the blur effect */
    drawWidth: number;
    drawHeight: number;
  };

  // Mockup
  /** Whether a device mockup is enabled */
  mockupEnabled?: boolean;
  /** Device mockup position and dimensions (when enabled) */
  mockupPosition?: MockupPositionResult | null;
  mockupData?: unknown;

  // Frame layout and clip data (SSOT from SharedVideoController)
  /** Active clip data for current frame */
  activeClipData?: ActiveClipDataAtFrame | null;
  /** Effective clip data with inheritance applied */
  effectiveClipData?: ActiveClipDataAtFrame | null;
  /** Clip data for previous frame (frame-1) - used for cursor smoothing */
  prevFrameClipData?: ActiveClipDataAtFrame | null;
  /** Pre-computed frame layout */
  frameLayout?: FrameLayoutItem[];
  /** Current active layout item */
  activeLayoutItem?: FrameLayoutItem | null;
  /** Previous layout item (for boundary logic) */
  prevLayoutItem?: FrameLayoutItem | null;
  /** Next layout item (for boundary logic) */
  nextLayoutItem?: FrameLayoutItem | null;

  // Rendering State (for VideoClipRenderer)
  maxZoomScale?: number;
  boundaryState?: {
    shouldHoldPrevFrame: boolean;
    isNearBoundaryEnd: boolean;
    overlapFrames: number;
    isNearBoundaryStart: boolean;
  };
}

export interface ClipContextValue {
  clip: Clip;
  recording: Recording;
  videoUrl: string;
  cursorEvents: MouseEvent[];
  clickEvents: ClickEvent[];
  keystrokeEvents: KeyboardEvent[];
  scrollEvents: ScrollEvent[];
  effects: Effect[];
}

export interface TimeContextValue {
  totalDurationMs: number;
  fps: number;
  clips: Clip[];
  recordingsMap: Map<string, Recording>;
  resources: VideoResources;
  getClipAtTimelinePosition: (timelineMs: number) => Clip | null;
  getRecording: (recordingId: string) => Recording | null;
  getVideoUrl: (recordingId: string) => string | undefined;
}

export interface CameraMotionBlurState {
  blurRadius: number;
  angle: number;
  velocity: number;
}

export interface MotionBlurConfig {
  enabled: boolean;
  maxBlurRadius: number;
  velocityThreshold: number;
  intensityMultiplier: number;
}

export interface CropTransform {
  scale: number;
  translateX: number;
  translateY: number;
  isActive: boolean;
  /** CSS clip-path to mask content outside the crop region */
  clipPath?: string;
}

export interface FadeOpacityOptions {
  localFrame: number;
  durationFrames: number;
  introFadeDuration: number;
  outroFadeDuration: number;
  minOpacity?: number;
}

export interface GlowCrossfadeOptions {
  isGlowMode: boolean;
  clipId: string;
  currentFrame: number;
  fps: number;
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
  prevLayoutItem: FrameLayoutItem | null;
  activeLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
}

export interface ClipFadeDurations {
  introFadeDuration: number;
  outroFadeDuration: number;
}

export interface AudioEnhancerWrapperProps {
  children: ReactElement;
  /** @deprecated Use RenderSettings.enhanceAudio instead */
  enabled?: boolean;
}

export interface BackgroundLayerProps {
  backgroundEffect?: Effect;
  videoWidth: number;
  videoHeight: number;
}

export interface ParallaxBackgroundLayerProps {
  layers: ParallaxLayer[];
  mouseX: number;
  mouseY: number;
  intensity: number;
}

export interface KeystrokeLayerProps {
  keystrokeEffects: Effect[];
  videoWidth: number;
  videoHeight: number;
}



export interface ClipSequenceProps {
  clip: Clip;
  effects: Effect[];
  videoWidth: number;
  videoHeight: number;
  startFrame: number;
  durationFrames: number;

  // Config objects - resources accessed via TimeContext (SSOT)
  renderSettings: RenderSettings;

  includeBackground?: boolean;
  includeKeystrokes?: boolean;
}

export interface TimelineCompositionProps {
  clips: Clip[];
  audioClips?: Clip[];
  webcamClips?: Clip[];
  recordings: Recording[];
  effects: Effect[];
  videoWidth: number;
  videoHeight: number;
  fps: number;
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;
  cameraSettings?: CameraSettings;
  backgroundColor?: string;

  // New Config Objects
  resources: VideoResources;
  playback: PlaybackSettings;
  renderSettings: RenderSettings;
  cropSettings: CropSettings;
  zoomSettings: ZoomSettings;
  [key: string]: unknown;
}

export interface SharedVideoControllerProps {
  videoWidth: number;
  videoHeight: number;
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;
  children?: ReactNode;
  cameraSettings?: CameraSettings;

  // New Config Objects
  playback: PlaybackSettings;
  renderSettings: RenderSettings;
  cropSettings: CropSettings;
}

export interface PluginLayerProps {
  effects: Effect[];
  videoWidth: number;
  videoHeight: number;
  layer?: 'below-cursor' | 'above-cursor';
}

export interface VideoClipRendererProps {
  clipForVideo: Clip;
  recording: Recording | undefined;
  startFrame: number;
  durationFrames: number;
  groupStartFrame: number;
  groupStartSourceIn: number;
  groupDuration: number;

  markRenderReady: (source?: string) => void;
  handleVideoReady: (e: SyntheticEvent<HTMLVideoElement>) => void;
  VideoComponent: import('react').ComponentType<any>;
  premountFor: number;
  postmountFor: number;
  onVideoRef?: (video: HTMLVideoElement | null) => void;
  isScrubbing?: boolean;
}

export interface PreviewVideoRendererProps {
  recording: Recording | null | undefined;
  clipForVideo?: Clip | null;
  startFrame: number;
  durationFrames: number;
  sourceTimeMs: number;
  currentFrame: number;
  fps: number;
  cornerRadius: number;
  drawWidth: number;
  drawHeight: number;
  compositionWidth: number;
  compositionHeight: number;
  maxZoomScale: number;
  currentZoomScale: number;
  mockupEnabled?: boolean;
  visible: boolean;

  // New Config Objects
  resources: VideoResources;
  playback: PlaybackSettings;
  renderSettings: RenderSettings;
}

export interface GeneratedClipRendererProps {
  clipForVideo: Clip;
  recording: Recording;
  startFrame: number;
  durationFrames: number;
  groupStartFrame: number;
  groupDuration: number;
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  drawWidth: number;
  drawHeight: number;
  compositionWidth: number;
  compositionHeight: number;

  activeLayoutItem: FrameLayoutItem | null;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
  overlapFrames: number;

  // New Config Objects
  renderSettings: RenderSettings;
}

export interface ImageClipRendererProps {
  clipForVideo: Clip;
  recording: Recording;
  startFrame: number;
  durationFrames: number;
  groupStartFrame: number;
  groupDuration: number;
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  cornerRadius: number;
  drawWidth: number;
  drawHeight: number;
  compositionWidth: number;
  compositionHeight: number;

  activeLayoutItem: FrameLayoutItem | null;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
  overlapFrames: number;

  // New Config Objects
  resources: VideoResources;
  renderSettings: RenderSettings;
}

export type { MetadataUrlSet };
