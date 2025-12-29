/**
 * Webcam Recording Service
 *
 * Handles webcam capture during screen recording sessions.
 * Uses MediaRecorder API to stream webcam video to a temp file.
 */

import { RecordingIpcBridge, getRecordingBridge } from '@/lib/bridges'
import { logger } from '@/lib/utils/logger'

export interface WebcamRecordingConfig {
  deviceId: string
  width?: number
  height?: number
  frameRate?: number
  includeMicrophone?: boolean
  microphoneDeviceId?: string
}

export interface WebcamRecordingResult {
  videoPath: string
  duration: number
  width: number
  height: number
  hasAudio: boolean
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

    // Build constraints
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

    // Create temp file for streaming
    const fileResult = await this.bridge.createTempRecordingFile('webm')
    if (!fileResult?.success || !fileResult.data) {
      this.cleanup()
      throw new Error('Failed to create temp webcam recording file')
    }

    this.recordingPath = fileResult.data
    logger.info(`[WebcamService] Streaming to: ${this.recordingPath}`)

    // Select best available codec
    const mimeType = this.selectMimeType()

    // Create MediaRecorder
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond: 2500000, // Lower bitrate for webcam (2.5 Mbps)
      ...(this.hasAudio ? { audioBitsPerSecond: 128000 } : {})
    })

    logger.info(`[WebcamService] Using codec: ${this.mediaRecorder.mimeType}`)

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
      if (this.mediaRecorder?.state === 'recording') {
        this.stop().catch(() => { })
      }
    }

    // Start recording
    this.mediaRecorder.start()
    this.startTime = Date.now()
    this._isRecording = true
    this._isPaused = false
    this.totalPausedDuration = 0

    // Periodically request data for streaming
    this.dataRequestInterval = setInterval(() => {
      if (this.mediaRecorder?.state === 'recording') {
        try {
          this.mediaRecorder.requestData()
        } catch (e) {
          this.clearDataInterval()
        }
      }
    }, 1000)

    this.notifyStateChange()
    logger.info('[WebcamService] Recording started')
  }

  /**
   * Stop webcam recording and return the result.
   */
  async stop(): Promise<WebcamRecordingResult> {
    if (!this._isRecording || !this.mediaRecorder) {
      throw new Error('Webcam not recording')
    }

    // Resume if paused for clean stop
    if (this._isPaused) {
      this.resume()
    }

    // Clear the data request interval immediately to prevent timer loops
    this.clearDataInterval()

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
   * Pause webcam recording.
   */
  pause(): void {
    if (!this._isRecording || this._isPaused || !this.mediaRecorder) {
      return
    }

    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
      this._isPaused = true
      this.pauseStartTime = Date.now()
      this.notifyStateChange()
      logger.info('[WebcamService] Recording paused')
    }
  }

  /**
   * Resume webcam recording.
   */
  resume(): void {
    if (!this._isRecording || !this._isPaused || !this.mediaRecorder) {
      return
    }

    if (this.mediaRecorder.state === 'paused') {
      const pausedDuration = Date.now() - this.pauseStartTime
      this.totalPausedDuration += pausedDuration

      this.mediaRecorder.resume()
      this._isPaused = false
      this.pauseStartTime = 0
      this.notifyStateChange()
      logger.info(`[WebcamService] Recording resumed. Paused for ${pausedDuration}ms`)
    }
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
    if (!this._isRecording) return 0
    const elapsed = Date.now() - this.startTime
    const pausedNow = this._isPaused ? (Date.now() - this.pauseStartTime) : 0
    return elapsed - this.totalPausedDuration - pausedNow
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
    const candidates = this.hasAudio
      ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8']
      : ['video/webm;codecs=vp8', 'video/webm;codecs=vp9']

    return candidates.find(mime => MediaRecorder.isTypeSupported(mime)) || 'video/webm'
  }

  private async finishRecording(): Promise<WebcamRecordingResult> {
    const duration = this.getDuration()

    if (!this.recordingPath) {
      throw new Error('Webcam recording path not available')
    }

    // Finalize the video file
    await this.bridge.finalizeRecording(this.recordingPath)

    const videoPath = this.recordingPath

    logger.info(`[WebcamService] Recording stopped: ${duration}ms, path: ${videoPath}`)

    const result: WebcamRecordingResult = {
      videoPath,
      duration,
      width: this.actualWidth,
      height: this.actualHeight,
      hasAudio: this.hasAudio
    }

    // Cleanup
    this.cleanup()

    return result
  }

  private clearDataInterval(): void {
    if (this.dataRequestInterval) {
      clearInterval(this.dataRequestInterval)
      this.dataRequestInterval = null
    }
  }

  private cleanup(): void {
    this.clearDataInterval()

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    this.mediaRecorder = null
    this.recordingPath = null
    this._isRecording = false
    this._isPaused = false
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
