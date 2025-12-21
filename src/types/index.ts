export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  status: 'idle' | 'preparing' | 'recording' | 'paused' | 'processing'
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

export interface RecordingSettings {
  area: RecordingArea
  audioInput: AudioInput
  quality: import('./project').QualityLevel
  framerate: 30 | 60
  format: import('./project').ExportFormat
  sourceId?: string // Specific source ID to record
  onlySelf?: boolean // Only record the application's own windows
  includeAppWindows?: boolean // Keep app windows visible during recording
  lowMemoryEncoder?: boolean // Reduce encoder buffering to lower memory usage
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
  BackgroundEffectData,
  ParallaxLayer,
  AnnotationData,
  ScreenEffectData,
  CaptureArea,
  TimeRemapPeriod
} from './project'

// Re-export enums
export {
  TrackType,
  TimelineTrackType,
  TransitionType,
  RecordingSourceType,
  ExportFormat,
  QualityLevel,
  BackgroundType,
  ScreenEffectPreset,
  AnnotationType,
  CursorStyle,
  ZoomFollowStrategy,
  KeystrokePosition
} from './project'

// Re-export effect types
export { EffectType } from './effects'

// Keyframe interface for animations
export interface KeyframeData {
  time: number
  value: any
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

// Export settings from separate file
export type { ExportSettings } from './export'

// Remotion composition types
export * from './remotion'
