/**
 * Recording strategy using native ScreenCaptureKit on macOS 12.3+.
 * Provides hardware-accelerated recording with hidden cursor support.
 */

import { RecordingStrategy, RecordingConfig, RecordingResult } from '../types/recording-strategy'
import { parseAreaSourceId, parseWindowId, parseScreenDisplayId } from '../utils/area-source-parser'
import { RecordingIpcBridge, getRecordingBridge } from '@/lib/bridges'
import { logger } from '@/lib/utils/logger'

export class NativeRecordingStrategy implements RecordingStrategy {
  readonly name = 'NativeScreenCaptureKit'

  private bridge: RecordingIpcBridge
  private recordingPath: string | null = null
  private startTime = 0
  private _isRecording = false
  private _isPaused = false
  private pauseStartTime = 0
  private totalPausedDuration = 0

  constructor(bridge?: RecordingIpcBridge) {
    this.bridge = bridge ?? getRecordingBridge()
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await this.bridge.nativeRecorderAvailable()
    } catch (err) {
      logger.warn('[NativeStrategy] Availability check failed:', err)
      return false
    }
  }

  async start(config: RecordingConfig): Promise<void> {
    if (this._isRecording) {
      throw new Error('Already recording')
    }

    logger.info(`[NativeStrategy] Starting ${config.sourceType} recording`)

    let result: { outputPath: string }

    if (config.sourceType === 'window') {
      const windowId = parseWindowId(config.sourceId)
      if (windowId <= 0) {
        throw new Error('Invalid window ID')
      }

      logger.info(`[NativeStrategy] Recording window ID: ${windowId}`)
      result = await this.bridge.nativeRecorderStartWindow(windowId, {
        lowMemory: config.lowMemoryEncoder,
        useMacOSDefaults: config.useMacOSDefaults,
        framerate: config.framerate
      })
    } else {
      // Screen or area capture
      const displayId = config.displayId ?? parseScreenDisplayId(config.sourceId)

      // For area selection, parse the bounds
      let cropBounds = config.bounds
      if (config.sourceType === 'area' && !cropBounds) {
        const areaBounds = parseAreaSourceId(config.sourceId)
        if (areaBounds) {
          cropBounds = {
            x: areaBounds.x,
            y: areaBounds.y,
            width: areaBounds.width,
            height: areaBounds.height
          }
        }
      }

      logger.info(`[NativeStrategy] Recording display ${displayId}${cropBounds ? ` with crop ${JSON.stringify(cropBounds)}` : ''}, includeAppWindows: ${config.includeAppWindows}`)
      result = await this.bridge.nativeRecorderStartDisplay(displayId, cropBounds, {
        onlySelf: config.onlySelf,
        lowMemory: config.lowMemoryEncoder,
        includeAppWindows: config.includeAppWindows,
        useMacOSDefaults: config.useMacOSDefaults,
        framerate: config.framerate
      })
    }

    this.recordingPath = result.outputPath
    this.startTime = Date.now()
    this._isRecording = true
    this._isPaused = false
    this.totalPausedDuration = 0

    logger.info(`[NativeStrategy] Recording started: ${this.recordingPath}`)
  }

  async stop(): Promise<RecordingResult> {
    if (!this._isRecording) {
      throw new Error('Not recording')
    }

    // If paused, resume first for clean stop
    if (this._isPaused) {
      this.resume()
    }

    const result = await this.bridge.nativeRecorderStop()
    const duration = (Date.now() - this.startTime) - this.totalPausedDuration

    const videoPath = result.outputPath || this.recordingPath
    if (!videoPath) {
      throw new Error('No output path from native recorder')
    }

    logger.info(`[NativeStrategy] Recording stopped: ${duration}ms, path: ${videoPath}`)

    this._isRecording = false
    this._isPaused = false
    this.recordingPath = null

    return {
      videoPath,
      duration,
      hasAudio: true // Native always captures system audio
    }
  }

  pause(): void {
    if (!this._isRecording || this._isPaused) {
      return
    }

    try {
      this.bridge.nativeRecorderPause()
      this._isPaused = true
      this.pauseStartTime = Date.now()
      logger.info('[NativeStrategy] Recording paused')
    } catch (err) {
      logger.warn('[NativeStrategy] Pause failed:', err)
    }
  }

  resume(): void {
    if (!this._isRecording || !this._isPaused) {
      return
    }

    try {
      const pausedDuration = Date.now() - this.pauseStartTime
      this.totalPausedDuration += pausedDuration

      this.bridge.nativeRecorderResume()
      this._isPaused = false
      this.pauseStartTime = 0
      logger.info(`[NativeStrategy] Recording resumed. Paused for ${pausedDuration}ms`)
    } catch (err) {
      logger.warn('[NativeStrategy] Resume failed:', err)
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
}
