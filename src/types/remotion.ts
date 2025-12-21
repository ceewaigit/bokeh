import type { ReactElement, ReactNode, SyntheticEvent, VideoHTMLAttributes } from 'react';
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
  DeviceMockupData,
} from './project';
import type { MockupPositionResult } from '@/lib/mockups/mockup-transform';
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';
import type { ParsedZoomBlock } from '@/lib/effects/utils/camera-calculator';
import type { MetadataUrlSet } from '@/lib/export/metadata-loader';

export type VideoUrlMap = Record<string, string>;
export type MetadataUrlMap = Record<string, MetadataUrlSet>;

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
  videoUrls?: VideoUrlMap;
  videoUrlsHighRes?: VideoUrlMap;
  videoFilePaths?: VideoUrlMap;
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
  offsetX: number;
  offsetY: number;
  drawWidth: number;
  drawHeight: number;
  zoomTransform: ZoomTransform | null;
  contentTransform: string;
  padding: number;
  videoWidth: number;
  videoHeight: number;
  cameraMotionBlur?: {
    enabled: boolean;
    angle: number;
    filterId: string;
  };
  /** Whether a device mockup is enabled */
  mockupEnabled?: boolean;
  /** Device mockup position and dimensions (when enabled) */
  mockupPosition?: MockupPositionResult | null;
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
  getClipAtTimelinePosition: (timelineMs: number) => Clip | null;
  getRecording: (recordingId: string) => Recording | null;
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

export interface SafeVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'ref'> {
  startFrom?: number;
  endAt?: number;
  playbackRate?: number;
  volume?: number;
}

export interface AudioEnhancerWrapperProps {
  children: ReactElement;
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

export interface CursorLayerProps {
  effects: Effect[];
  videoWidth: number;
  videoHeight: number;
  metadataUrls?: MetadataUrlMap;
}

export interface ClipSequenceProps {
  clip: Clip;
  effects: Effect[];
  videoWidth: number;
  videoHeight: number;
  startFrame: number;
  durationFrames: number;
  videoUrls?: VideoUrlMap;
  videoFilePaths?: VideoUrlMap;
  metadataUrls?: MetadataUrlMap;
  preferOffthreadVideo?: boolean;
  includeBackground?: boolean;
  includeKeystrokes?: boolean;
}

export interface TimelineCompositionProps {
  clips: Clip[];
  audioClips?: Clip[];
  recordings: Recording[];
  effects: Effect[];
  videoWidth: number;
  videoHeight: number;
  fps: number;
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;
  preferOffthreadVideo?: boolean;
  videoUrls?: VideoUrlMap;
  videoUrlsHighRes?: VideoUrlMap;
  videoFilePaths?: VideoUrlMap;
  metadataUrls?: MetadataUrlMap;
  backgroundColor?: string;
  enhanceAudio?: boolean;
  isGlowMode?: boolean;
  isEditingCrop?: boolean;
  cameraSettings?: CameraSettings;
  isHighQualityPlaybackEnabled?: boolean;
  isPlaying?: boolean;
  isScrubbing?: boolean;
  previewMuted?: boolean;
  previewVolume?: number;
}

export interface SharedVideoControllerProps {
  videoWidth: number;
  videoHeight: number;
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;
  preferOffthreadVideo?: boolean;
  effects: Effect[];
  videoUrls?: VideoUrlMap;
  videoUrlsHighRes?: VideoUrlMap;
  videoFilePaths?: VideoUrlMap;
  metadataUrls?: MetadataUrlMap;
  enhanceAudio?: boolean;
  children?: ReactNode;
  isGlowMode?: boolean;
  isEditingCrop?: boolean;
  cameraSettings?: CameraSettings;
  isHighQualityPlaybackEnabled?: boolean;
  isPlaying?: boolean;
  isScrubbing?: boolean;
  previewMuted?: boolean;
  previewVolume?: number;
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
  renderStartFrom: number;
  groupDuration: number;
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  cornerRadius: number;
  drawWidth: number;
  drawHeight: number;
  preferOffthreadVideo: boolean;
  videoUrls?: VideoUrlMap;
  videoUrlsHighRes?: VideoUrlMap;
  videoFilePaths?: VideoUrlMap;
  compositionWidth: number;
  compositionHeight: number;
  maxZoomScale: number;
  currentZoomScale: number;
  mockupEnabled?: boolean;
  enhanceAudio?: boolean;
  isHighQualityPlaybackEnabled: boolean;
  isPlaying: boolean;
  isGlowMode: boolean;
  activeLayoutItem: FrameLayoutItem | null;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
  overlapFrames: number;
  markRenderReady: (source?: string) => void;
  handleVideoReady: (e: SyntheticEvent<HTMLVideoElement>) => void;
  VideoComponent: any;
  premountFor: number;
  postmountFor: number;
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
  videoUrls?: VideoUrlMap;
  videoUrlsHighRes?: VideoUrlMap;
  videoFilePaths?: VideoUrlMap;
  isHighQualityPlaybackEnabled: boolean;
  isPlaying: boolean;
  isGlowMode: boolean;
  enhanceAudio?: boolean;
  previewMuted: boolean;
  previewVolume: number;
  visible: boolean;
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
  isGlowMode: boolean;
  activeLayoutItem: FrameLayoutItem | null;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
  overlapFrames: number;
}

export type { MetadataUrlSet };
