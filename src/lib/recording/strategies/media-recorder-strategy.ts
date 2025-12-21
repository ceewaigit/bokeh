/**
 * Recording strategy using the Web MediaRecorder API.
 * Fallback for systems without native ScreenCaptureKit support.
 * Note: Cursor WILL be visible in recordings with this strategy.
 */

import { RecordingStrategy, RecordingConfig, RecordingResult } from '../types/recording-strategy'
import { RecordingIpcBridge, getRecordingBridge } from '@/lib/bridges'
import { logger } from '@/lib/utils/logger'

export class MediaRecorderStrategy implements RecordingStrategy {
  readonly name = 'MediaRecorder'

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
  private dataRequestInterval: NodeJS.Timeout | null = null

  constructor(bridge?: RecordingIpcBridge) {
    this.bridge = bridge ?? getRecordingBridge()
  }

  async isAvailable(): Promise<boolean> {
    if (typeof MediaRecorder === 'undefined') {
      return false
    }
    // Check that we can create temp files (basic API check)
    const result = await this.bridge.createTempRecordingFile('webm')
    return result.success || !!result.data
  }

  async start(config: RecordingConfig): Promise<void> {
    if (this._isRecording) {
      throw new Error('Already recording')
    }

    this.hasAudio = config.hasAudio

    logger.info(`[MediaRecorderStrategy] Starting ${config.sourceType} recording (audio: ${this.hasAudio})`)
    logger.warn('[MediaRecorderStrategy] Cursor WILL be visible in recording')

    // Get stream constraints from main process - still need window.electronAPI for getUserMedia constraints
    if (!window.electronAPI?.getDesktopStream) {
      throw new Error('Desktop stream API not available')
    }

    const constraints = await window.electronAPI.getDesktopStream(
      config.sourceId,
      this.hasAudio
    )

    // Acquire stream
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      logger.info('[MediaRecorderStrategy] Desktop capture stream acquired')

      // Log audio tracks
      const audioTracks = this.stream.getAudioTracks()
      if (audioTracks.length > 0) {
        logger.info(`[MediaRecorderStrategy] System audio captured: ${audioTracks.length} track(s)`)
      } else if (this.hasAudio) {
        logger.warn('[MediaRecorderStrategy] No audio tracks despite requesting audio')
      }

      // Monitor track state
      this.stream.getTracks().forEach(track => {
        track.onended = () => {
          logger.warn(`[MediaRecorderStrategy] Track ended: ${track.kind}`)
          if (track.kind === 'video' && this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.stop()
          }
        }
      })
    } catch (error) {
      logger.error('[MediaRecorderStrategy] getUserMedia failed:', error)
      throw new Error(`Failed to capture desktop: ${error}`)
    }

    // Create temp file for streaming
    const fileResult = await this.bridge.createTempRecordingFile('webm')
    if (!fileResult?.success || !fileResult.data) {
      throw new Error('Failed to create temp recording file')
    }

    this.recordingPath = fileResult.data
    logger.info(`[MediaRecorderStrategy] Streaming to: ${this.recordingPath}`)

    // Select best available codec
    const mimeType = this.selectMimeType()

    // Create MediaRecorder
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond: 5000000,
      ...(this.hasAudio ? { audioBitsPerSecond: 128000 } : {})
    })

    logger.info(`[MediaRecorderStrategy] Using codec: ${this.mediaRecorder.mimeType}`)

    // Set up data handling
    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data?.size > 0 && this.recordingPath) {
        const result = await this.bridge.appendToRecording(this.recordingPath, event.data)
        if (!result?.success) {
          logger.error('[MediaRecorderStrategy] Failed to stream chunk:', result?.error)
        }
      }
    }

    this.mediaRecorder.onerror = (event) => {
      logger.error('[MediaRecorderStrategy] Error:', event)
      if (this.mediaRecorder?.state === 'recording') {
        this.mediaRecorder.stop()
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

    logger.info('[MediaRecorderStrategy] Recording started')
  }

  async stop(): Promise<RecordingResult> {
    if (!this._isRecording || !this.mediaRecorder) {
      throw new Error('Not recording')
    }

    // Resume if paused for clean stop
    if (this._isPaused) {
      this.resume()
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
        logger.error('[MediaRecorderStrategy] Stop error:', error)
        reject(error)
      }

      try {
        this.mediaRecorder!.stop()
      } catch (e) {
        logger.error('[MediaRecorderStrategy] Error stopping:', e)
        reject(e)
      }
    })
  }

  pause(): void {
    if (!this._isRecording || this._isPaused || !this.mediaRecorder) {
      return
    }

    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
      this._isPaused = true
      this.pauseStartTime = Date.now()
      logger.info('[MediaRecorderStrategy] Recording paused')
    }
  }

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
      logger.info(`[MediaRecorderStrategy] Recording resumed. Paused for ${pausedDuration}ms`)
    }
  }

  canPause(): boolean {
    return this._isRecording && !this._isPaused
  }

  canResume(): boolean {
    return this._isRecording && this._isPaused
  }

  isRecording(): boolean {
    return this._isRecording
  }

  isPaused(): boolean {
    return this._isPaused
  }

  private selectMimeType(): string {
    const candidates = this.hasAudio
      ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8']
      : ['video/webm;codecs=vp8', 'video/webm;codecs=vp9']

    return candidates.find(mime => MediaRecorder.isTypeSupported(mime)) || 'video/webm'
  }

  private async finishRecording(): Promise<RecordingResult> {
    const duration = (Date.now() - this.startTime) - this.totalPausedDuration

    if (!this.recordingPath) {
      throw new Error('Recording path not available')
    }

    // Finalize the video file
    await this.bridge.finalizeRecording(this.recordingPath)

    const videoPath = this.recordingPath

    logger.info(`[MediaRecorderStrategy] Recording stopped: ${duration}ms, path: ${videoPath}`)

    // Cleanup
    this.cleanup()

    return {
      videoPath,
      duration,
      hasAudio: this.hasAudio
    }
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
  }
}

