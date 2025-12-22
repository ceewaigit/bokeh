/**
 * Types and interfaces for the recording strategy pattern.
 * This enables pluggable recording backends (Native ScreenCaptureKit, MediaRecorder, etc.)
 */

export type RecordingSourceType = 'screen' | 'window' | 'area'

/**
 * Configuration for starting a recording session.
 */
export interface RecordingConfig {
  /** The source ID (e.g., "screen:0:0", "window:123:0", "area:x,y,w,h") */
  sourceId: string
  /** The type of source being recorded */
  sourceType: RecordingSourceType
  /** Whether to capture audio */
  hasAudio: boolean
  /** Crop bounds for area selection (only for area type) */
  bounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  /** Display ID for the recording */
  displayId?: number
  /** Only record the application's own windows */
  onlySelf?: boolean
  /** Include app windows in screen recording (don't exclude them) */
  includeAppWindows?: boolean
  /** Reduce encoder buffering to lower memory usage */
  lowMemoryEncoder?: boolean
  /** Match macOS recorder defaults (codec/pixel format/realtime) */
  useMacOSDefaults?: boolean
  /** Target capture framerate */
  framerate?: number
}

/**
 * Result from stopping a recording session.
 */
export interface RecordingResult {
  /** Path to the recorded video file */
  videoPath: string
  /** Duration of the recording in milliseconds */
  duration: number
  /** Whether audio was captured */
  hasAudio: boolean
}

/**
 * Interface for recording strategy implementations.
 * Each strategy (Native, MediaRecorder) implements this interface.
 */
export interface RecordingStrategy {
  /** Human-readable name for the strategy (for logging) */
  readonly name: string

  /**
   * Checks if this recording strategy is available on the current system.
   * @returns Promise resolving to true if the strategy can be used
   */
  isAvailable(): Promise<boolean>

  /**
   * Starts recording with the given configuration.
   * @param config - Recording configuration
   * @throws Error if recording cannot be started
   */
  start(config: RecordingConfig): Promise<void>

  /**
   * Stops the current recording and returns the result.
   * @returns Promise resolving to the recording result
   * @throws Error if no recording is in progress
   */
  stop(): Promise<RecordingResult>

  /**
   * Pauses the current recording.
   * Not all strategies support pausing.
   */
  pause(): void

  /**
   * Resumes a paused recording.
   * Not all strategies support resuming.
   */
  resume(): void

  /**
   * Checks if a recording can be paused.
   */
  canPause(): boolean

  /**
   * Checks if a paused recording can be resumed.
   */
  canResume(): boolean

  /**
   * Checks if a recording is currently in progress.
   */
  isRecording(): boolean

  /**
   * Checks if the current recording is paused.
   */
  isPaused(): boolean
}
