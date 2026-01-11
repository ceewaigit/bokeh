/**
 * Project format for non-destructive editing
 * Keeps original recordings separate from effects metadata
 * 
 * This file contains ONLY type definitions - no business logic
 */

// Import feature types
import {
  WebcamLayoutData,
  WebcamShape,
  WebcamAnchor,
  WebcamEntryAnimation,
  WebcamExitAnimation,
  WebcamPipAnimation
} from '@/features/media/webcam/types';
import { AnnotationData, Annotation, AnnotationType, AnnotationStyle } from '@/features/effects/annotation/types';
import { CursorEffectData, CursorStyle, CursorTheme, CursorMotionPreset, ClickEffectStyle, ClickEffectAnimation, ClickTextMode, ClickTextAnimation } from '@/features/effects/cursor/types';
import { KeystrokeEffectData, KeystrokePosition } from '@/features/effects/keystroke/types';
import { BackgroundEffectData, BackgroundType, ParallaxLayer } from '@/features/effects/background/types';
import { ScreenEffectData, ScreenEffectPreset } from '@/features/effects/screen/types';
import { CropEffectData } from '@/features/effects/crop/types';
import { DeviceMockupData, DeviceType, DeviceModel, MockupVideoFit, MockupScreenRegion, MockupFrameBounds } from '@/features/effects/mockups/types';
import type { WatermarkEffectData } from '@/features/effects/watermark/types';

import {
  Effect,
  EffectType,
  BaseEffect,
  ZoomEffect,
  CursorEffect,
  KeystrokeEffect,
  BackgroundEffect,
  AnnotationEffect,
  ScreenEffect,
  PluginEffect,
  CropEffect,
  SubtitleEffect,
  ZoomEffectData,
  ZoomBlockOrigin,
  ZoomFollowStrategy,
  ZoomBlockBase,
  AutoZoomBlock,
  ManualZoomBlock,
  ZoomBlock,
  PluginEffectData,
  SubtitleEffectData,
  SubtitleHighlightStyle,
  EffectLayerType,
  SelectedEffectLayer
} from '@/features/effects/types';

import {
  TrackType,
  TimelineTrackType,
  TimelineItemType,
  TransitionType,
  TrackGroup,
  Transition
} from '@/features/ui/timeline/types';

export interface TimelineBlockRange {
  id: string
  startTime: number
  endTime: number
}


// --- Re-exports (Strictly Types or Enums from Features) ---
export {
  EffectType,
  EffectLayerType,
  ZoomFollowStrategy,
  TrackType,
  TimelineTrackType,
  TimelineItemType,
  TransitionType,
  DeviceType,
  DeviceModel,
  BackgroundType,
  ScreenEffectPreset,
  AnnotationType,
  CursorStyle,
  CursorTheme,
  KeystrokePosition
};

export type {
  SelectedEffectLayer,
  ZoomBlockOrigin,
  WebcamLayoutData,
  WebcamShape,
  WebcamAnchor,
  WebcamEntryAnimation,
  WebcamExitAnimation,
  WebcamPipAnimation,
  AnnotationData,
  AnnotationStyle,
  Annotation,
  CursorEffectData,
  CursorMotionPreset,
  ClickEffectStyle,
  ClickEffectAnimation,
  ClickTextMode,
  ClickTextAnimation,
  KeystrokeEffectData,
  BackgroundEffectData,
  ParallaxLayer,
  ScreenEffectData,
  CropEffectData,
  DeviceMockupData,
  MockupVideoFit,
  MockupScreenRegion,
  MockupFrameBounds,
  Effect,
  BaseEffect,
  ZoomEffect,
  CursorEffect,
  KeystrokeEffect,
  BackgroundEffect,
  AnnotationEffect,
  ScreenEffect,
  PluginEffect,
  CropEffect,
  SubtitleEffect,
  ZoomEffectData,
  ZoomBlockBase,
  AutoZoomBlock,
  ManualZoomBlock,
  ZoomBlock,
  PluginEffectData,
  SubtitleEffectData,
  SubtitleHighlightStyle,
  TrackGroup,
  Transition
};

// --- Enums local to Project Orchestration ---

export enum RecordingSourceType {
  Screen = 'screen',
  Window = 'window',
  Area = 'area'
}

export type RecordingMediaType = 'video' | 'generated' | 'image';

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

export enum MouseButton {
  Left = 'left',
  Right = 'right',
  Middle = 'middle'
}

// --- Interfaces ---

export interface Project {
  version: string;
  id: string;
  name: string;
  filePath?: string;
  createdAt: string;
  modifiedAt: string;
  schemaVersion: number;
  recordings: Recording[];
  timeline: Timeline;
  settings: ProjectSettings;
  exportPresets: ExportPreset[];
  watermark?: WatermarkEffectData;
}

export interface RecordingCapabilities {
  hasCursorData?: boolean;
  hasKeystrokeData?: boolean;
  hasScrollData?: boolean;
  hasScreenData?: boolean;
}

interface RecordingBase {
  id: string;
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  hasAudio?: boolean;
  isExternal?: boolean;
  isMissing?: boolean;
  capabilities?: RecordingCapabilities;
  // NOTE: Proxy URLs are stored ONLY in the proxy zustand store (src/features/proxy/store)
  // Do NOT add previewProxyUrl/glowProxyUrl/scrubProxyUrl here - that caused race conditions
  captureArea?: CaptureArea;
  metadata?: RecordingMetadata;

  /**
   * @deprecated ALL effects MUST live in `project.timeline.effects`.
   */
  effects: Effect[];

  folderPath?: string;
  metadataChunks?: {
    mouse?: string[];
    keyboard?: string[];
    click?: string[];
    scroll?: string[];
    screen?: string[];
    transcript?: string[];
  };
}

export interface VideoRecording extends RecordingBase {
  sourceType: 'video';
  filePath: string;
  generatedSource?: never;
  imageSource?: never;
  syntheticMouseEvents?: never;
}

export interface ImageRecording extends RecordingBase {
  sourceType: 'image';
  filePath: string;
  imageSource: ImageSourceData;
  generatedSource?: never;
  syntheticMouseEvents?: MouseEvent[];
}

export interface GeneratedRecording extends RecordingBase {
  sourceType: 'generated';
  filePath?: string;
  generatedSource: {
    pluginId: string;
    params: Record<string, unknown>;
  };
  imageSource?: never;
  syntheticMouseEvents?: never;
}

export type Recording = VideoRecording | ImageRecording | GeneratedRecording;

export interface CaptureArea {
  fullBounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  sourceType?: RecordingSourceType;
  sourceId?: string;
}

export interface TranscriptWord {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speaker?: string;
}

export interface Transcript {
  id: string;
  recordingId: string;
  language: string;
  modelUsed: string;
  generatedAt: string;
  words: TranscriptWord[];
}

export enum TranscriptionStatus {
  None = 'none',
  Pending = 'pending',
  Processing = 'processing',
  Complete = 'complete',
  Failed = 'failed'
}

export interface ImageSourceData {
  imagePath: string;
  sourceRecordingId?: string;
  sourceTimestamp?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface RecordingMetadata {
  mouseEvents: MouseEvent[];
  keyboardEvents: KeyboardEvent[];
  clickEvents: ClickEvent[];
  scrollEvents?: ScrollEvent[];
  screenEvents: ScreenEvent[];
  captureArea?: CaptureArea;
  detectedTypingPeriods?: TypingPeriod[];
  detectedIdlePeriods?: IdlePeriod[];
  transcript?: Transcript;
  transcriptionStatus?: TranscriptionStatus;
}

export interface TypingPeriod {
  startTime: number;
  endTime: number;
  keyCount: number;
  averageWPM: number;
  suggestedSpeedMultiplier: number;
}

export interface IdlePeriod {
  startTime: number;
  endTime: number;
  suggestedSpeedMultiplier: number;
  confidence: number;
}

export interface MouseEvent {
  timestamp: number;
  sourceTimestamp?: number;
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
  cursorType?: string;
  captureWidth?: number;
  captureHeight?: number;
}

export interface ScrollEvent {
  timestamp: number;
  sourceTimestamp?: number;
  deltaX: number;
  deltaY: number;
}

export interface KeyboardEvent {
  timestamp: number;
  sourceTimestamp?: number;
  key: string;
  modifiers: string[];
}

export interface ClickEvent {
  timestamp: number;
  sourceTimestamp?: number;
  x: number;
  y: number;
  button: MouseButton;
}

export interface ScreenEvent {
  timestamp: number;
  width: number;
  height: number;
}

export interface SourceTimeRange {
  startTime: number;
  endTime: number;
}

export interface TranscriptEditState {
  hiddenRegions: SourceTimeRange[];
  keptRegions?: SourceTimeRange[];
  originalWordCount?: number;
}

export interface Timeline {
  tracks: Track[];
  duration: number;
  effects?: Effect[];
  transcriptEdits?: Record<string, TranscriptEditState>;
  /** Dismissed activity suggestions (e.g., "clipId-typing-1234") */
  dismissedSuggestions?: string[];
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
}

export interface Clip {
  id: string;
  recordingId: string;
  startTime: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  lockedSourceIn?: number;
  lockedSourceOut?: number;
  playbackRate?: number;
  typingSpeedApplied?: boolean;
  idleSpeedApplied?: boolean;
  timeRemapPeriods?: TimeRemapPeriod[];
  transitionIn?: Transition;
  transitionOut?: Transition;
  introFadeMs?: number;
  outroFadeMs?: number;
  layout?: WebcamLayoutData;
}

export interface TimeRemapPeriod {
  sourceStartTime: number;
  sourceEndTime: number;
  speedMultiplier: number;
}

export type AudioEnhancementPreset = 'off' | 'subtle' | 'balanced' | 'broadcast' | 'custom';

export interface PlayerConfiguration {
  clips: Clip[];
  audioClips: Clip[];
  webcamClips: Clip[];
  recordings: Recording[];
  effects: Effect[];
  globalSkipRanges: import('@/types/skip-ranges').GlobalSkipRange[];
  videoWidth: number;
  videoHeight: number;
  fps: number;
  backgroundColor: string;
  enhanceAudio: boolean;
  cameraSettings: ProjectSettings['camera'];
  [key: string]: unknown;
}

export interface AudioEnhancementSettings {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
}

export interface ProjectSettings {
  resolution: { width: number; height: number };
  frameRate: number;
  backgroundColor: string;
  audio: {
    volume: number;
    muted: boolean;
    fadeInDuration: number;
    fadeOutDuration: number;
    enhanceAudio: boolean;
    enhancementPreset?: AudioEnhancementPreset;
    customEnhancement?: AudioEnhancementSettings;
  };
  camera: {
    motionBlurEnabled?: boolean;
    motionBlurIntensity?: number;
    motionBlurThreshold?: number;
    motionBlurEaseIn?: number;
    motionBlurEaseOut?: number;
    motionBlurGamma?: number;
    refocusBlurEnabled?: boolean;
    refocusBlurIntensity?: number;
    motionBlurSmoothWindow?: number;
    motionBlurRampRange?: number;
    motionBlurClamp?: number;
    motionBlurSamples?: number;
    motionBlurColorSpace?: 'srgb' | 'display-p3';
    motionBlurUnpackPremultiply?: boolean;
    motionBlurBlackLevel?: number;
    motionBlurForce?: boolean;
    motionBlurSaturation?: number;
    motionBlurUseWebglVideo?: boolean;
    cameraSmoothness?: number;
    cameraDynamics?: CameraDynamics;
  };
  canvas: CanvasSettings;
}

export type CameraSettings = NonNullable<ProjectSettings['camera']>;

export interface ExportPreset {
  id: string;
  name: string;
  format: ExportFormat;
  codec: string;
  quality: QualityLevel;
  resolution: { width: number; height: number };
  frameRate: number;
  bitrate?: number;
}

export type ExportStatus = 'idle' | 'preparing' | 'exporting' | 'complete' | 'error';

export interface CanvasSettings {
  aspectRatio: AspectRatioPreset;
  customWidth?: number;
  customHeight?: number;
}

export interface CameraDynamics {
  stiffness: number;
  damping: number;
  mass: number;
}
