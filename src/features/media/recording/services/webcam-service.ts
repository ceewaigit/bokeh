/**
 * Webcam Recording Service
 *
 * Handles webcam capture during screen recording sessions.
 * Uses MediaRecorder API to stream webcam video to a temp file.
 */

import { RecordingIpcBridge, getRecordingBridge } from '@/features/core/bridges'
import { logger } from '@/shared/utils/logger'
import {
  selectVideoMimeType,
  calculateDuration as calcDuration,
  calculateFinalDuration,
  cleanupStream,
  setupTrackMonitoring as _setupTrackMonitoring,
  clearDataInterval as clearInterval,
  calculateTotalSegmentDuration,
  type RecordingTimingState
} from './media-recorder-utils'

export interface WebcamRecordingConfig {
  deviceId: string
  width?: number
  height?: number
  frameRate?: number
  includeMicrophone?: boolean
  microphoneDeviceId?: string
  /** Pre-warmed stream to use instead of calling getUserMedia */
  prewarmedStream?: MediaStream
  /** Pre-warmed dimensions if stream was pre-acquired */
  prewarmedDimensions?: { width: number; height: number }
}

/**
 * A webcam segment represents a continuous recording period.
 * Multiple segments are created when webcam is paused/resumed independently.
 */
export interface WebcamSegment {
  videoPath: string
  startTimeOffsetMs: number  // Relative to main recording start
  durationMs: number
  width: number
  height: number
  hasAudio: boolean
}

export interface WebcamRecordingResult {
  /** Primary video path (for backward compatibility, uses first segment) */
  videoPath: string
  duration: number
  width: number
  height: number
  hasAudio: boolean
  /** All recorded segments (may be multiple if pause/resume was used) */
  segments: WebcamSegment[]
}

type WebcamStateCallback = (state: {
  isRecording: boolean
  isPaused: boolean
  duration: number
}) => void

export class WebcamService {
  private bridge: RecordingIpcBridge
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private recordingPath: string | null = null
  private startTime = 0
  private _isRecording = false
  private _isPaused = false
  private pauseStartTime = 0
  private totalPausedDuration = 0
  private hasAudio = false
  private actualWidth = 0
  private actualHeight = 0
  private dataRequestInterval: NodeJS.Timeout | null = null
  private stateCallbacks: Set<WebcamStateCallback> = new Set()

  // Segment tracking for independent toggle on/off
  private segments: WebcamSegment[] = []
  private segmentStartTime = 0  // When current segment started (relative to main recording)
  private mainRecordingStartTime = 0  // When main recording started
  private coordinatedStopTime = 0  // Shared stop time for atomic sync with other services
  private lastConfig: WebcamRecordingConfig | null = null  // Store config for resume
  private _isToggledOff = false  // True when webcam is toggled off but stream is alive

  // Pause/resume operation tracking (for segment-based pause implementation)
  private pauseOperation: Promise<void> | null = null
  private resumeOperation: Promise<void> | null = null

  constructor(bridge?: RecordingIpcBridge) {
    this.bridge = bridge ?? getRecordingBridge()
  }

  /**
   * Check if webcam recording is available.
   */
  async isAvailable(): Promise<boolean> {
    if (typeof MediaRecorder === 'undefined') {
      return false
    }

    // Check that we have getUserMedia
    if (!navigator.mediaDevices?.getUserMedia) {
      return false
    }

    return true
  }

  /**
   * Start webcam recording.
   */
  async start(config: WebcamRecordingConfig): Promise<void> {
    if (this._isRecording) {
      throw new Error('Webcam already recording')
    }

    const width = config.width ?? 1280
    const height = config.height ?? 720
    const frameRate = config.frameRate ?? 30
    this.hasAudio = config.includeMicrophone ?? false

    logger.info(`[WebcamService] Starting webcam recording (${width}x${height}@${frameRate}fps, audio: ${this.hasAudio})`)

    // Use pre-warmed stream if available, otherwise acquire new stream
    if (config.prewarmedStream && config.prewarmedStream.active) {
      logger.info('[WebcamService] Using pre-warmed webcam stream')
      this.stream = config.prewarmedStream

      // Use pre-warmed dimensions if provided, otherwise extract from stream
      if (config.prewarmedDimensions) {
        this.actualWidth = config.prewarmedDimensions.width
        this.actualHeight = config.prewarmedDimensions.height
      } else {
        const videoTrack = this.stream.getVideoTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          this.actualWidth = settings.width ?? width
          this.actualHeight = settings.height ?? height
        }
      }
      logger.info(`[WebcamService] Pre-warmed stream dimensions: ${this.actualWidth}x${this.actualHeight}`)

      // Check for audio tracks in pre-warmed stream
      const audioTracks = this.stream.getAudioTracks()
      if (audioTracks.length > 0) {
        this.hasAudio = true
      }

      // Monitor track state
      this.stream.getTracks().forEach(track => {
        track.onended = () => {
          logger.warn(`[WebcamService] Track ended: ${track.kind}`)
          if (track.kind === 'video' && this.mediaRecorder?.state === 'recording') {
            this.stop().catch(err => logger.error('[WebcamService] Auto-stop failed:', err))
          }
        }
      })
    } else {
      // Build constraints for new stream acquisition
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: config.deviceId },
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: frameRate }
        },
        audio: this.hasAudio
          ? (config.microphoneDeviceId
            ? { deviceId: { exact: config.microphoneDeviceId } }
            : true)
          : false
      }

      // Acquire stream
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints)

        // Get actual dimensions from video track
        const videoTrack = this.stream.getVideoTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          this.actualWidth = settings.width ?? width
          this.actualHeight = settings.height ?? height
          logger.info(`[WebcamService] Webcam stream acquired: ${this.actualWidth}x${this.actualHeight}`)
        }

        // Log audio tracks
        const audioTracks = this.stream.getAudioTracks()
        if (audioTracks.length > 0) {
          logger.info(`[WebcamService] Microphone captured: ${audioTracks.length} track(s)`)
          this.hasAudio = true
        } else if (config.includeMicrophone) {
          logger.warn('[WebcamService] No microphone tracks despite requesting audio')
          this.hasAudio = false
        }

        // Monitor track state
        this.stream.getTracks().forEach(track => {
          track.onended = () => {
            logger.warn(`[WebcamService] Track ended: ${track.kind}`)
            if (track.kind === 'video' && this.mediaRecorder?.state === 'recording') {
              this.stop().catch(err => logger.error('[WebcamService] Auto-stop failed:', err))
            }
          }
        })
      } catch (error) {
        logger.error('[WebcamService] getUserMedia failed:', error)
        throw new Error(`Failed to capture webcam: ${error}`)
      }
    }

    // Create temp file for streaming
    const fileResult = await this.bridge.createTempRecordingFile('webm')
    if (!fileResult?.success || !fileResult.data) {
      this.cleanup()
      throw new Error('Failed to create temp webcam recording file')
    }

    this.recordingPath = fileResult.data
    logger.info(`[WebcamService] Streaming to: ${this.recordingPath}`)

    // Set up and start MediaRecorder
    this.setupMediaRecorder()
    logger.info(`[WebcamService] Using codec: ${this.mediaRecorder!.mimeType}`)

    // Initialize recording state
    this.startTime = Date.now()
    this._isRecording = true
    this._isPaused = false
    this._isToggledOff = false
    this.totalPausedDuration = 0

    // Initialize segment tracking
    this.lastConfig = config
    this.segments = []
    this.segmentStartTime = this.mainRecordingStartTime > 0
      ? Date.now() - this.mainRecordingStartTime
      : 0

    this.notifyStateChange()
    logger.info('[WebcamService] Recording started')
  }

  /**
   * Set the main recording start time for segment offset calculation.
   * Call this right after starting the main screen recording.
   */
  setMainRecordingStartTime(time: number): void {
    this.mainRecordingStartTime = time
    logger.info(`[WebcamService] Main recording start time set: ${time}`)
  }

  /**
   * Set coordinated stop time for atomic sync with other recording services.
   * Call this before stopping to ensure all services use the same stop timestamp.
   */
  setCoordinatedStopTime(time: number): void {
    this.coordinatedStopTime = time
  }

  /**
   * Stop webcam recording and return the result.
   */
  async stop(): Promise<WebcamRecordingResult> {
    if (!this._isRecording) {
      throw new Error('Webcam not recording')
    }

    // Wait for any pending pause/resume operations
    if (this.pauseOperation) {
      logger.info('[WebcamService] Waiting for pending pause operation...')
      await this.pauseOperation
      this.pauseOperation = null
    }
    if (this.resumeOperation) {
      logger.info('[WebcamService] Waiting for pending resume operation...')
      await this.resumeOperation
      this.resumeOperation = null
    }

    // Clear the data request interval immediately to prevent timer loops
    this.clearDataInterval()

    // If paused (segment already finalized), just return the collected segments
    if (this._isPaused || !this.mediaRecorder) {
      logger.info('[WebcamService] Stopping from paused state (segments already finalized)')
      return this.finishRecordingFromPausedState()
    }

    return new Promise((resolve, reject) => {
      // Handle already inactive recorder
      if (this.mediaRecorder!.state === 'inactive') {
        this.finishRecording().then(resolve).catch(reject)
        return
      }

      this.mediaRecorder!.onstop = async () => {
        try {
          const result = await this.finishRecording()
          resolve(result)
        } catch (err) {
          reject(err)
        }
      }

      this.mediaRecorder!.onerror = (error) => {
        logger.error('[WebcamService] Stop error:', error)
        reject(error)
      }

      try {
        this.mediaRecorder!.stop()
      } catch (error) {
        logger.error('[WebcamService] Error stopping:', error)
        reject(error)
      }
    })
  }

  /**
   * Pause webcam recording using segment-based approach.
   * This ends the current segment (finalizes file) and keeps stream alive for preview.
   * More reliable than MediaRecorder.pause() which is unreliable across platforms.
   */
  pause(): void {
    if (!this._isRecording || this._isPaused || !this.mediaRecorder) {
      return
    }

    // Mark as paused immediately for UI consistency
    this._isPaused = true
    this.pauseStartTime = Date.now()
    this.notifyStateChange()
    logger.info('[WebcamService] Recording pausing (segment-based)...')

    // Start async segment end operation
    this.pauseOperation = this.endSegmentForPause().catch(err => {
      logger.error('[WebcamService] Error during pause segment end:', err)
      // Revert state on failure
      this._isPaused = false
      this.notifyStateChange()
    })
  }

  /**
   * Resume webcam recording using segment-based approach.
   * Creates a new segment with accurate timing relative to main recording.
   */
  resume(): void {
    if (!this._isRecording || !this._isPaused) {
      return
    }

    const pausedDuration = Date.now() - this.pauseStartTime
    this.totalPausedDuration += pausedDuration
    logger.info(`[WebcamService] Recording resuming (segment-based). Paused for ${pausedDuration}ms`)

    // Start async segment resume operation
    this.resumeOperation = this.startSegmentForResume().then(() => {
      this._isPaused = false
      this.pauseStartTime = 0
      this.notifyStateChange()
      logger.info('[WebcamService] Recording resumed successfully')
    }).catch(err => {
      logger.error('[WebcamService] Error during resume segment start:', err)
      // Keep paused state on failure
    })
  }

  /**
   * End the current segment by finalizing the recording file.
   * Unlike pause(), this stops recording to file and allows starting a new segment.
   * The stream is kept alive for preview and quick restart.
   *
   * @returns The finalized segment, or null if not recording
   */
  async endSegment(): Promise<WebcamSegment | null> {
    if (!this._isRecording || !this.mediaRecorder || this._isToggledOff) {
      return null
    }

    // If paused via standard pause, resume first
    if (this._isPaused) {
      this.resume()
    }

    // Calculate segment duration before stopping
    const segmentDuration = this.getDuration()

    // Clear data request interval
    this.clearDataInterval()

    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null)
        return
      }

      this.mediaRecorder.onstop = async () => {
        try {
          // Finalize the current segment file
          if (this.recordingPath) {
            await this.bridge.finalizeRecording(this.recordingPath)
          }

          const segment: WebcamSegment = {
            videoPath: this.recordingPath || '',
            startTimeOffsetMs: this.segmentStartTime,
            durationMs: segmentDuration,
            width: this.actualWidth,
            height: this.actualHeight,
            hasAudio: this.hasAudio
          }

          this.segments.push(segment)
          logger.info(`[WebcamService] Segment ended: ${segmentDuration}ms at offset ${this.segmentStartTime}ms`)

          // Mark as toggled off but keep stream alive for preview
          this._isToggledOff = true
          this.mediaRecorder = null
          this.recordingPath = null
          this.notifyStateChange()

          resolve(segment)
        } catch (err) {
          logger.error('[WebcamService] Error ending segment:', err)
          resolve(null)
        }
      }

      try {
        this.mediaRecorder.stop()
      } catch {
        resolve(null)
      }
    })
  }

  /**
   * Start a new segment after endSegment().
   * Creates a new temp file and MediaRecorder with the same config.
   */
  async startNewSegment(): Promise<void> {
    if (!this.stream || !this.lastConfig) {
      throw new Error('Cannot start segment: no active stream or config')
    }

    if (!this._isToggledOff) {
      throw new Error('Cannot start segment: not toggled off')
    }

    // Create new temp file for the new segment
    const fileResult = await this.bridge.createTempRecordingFile('webm')
    if (!fileResult?.success || !fileResult.data) {
      throw new Error('Failed to create temp file for new segment')
    }

    this.recordingPath = fileResult.data
    logger.info(`[WebcamService] New segment streaming to: ${this.recordingPath}`)

    // Set up and start MediaRecorder (reuses shared setup logic)
    this.setupMediaRecorder()

    // Initialize segment state
    this.startTime = Date.now()
    this._isToggledOff = false
    this._isPaused = false
    this.totalPausedDuration = 0

    // Calculate new segment start time relative to main recording
    this.segmentStartTime = this.mainRecordingStartTime > 0
      ? Date.now() - this.mainRecordingStartTime
      : 0

    this.notifyStateChange()
    logger.info(`[WebcamService] New segment started at offset ${this.segmentStartTime}ms`)
  }

  /**
   * End segment specifically for pause operation.
   * Similar to endSegment() but keeps recording state as paused (not toggled off).
   */
  private async endSegmentForPause(): Promise<void> {
    // Wait for any pending resume operation first
    if (this.resumeOperation) {
      await this.resumeOperation
      this.resumeOperation = null
    }

    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      logger.warn('[WebcamService] endSegmentForPause: No active recorder')
      return
    }

    const segmentDuration = this.getDuration()
    this.clearDataInterval()

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve()
        return
      }

      this.mediaRecorder.onstop = async () => {
        try {
          if (this.recordingPath) {
            await this.bridge.finalizeRecording(this.recordingPath)

            const segment: WebcamSegment = {
              videoPath: this.recordingPath,
              startTimeOffsetMs: this.segmentStartTime,
              durationMs: segmentDuration,
              width: this.actualWidth,
              height: this.actualHeight,
              hasAudio: this.hasAudio
            }

            this.segments.push(segment)
            logger.info(`[WebcamService] Pause segment ended: ${segmentDuration}ms at offset ${this.segmentStartTime}ms`)
          }

          // Mark as paused state (mediaRecorder null but stream alive)
          this.mediaRecorder = null
          this.recordingPath = null
          resolve()
        } catch (err) {
          logger.error('[WebcamService] Error finalizing pause segment:', err)
          resolve()
        }
      }

      try {
        this.mediaRecorder.stop()
      } catch (err) {
        logger.error('[WebcamService] Error stopping recorder for pause:', err)
        resolve()
      }
    })
  }

  /**
   * Start a new segment specifically for resume operation.
   * Similar to startNewSegment() but works from paused state (not toggled off).
   */
  private async startSegmentForResume(): Promise<void> {
    // Wait for any pending pause operation first
    if (this.pauseOperation) {
      await this.pauseOperation
      this.pauseOperation = null
    }

    if (!this.stream || !this.lastConfig) {
      throw new Error('Cannot resume segment: no active stream or config')
    }

    // Create new temp file for the new segment
    const fileResult = await this.bridge.createTempRecordingFile('webm')
    if (!fileResult?.success || !fileResult.data) {
      throw new Error('Failed to create temp file for resume segment')
    }

    this.recordingPath = fileResult.data
    logger.info(`[WebcamService] Resume segment streaming to: ${this.recordingPath}`)

    // Set up and start MediaRecorder
    this.setupMediaRecorder()

    // Initialize segment state - calculate start time relative to main recording
    this.startTime = Date.now()
    this.segmentStartTime = this.mainRecordingStartTime > 0
      ? Date.now() - this.mainRecordingStartTime
      : 0

    logger.info(`[WebcamService] Resume segment started at offset ${this.segmentStartTime}ms`)
  }

  /**
   * Check if webcam is toggled off (segment ended, waiting for restart).
   */
  isToggledOff(): boolean {
    return this._isToggledOff
  }

  /**
   * Get the current stream (for preview during recording).
   */
  getStream(): MediaStream | null {
    return this.stream
  }

  /**
   * Get the current recording duration in ms.
   */
  getDuration(): number {
    return calcDuration(this.getTimingState())
  }

  /**
   * Get timing state for duration calculation.
   */
  private getTimingState(): RecordingTimingState {
    return {
      startTime: this.startTime,
      isRecording: this._isRecording,
      isPaused: this._isPaused,
      pauseStartTime: this.pauseStartTime,
      totalPausedDuration: this.totalPausedDuration
    }
  }

  isRecording(): boolean {
    return this._isRecording
  }

  isPaused(): boolean {
    return this._isPaused
  }

  /**
   * Subscribe to state changes.
   */
  onStateChange(callback: WebcamStateCallback): () => void {
    this.stateCallbacks.add(callback)
    return () => {
      this.stateCallbacks.delete(callback)
    }
  }

  private selectMimeType(): string {
    return selectVideoMimeType(this.hasAudio)
  }

  /**
   * Set up MediaRecorder with data handlers and start recording.
   * Shared logic between start() and startNewSegment().
   */
  private setupMediaRecorder(): void {
    if (!this.stream || !this.recordingPath) {
      throw new Error('Cannot setup recorder: no stream or recording path')
    }

    const mimeType = this.selectMimeType()
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond: 2500000,
      ...(this.hasAudio ? { audioBitsPerSecond: 128000 } : {})
    })

    // Set up data handling
    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data?.size > 0 && this.recordingPath) {
        const result = await this.bridge.appendToRecording(this.recordingPath, event.data)
        if (!result?.success) {
          logger.error('[WebcamService] Failed to stream chunk:', result?.error)
        }
      }
    }

    this.mediaRecorder.onerror = (event) => {
      logger.error('[WebcamService] Error:', event)
    }

    // Start recording
    this.mediaRecorder.start()

    // Start data request interval
    this.dataRequestInterval = setInterval(() => {
      if (this.mediaRecorder?.state === 'recording') {
        try {
          this.mediaRecorder.requestData()
        } catch {
          this.clearDataInterval()
        }
      }
    }, 1000)
  }

  /**
   * Finish recording when already in paused state.
   * Segments are already finalized during pause, so just return them.
   */
  private finishRecordingFromPausedState(): WebcamRecordingResult {
    // Calculate total duration from all collected segments
    const totalDuration = calculateTotalSegmentDuration(this.segments)

    // Use first segment as primary video path for backward compatibility
    const primaryVideoPath = this.segments.length > 0 ? this.segments[0].videoPath : ''

    logger.info(`[WebcamService] Recording stopped (from paused): ${this.segments.length} segment(s), total ${totalDuration}ms`)

    const result: WebcamRecordingResult = {
      videoPath: primaryVideoPath,
      duration: totalDuration,
      width: this.actualWidth,
      height: this.actualHeight,
      hasAudio: this.hasAudio,
      segments: [...this.segments]
    }

    this.cleanup()

    return result
  }

  private async finishRecording(): Promise<WebcamRecordingResult> {
    // Use coordinated stop time for atomic sync with other services
    const duration = calculateFinalDuration(
      this.startTime,
      this.coordinatedStopTime,
      this.totalPausedDuration
    )

    // Add final segment if there's an active recording path
    if (this.recordingPath) {
      await this.bridge.finalizeRecording(this.recordingPath)

      const finalSegment: WebcamSegment = {
        videoPath: this.recordingPath,
        startTimeOffsetMs: this.segmentStartTime,
        durationMs: duration,
        width: this.actualWidth,
        height: this.actualHeight,
        hasAudio: this.hasAudio
      }

      this.segments.push(finalSegment)
      logger.info(`[WebcamService] Final segment: ${duration}ms at offset ${this.segmentStartTime}ms`)
    }

    // Calculate total duration from all segments
    const totalDuration = calculateTotalSegmentDuration(this.segments)

    // Use first segment as primary video path for backward compatibility
    const primaryVideoPath = this.segments.length > 0 ? this.segments[0].videoPath : ''

    logger.info(`[WebcamService] Recording stopped: ${this.segments.length} segment(s), total ${totalDuration}ms`)

    const result: WebcamRecordingResult = {
      videoPath: primaryVideoPath,
      duration: totalDuration,
      width: this.actualWidth,
      height: this.actualHeight,
      hasAudio: this.hasAudio,
      segments: [...this.segments]
    }

    this.cleanup()

    return result
  }

  private clearDataInterval(): void {
    this.dataRequestInterval = clearInterval(this.dataRequestInterval)
  }

  private cleanup(): void {
    this.clearDataInterval()

    cleanupStream(this.stream)
    this.stream = null

    this.mediaRecorder = null
    this.recordingPath = null
    this._isRecording = false
    this._isPaused = false
    this._isToggledOff = false

    // Reset segment tracking
    this.segments = []
    this.segmentStartTime = 0
    this.coordinatedStopTime = 0
    this.lastConfig = null

    this.notifyStateChange()
  }

  private notifyStateChange(): void {
    const state = {
      isRecording: this._isRecording,
      isPaused: this._isPaused,
      duration: this.getDuration()
    }
    this.stateCallbacks.forEach(callback => {
      try {
        callback(state)
      } catch (err) {
        logger.error('[WebcamService] State callback error:', err)
      }
    })
  }
}

// Singleton instance for convenience
let webcamServiceInstance: WebcamService | null = null

export function getWebcamService(): WebcamService {
  if (!webcamServiceInstance) {
    webcamServiceInstance = new WebcamService()
  }
  return webcamServiceInstance
}
