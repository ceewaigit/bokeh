export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  duration: number
}

export enum RecordingArea {
  Fullscreen = 'fullscreen',
  Window = 'window',
  Region = 'region'
}

export enum AudioInput {
  System = 'system',
  Microphone = 'microphone',
  Both = 'both',
  None = 'none'
}

// Webcam recording configuration
export interface WebcamConfig {
  enabled: boolean
  deviceId: string
  resolution?: '720p' | '1080p' | '4k'
}

// Microphone recording configuration
export interface MicrophoneConfig {
  enabled: boolean
  deviceId: string
  echoCancellation?: boolean
  noiseSuppression?: boolean
}

// Session-specific settings managed by RecordingSessionStore
export interface SessionSettings {
  area: RecordingArea
  audioInput: AudioInput
  sourceId?: string
  webcam?: WebcamConfig
  microphone?: MicrophoneConfig
}

// Full settings payload sent to IPC (composed of SessionSettings + ProjectSettings)
export interface RecordingSettings extends SessionSettings {
  quality: import('./project').QualityLevel
  framerate: 30 | 60
  format: import('./project').ExportFormat
  onlySelf?: boolean // Only record the application's own windows
  includeAppWindows?: boolean // Keep app windows visible during recording
  lowMemoryEncoder?: boolean // Reduce encoder buffering to lower memory usage
  useMacOSDefaults?: boolean // Use hardware-friendly encoder settings (HEVC + YUV + realtime)
}

// Re-export from project.ts
export type {
  Project,
  Recording,
  RecordingMetadata,
  Clip,
  Clip as TimelineClip,
  ProjectSettings,
  CameraSettings,
  KeyboardEvent,
  MouseEvent,
  ClickEvent,
  ScrollEvent,
  ScreenEvent,
  Timeline,
  Track,
  Effect,
  Annotation,
  Transition,
  ExportPreset,
  ZoomBlock,
  ZoomEffectData,
  CursorEffectData,
  KeystrokeEffectData,
  SubtitleEffectData,
  SubtitleHighlightStyle,
  SubtitleEffect,
  BackgroundEffectData,
  ParallaxLayer,
  AnnotationData,
  ScreenEffectData,
  CaptureArea,
  TimeRemapPeriod,
  ImageSourceData,
  Transcript,
  TranscriptWord,
  TranscriptionStatus,
  SourceTimeRange,
  TranscriptEditState
} from './project'

// Re-export enums
export {
  TrackType,
  TimelineTrackType,
  TimelineItemType,
  TransitionType,
  RecordingSourceType,
  ExportFormat,
  QualityLevel,
  BackgroundType,
  ScreenEffectPreset,
  AnnotationType,
  CursorStyle,
  CursorTheme,
  ZoomFollowStrategy,
  KeystrokePosition
} from './project'

// Re-export effect types
export { EffectType } from '@/features/effects/types'
export { OverlayAnchor } from './overlays'
export type { BaseOverlayConfig } from './overlays'

// Keyframe interface for animations
export interface KeyframeData {
  time: number
  value: unknown
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

// Export settings from separate file
export type { ExportSettings } from './export'

// Remotion composition types
export * from './remotion'
