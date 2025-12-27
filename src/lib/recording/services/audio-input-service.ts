/**
 * Audio Input Service
 *
 * Handles microphone audio capture during screen recording sessions.
 * Provides audio level monitoring for UI feedback.
 */

import { RecordingIpcBridge, getRecordingBridge } from '@/lib/bridges'
import { logger } from '@/lib/utils/logger'
import { getSharedAudioContext } from '@/lib/audio/shared-audio-context'

export interface AudioInputConfig {
  deviceId: string
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  sampleRate?: number
}

export interface AudioInputResult {
  audioPath: string
  duration: number
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

  constructor(bridge?: RecordingIpcBridge) {
    this.bridge = bridge ?? getRecordingBridge()
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

    // Build constraints
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

    // Create temp file for streaming
    const fileResult = await this.bridge.createTempRecordingFile('webm')
    if (!fileResult?.success || !fileResult.data) {
      this.cleanup()
      throw new Error('Failed to create temp audio recording file')
    }

    this.recordingPath = fileResult.data
    logger.info(`[AudioInputService] Streaming to: ${this.recordingPath}`)

    // Select audio codec
    const mimeType = this.selectMimeType()

    // Create MediaRecorder
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      audioBitsPerSecond: 128000
    })

    logger.info(`[AudioInputService] Using codec: ${this.mediaRecorder.mimeType}`)

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

    logger.info('[AudioInputService] Recording started')
  }

  /**
   * Stop audio recording and return the result.
   */
  async stop(): Promise<AudioInputResult> {
    if (!this._isRecording || !this.mediaRecorder) {
      throw new Error('Audio not recording')
    }

    // Resume if paused for clean stop
    if (this._isPaused) {
      this.resume()
    }

    // Clear intervals immediately to prevent timer loops
    this.clearDataInterval()
    this.cleanupAudioAnalysis()

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
   * Pause audio recording.
   */
  pause(): void {
    if (!this._isRecording || this._isPaused || !this.mediaRecorder) {
      return
    }

    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
      this._isPaused = true
      this.pauseStartTime = Date.now()
      logger.info('[AudioInputService] Recording paused')
    }
  }

  /**
   * Resume audio recording.
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
      logger.info(`[AudioInputService] Recording resumed. Paused for ${pausedDuration}ms`)
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

      // Start level monitoring
      this.levelMonitorInterval = setInterval(() => {
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

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(dataArray)

    // Calculate RMS (root mean square) for more accurate level
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i]
    }
    const rms = Math.sqrt(sum / dataArray.length)

    // Normalize to 0-1 range
    this.lastLevel = Math.min(1, rms / 128)

    // Notify listeners
    this.levelCallbacks.forEach(callback => {
      try {
        callback(this.lastLevel)
      } catch (err) {
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
  }

  private selectMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus'
    ]

    return candidates.find(mime => MediaRecorder.isTypeSupported(mime)) || 'audio/webm'
  }

  private async finishRecording(): Promise<AudioInputResult> {
    const duration = (Date.now() - this.startTime) - this.totalPausedDuration

    if (!this.recordingPath) {
      throw new Error('Audio recording path not available')
    }

    // Finalize the audio file
    await this.bridge.finalizeRecording(this.recordingPath)

    const audioPath = this.recordingPath

    logger.info(`[AudioInputService] Recording stopped: ${duration}ms, path: ${audioPath}`)

    // Cleanup
    this.cleanup()

    return {
      audioPath,
      duration
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
    this.cleanupAudioAnalysis()

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

// Singleton instance for convenience
let audioInputServiceInstance: AudioInputService | null = null

export function getAudioInputService(): AudioInputService {
  if (!audioInputServiceInstance) {
    audioInputServiceInstance = new AudioInputService()
  }
  return audioInputServiceInstance
}
