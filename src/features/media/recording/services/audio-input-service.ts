/**
 * Audio Input Service
 *
 * Handles microphone audio capture during screen recording sessions.
 * Provides audio level monitoring for UI feedback.
 */

import { RecordingIpcBridge, getRecordingBridge } from '@/features/core/bridges'
import { logger } from '@/shared/utils/logger'
import { getSharedAudioContext } from '@/shared/contexts/audio-context'
import {
  selectAudioMimeType,
  calculateDuration as calcDuration,
  calculateFinalDuration,
  cleanupStream,
  clearDataInterval as clearInterval,
  calculateTotalSegmentDuration,
  type RecordingTimingState
} from './media-recorder-utils'

export interface AudioInputConfig {
  deviceId: string
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  sampleRate?: number
  /** Pre-warmed stream to use instead of calling getUserMedia */
  prewarmedStream?: MediaStream
}

/**
 * An audio segment represents a continuous recording period.
 * Multiple segments are created when microphone is toggled on/off independently.
 */
export interface AudioSegment {
  id: string
  filePath: string
  startTimeOffsetMs: number  // Relative to main recording start
  durationMs: number
}

export interface AudioInputResult {
  /** Primary audio path (for backward compatibility, uses first segment) */
  audioPath: string
  /** Total duration across all segments */
  duration: number
  /** All recorded segments (may be multiple if toggle was used) */
  segments: AudioSegment[]
}

type AudioLevelCallback = (level: number) => void

export class AudioInputService {
  private bridge: RecordingIpcBridge
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private recordingPath: string | null = null
  private startTime = 0
  private _isRecording = false
  private _isPaused = false
  private pauseStartTime = 0
  private totalPausedDuration = 0
  private dataRequestInterval: NodeJS.Timeout | null = null
  private levelMonitorInterval: NodeJS.Timeout | null = null
  private levelCallbacks: Set<AudioLevelCallback> = new Set()
  private lastLevel = 0
  private levelDataArray: Uint8Array | null = null  // PERF: Reused buffer to avoid allocation every frame

  // Segment tracking for independent toggle on/off
  private segments: AudioSegment[] = []
  private currentSegmentStartTime = 0  // When current segment started (relative to main recording)
  private mainRecordingStartTime = 0   // When main recording started
  private coordinatedStopTime = 0      // Shared stop time for atomic sync with other services
  private _isToggledOff = false        // True when microphone is toggled off but stream is alive
  private lastConfig: AudioInputConfig | null = null  // Store config for resuming

  // Pause/resume operation tracking (for segment-based pause implementation)
  private pauseOperation: Promise<void> | null = null
  private resumeOperation: Promise<void> | null = null

  constructor(bridge?: RecordingIpcBridge) {
    this.bridge = bridge ?? getRecordingBridge()
  }

  /**
   * Set the main recording start time for segment offset calculation.
   * Call this right after starting the main screen recording.
   */
  setMainRecordingStartTime(time: number): void {
    this.mainRecordingStartTime = time
    logger.info(`[AudioInputService] Main recording start time set: ${time}`)
  }

  /**
   * Set coordinated stop time for atomic sync with other recording services.
   * Call this before stopping to ensure all services use the same stop timestamp.
   */
  setCoordinatedStopTime(time: number): void {
    this.coordinatedStopTime = time
  }

  /**
   * Check if audio input is available.
   */
  async isAvailable(): Promise<boolean> {
    if (typeof MediaRecorder === 'undefined') {
      return false
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return false
    }

    return true
  }

  /**
   * Start audio recording from microphone.
   */
  async start(config: AudioInputConfig): Promise<void> {
    if (this._isRecording) {
      throw new Error('Audio already recording')
    }

    logger.info(`[AudioInputService] Starting audio recording from device: ${config.deviceId}`)

    // Use pre-warmed stream if available, otherwise acquire new stream
    if (config.prewarmedStream && config.prewarmedStream.active) {
      logger.info('[AudioInputService] Using pre-warmed microphone stream')
      this.stream = config.prewarmedStream

      const audioTracks = this.stream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error('Pre-warmed stream has no audio tracks')
      }

      logger.info(`[AudioInputService] Pre-warmed stream: ${audioTracks.length} track(s)`)

      // Set up audio analysis for level monitoring
      this.setupAudioAnalysis()

      // Monitor track state
      this.stream.getTracks().forEach(track => {
        track.onended = () => {
          logger.warn('[AudioInputService] Audio track ended')
          if (this.mediaRecorder?.state === 'recording') {
            this.stop().catch(err => logger.error('[AudioInputService] Auto-stop failed:', err))
          }
        }
      })
    } else {
      // Build constraints for new stream acquisition
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: { exact: config.deviceId },
          echoCancellation: config.echoCancellation ?? true,
          noiseSuppression: config.noiseSuppression ?? true,
          autoGainControl: config.autoGainControl ?? true,
          sampleRate: config.sampleRate
        },
        video: false
      }

      // Acquire stream
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints)

        const audioTracks = this.stream.getAudioTracks()
        if (audioTracks.length === 0) {
          throw new Error('No audio tracks available')
        }

        logger.info(`[AudioInputService] Microphone stream acquired: ${audioTracks.length} track(s)`)

        // Set up audio analysis for level monitoring
        this.setupAudioAnalysis()

        // Monitor track state
        this.stream.getTracks().forEach(track => {
          track.onended = () => {
            logger.warn('[AudioInputService] Audio track ended')
            if (this.mediaRecorder?.state === 'recording') {
              this.stop().catch(err => logger.error('[AudioInputService] Auto-stop failed:', err))
            }
          }
        })
      } catch (error) {
        logger.error('[AudioInputService] getUserMedia failed:', error)
        throw new Error(`Failed to capture audio: ${error}`)
      }
    }

    // Create temp file for streaming
    const fileResult = await this.bridge.createTempRecordingFile('webm')
    if (!fileResult?.success || !fileResult.data) {
      this.cleanup()
      throw new Error('Failed to create temp audio recording file')
    }

    this.recordingPath = fileResult.data
    logger.info(`[AudioInputService] Streaming to: ${this.recordingPath}`)

    // Set up and start MediaRecorder
    this.setupMediaRecorder()
    logger.info(`[AudioInputService] Using codec: ${this.mediaRecorder!.mimeType}`)

    // Initialize recording state
    this.startTime = Date.now()
    this._isRecording = true
    this._isPaused = false
    this._isToggledOff = false
    this.totalPausedDuration = 0

    // Initialize segment tracking
    this.lastConfig = config
    this.segments = []
    this.currentSegmentStartTime = this.mainRecordingStartTime > 0
      ? Date.now() - this.mainRecordingStartTime
      : 0

    logger.info('[AudioInputService] Recording started')
  }

  /**
   * Stop audio recording and return the result.
   */
  async stop(): Promise<AudioInputResult> {
    if (!this._isRecording) {
      throw new Error('Audio not recording')
    }

    // Wait for any pending pause/resume operations
    if (this.pauseOperation) {
      logger.info('[AudioInputService] Waiting for pending pause operation...')
      await this.pauseOperation
      this.pauseOperation = null
    }
    if (this.resumeOperation) {
      logger.info('[AudioInputService] Waiting for pending resume operation...')
      await this.resumeOperation
      this.resumeOperation = null
    }

    // Clear intervals immediately at start to prevent timer loops even if errors occur
    this.clearDataInterval()
    this.cleanupAudioAnalysis()

    // If paused (segment already finalized), just return the collected segments
    if (this._isPaused || !this.mediaRecorder) {
      logger.info('[AudioInputService] Stopping from paused state (segments already finalized)')
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
        logger.error('[AudioInputService] Stop error:', error)
        reject(error)
      }

      try {
        this.mediaRecorder!.stop()
      } catch (e) {
        logger.error('[AudioInputService] Error stopping:', e)
        reject(e)
      }
    })
  }

  /**
   * Pause audio recording using segment-based approach.
   * This ends the current segment (finalizes file) and keeps stream alive.
   * More reliable than MediaRecorder.pause() which is unreliable across platforms.
   */
  pause(): void {
    if (!this._isRecording || this._isPaused || !this.mediaRecorder) {
      return
    }

    // Mark as paused immediately for UI consistency
    this._isPaused = true
    this.pauseStartTime = Date.now()
    logger.info('[AudioInputService] Recording pausing (segment-based)...')

    // Start async segment end operation
    this.pauseOperation = this.endSegmentForPause().catch(err => {
      logger.error('[AudioInputService] Error during pause segment end:', err)
      // Revert state on failure
      this._isPaused = false
    })
  }

  /**
   * Resume audio recording using segment-based approach.
   * Creates a new segment with accurate timing relative to main recording.
   */
  resume(): void {
    if (!this._isRecording || !this._isPaused) {
      return
    }

    const pausedDuration = Date.now() - this.pauseStartTime
    this.totalPausedDuration += pausedDuration
    logger.info(`[AudioInputService] Recording resuming (segment-based). Paused for ${pausedDuration}ms`)

    // Start async segment resume operation
    this.resumeOperation = this.startSegmentForResume().then(() => {
      this._isPaused = false
      this.pauseStartTime = 0
      logger.info('[AudioInputService] Recording resumed successfully')
    }).catch(err => {
      logger.error('[AudioInputService] Error during resume segment start:', err)
      // Keep paused state on failure
    })
  }

  /**
   * End the current segment by finalizing the recording file.
   * Unlike pause(), this stops recording to file and allows starting a new segment.
   * The stream is kept alive for quick restart.
   *
   * @returns The finalized segment, or null if not recording
   */
  async endSegment(): Promise<AudioSegment | null> {
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

          const segment: AudioSegment = {
            id: `audio-segment-${Date.now()}`,
            filePath: this.recordingPath || '',
            startTimeOffsetMs: this.currentSegmentStartTime,
            durationMs: segmentDuration
          }

          this.segments.push(segment)
          logger.info(`[AudioInputService] Segment ended: ${segmentDuration}ms at offset ${this.currentSegmentStartTime}ms`)

          // Mark as toggled off but keep stream alive for quick restart
          this._isToggledOff = true
          this.mediaRecorder = null
          this.recordingPath = null

          resolve(segment)
        } catch (err) {
          logger.error('[AudioInputService] Error ending segment:', err)
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
    logger.info(`[AudioInputService] New segment streaming to: ${this.recordingPath}`)

    // Set up and start MediaRecorder (reuses shared setup logic)
    this.setupMediaRecorder()

    // Initialize segment state
    this.startTime = Date.now()
    this._isToggledOff = false
    this._isPaused = false
    this.totalPausedDuration = 0

    // Calculate new segment start time relative to main recording
    this.currentSegmentStartTime = this.mainRecordingStartTime > 0
      ? Date.now() - this.mainRecordingStartTime
      : 0

    logger.info(`[AudioInputService] New segment started at offset ${this.currentSegmentStartTime}ms`)
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
      logger.warn('[AudioInputService] endSegmentForPause: No active recorder')
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

            const segment: AudioSegment = {
              id: `audio-segment-${Date.now()}`,
              filePath: this.recordingPath,
              startTimeOffsetMs: this.currentSegmentStartTime,
              durationMs: segmentDuration
            }

            this.segments.push(segment)
            logger.info(`[AudioInputService] Pause segment ended: ${segmentDuration}ms at offset ${this.currentSegmentStartTime}ms`)
          }

          // Mark as paused state (mediaRecorder null but stream alive)
          this.mediaRecorder = null
          this.recordingPath = null
          resolve()
        } catch (err) {
          logger.error('[AudioInputService] Error finalizing pause segment:', err)
          resolve()
        }
      }

      try {
        this.mediaRecorder.stop()
      } catch (err) {
        logger.error('[AudioInputService] Error stopping recorder for pause:', err)
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
    logger.info(`[AudioInputService] Resume segment streaming to: ${this.recordingPath}`)

    // Set up and start MediaRecorder
    this.setupMediaRecorder()

    // Initialize segment state - calculate start time relative to main recording
    this.startTime = Date.now()
    this.currentSegmentStartTime = this.mainRecordingStartTime > 0
      ? Date.now() - this.mainRecordingStartTime
      : 0

    logger.info(`[AudioInputService] Resume segment started at offset ${this.currentSegmentStartTime}ms`)
  }

  /**
   * Check if microphone is toggled off (segment ended, waiting for restart).
   */
  isToggledOff(): boolean {
    return this._isToggledOff
  }

  /**
   * Get the current recording duration in ms.
   */
  private getDuration(): number {
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

  /**
   * Get the current audio stream (for monitoring).
   */
  getStream(): MediaStream | null {
    return this.stream
  }

  /**
   * Get the current audio level (0-1).
   */
  getAudioLevel(): number {
    return this.lastLevel
  }

  /**
   * Subscribe to audio level changes.
   * Callback receives a level value from 0 to 1.
   */
  onAudioLevel(callback: AudioLevelCallback): () => void {
    this.levelCallbacks.add(callback)
    return () => {
      this.levelCallbacks.delete(callback)
    }
  }

  /**
   * Start monitoring audio levels without recording.
   * Useful for device selection UI.
   */
  async startMonitoring(deviceId: string): Promise<void> {
    if (this.stream) {
      this.stopMonitoring()
    }

    const constraints: MediaStreamConstraints = {
      audio: { deviceId: { exact: deviceId } },
      video: false
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.setupAudioAnalysis()
      logger.info('[AudioInputService] Audio monitoring started')
    } catch (error) {
      logger.error('[AudioInputService] Failed to start monitoring:', error)
      throw error
    }
  }

  /**
   * Stop monitoring audio levels.
   */
  stopMonitoring(): void {
    this.cleanupAudioAnalysis()
    if (this.stream && !this._isRecording) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    logger.info('[AudioInputService] Audio monitoring stopped')
  }

  isRecording(): boolean {
    return this._isRecording
  }

  isPaused(): boolean {
    return this._isPaused
  }

  private setupAudioAnalysis(): void {
    if (!this.stream) return

    try {
      const sharedContext = getSharedAudioContext()
      if (!sharedContext) {
        logger.warn('[AudioInputService] AudioContext unavailable, skipping level monitoring')
        return
      }

      this.audioContext = sharedContext
      const source = this.audioContext.createMediaStreamSource(this.stream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.8
      source.connect(this.analyser)
      this.source = source

      // Start level monitoring (visibility-aware to save battery)
      this.levelMonitorInterval = setInterval(() => {
        // Skip updates when tab is hidden or no listeners - saves CPU cycles
        if (document.hidden || this.levelCallbacks.size === 0) return
        this.updateAudioLevel()
      }, 50) // 20fps for level updates
    } catch (error) {
      logger.error('[AudioInputService] Failed to set up audio analysis:', error)
    }
  }

  private updateAudioLevel(): void {
    if (!this.analyser) {
      this.lastLevel = 0
      return
    }

    // PERF: Reuse buffer instead of allocating every frame (20fps = 20 allocations/sec avoided)
    const binCount = this.analyser.frequencyBinCount
    if (!this.levelDataArray || this.levelDataArray.length !== binCount) {
      this.levelDataArray = new Uint8Array(binCount)
    }
    this.analyser.getByteFrequencyData(this.levelDataArray)

    // Calculate RMS (root mean square) for more accurate level
    let sum = 0
    for (let i = 0; i < this.levelDataArray.length; i++) {
      sum += this.levelDataArray[i] * this.levelDataArray[i]
    }
    const rms = Math.sqrt(sum / this.levelDataArray.length)

    // Normalize to 0-1 range
    this.lastLevel = Math.min(1, rms / 128)

    // Notify listeners
    this.levelCallbacks.forEach(callback => {
      try {
        callback(this.lastLevel)
      } catch {
        // Ignore callback errors
      }
    })
  }

  private cleanupAudioAnalysis(): void {
    if (this.levelMonitorInterval) {
      clearInterval(this.levelMonitorInterval)
      this.levelMonitorInterval = null
    }

    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    this.audioContext = null

    this.analyser = null
    this.lastLevel = 0
    this.levelDataArray = null  // Release buffer
  }

  private selectMimeType(): string {
    return selectAudioMimeType()
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
      audioBitsPerSecond: 128000
    })

    // Set up data handling
    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data?.size > 0 && this.recordingPath) {
        const result = await this.bridge.appendToRecording(this.recordingPath, event.data)
        if (!result?.success) {
          logger.error('[AudioInputService] Failed to stream chunk:', result?.error)
        }
      }
    }

    this.mediaRecorder.onerror = (event) => {
      logger.error('[AudioInputService] Error:', event)
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
  private finishRecordingFromPausedState(): AudioInputResult {
    // Calculate total duration from all collected segments
    const totalDuration = calculateTotalSegmentDuration(this.segments)

    // Use first segment as primary audio path for backward compatibility
    const primaryAudioPath = this.segments.length > 0 ? this.segments[0].filePath : ''

    logger.info(`[AudioInputService] Recording stopped (from paused): ${this.segments.length} segment(s), total ${totalDuration}ms`)

    const result: AudioInputResult = {
      audioPath: primaryAudioPath,
      duration: totalDuration,
      segments: [...this.segments]
    }

    this.cleanup()

    return result
  }

  private async finishRecording(): Promise<AudioInputResult> {
    // Use coordinated stop time for atomic sync with other services
    const duration = calculateFinalDuration(
      this.startTime,
      this.coordinatedStopTime,
      this.totalPausedDuration
    )

    // Add final segment if there's an active recording path (not toggled off)
    if (this.recordingPath) {
      await this.bridge.finalizeRecording(this.recordingPath)

      const finalSegment: AudioSegment = {
        id: `audio-segment-${Date.now()}`,
        filePath: this.recordingPath,
        startTimeOffsetMs: this.currentSegmentStartTime,
        durationMs: duration
      }

      this.segments.push(finalSegment)
      logger.info(`[AudioInputService] Final segment: ${duration}ms at offset ${this.currentSegmentStartTime}ms`)
    }

    // Calculate total duration from all segments
    const totalDuration = calculateTotalSegmentDuration(this.segments)

    // Use first segment as primary audio path for backward compatibility
    const primaryAudioPath = this.segments.length > 0 ? this.segments[0].filePath : ''

    logger.info(`[AudioInputService] Recording stopped: ${this.segments.length} segment(s), total ${totalDuration}ms`)

    const result: AudioInputResult = {
      audioPath: primaryAudioPath,
      duration: totalDuration,
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
    this.cleanupAudioAnalysis()

    cleanupStream(this.stream)
    this.stream = null

    this.mediaRecorder = null
    this.recordingPath = null
    this._isRecording = false
    this._isPaused = false
    this._isToggledOff = false

    // Reset segment tracking
    this.segments = []
    this.currentSegmentStartTime = 0
    this.coordinatedStopTime = 0
    this.lastConfig = null
  }
}

// Singleton instance for convenience
let audioInputServiceInstance: AudioInputService | null = null

export function getAudioInputService(): AudioInputService {
  if (!audioInputServiceInstance) {
    audioInputServiceInstance = new AudioInputService()
  }
  return audioInputServiceInstance
}
