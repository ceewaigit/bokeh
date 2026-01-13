/**
 * Recording Service - Orchestrates recording strategies and tracking.
 * This is the main entry point for recording operations.
 *
 * Supports:
 * - Screen recording (native or MediaRecorder fallback)
 * - Webcam recording (optional, via WebcamService)
 * - Microphone recording (optional, via AudioInputService)
 */

import type { RecordingSettings } from '@/types'
import type { ElectronRecordingResult, ElectronMetadata } from '@/types/recording'
import { RecordingSourceType, RecordingArea, AudioInput } from '@/types'
import { RecordingStrategy, RecordingConfig, RecordingResult, RecordingSourceType as StrategySourceType } from '../types/recording-strategy'
import { NativeRecordingStrategy } from '../strategies/native-recording-strategy'
import { MediaRecorderStrategy } from '../strategies/media-recorder-strategy'
import { TrackingService } from './tracking-service'
import { WebcamService, WebcamRecordingResult } from './webcam-service'
import { AudioInputService, AudioInputResult } from './audio-input-service'
import { SourceResolver, CaptureArea } from './source-resolver'
import { parseAreaSourceId, isAreaSource, isWindowSource } from '@/features/media/recording/logic/area-source-parser'
import { logger } from '@/shared/utils/logger'
import { PermissionError, ElectronError } from '@/shared/errors'

// Extended result type to include webcam and microphone recordings
export interface ExtendedRecordingResult extends ElectronRecordingResult {
  webcam?: WebcamRecordingResult
  microphoneAudio?: AudioInputResult
}

export class RecordingService {
  private strategy: RecordingStrategy | null = null
  private trackingService: TrackingService
  private webcamService: WebcamService | null = null
  private audioInputService: AudioInputService | null = null
  private sourceResolver: SourceResolver
  private captureArea: CaptureArea | undefined
  private captureWidth = 0
  private captureHeight = 0
  private onlySelf = false
  private webcamEnabled = false
  private mainRecordingStartTime = 0  // When main recording started
  private operationLock: Promise<void> | null = null  // Prevents race conditions on async operations

  constructor() {
    this.trackingService = new TrackingService()
    this.sourceResolver = new SourceResolver()
  }

  /**
   * Execute an operation with locking to prevent race conditions.
   * Queues operations if a previous one is still in progress.
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    // Wait for any pending operation to complete
    while (this.operationLock) {
      await this.operationLock
    }

    // Create a lock for this operation
    let unlock: () => void
    this.operationLock = new Promise(resolve => { unlock = resolve })

    try {
      return await operation()
    } finally {
      unlock!()
      this.operationLock = null
    }
  }

  /**
   * Starts a recording with the given settings.
   */
  async start(settings: RecordingSettings): Promise<void> {
    // Check permissions
    await this.checkPermissions()
    if (!settings.sourceId) {
      throw new Error('Recording source is required')
    }
    this.onlySelf = settings.onlySelf ?? false

    // Resolve source information and capture bounds
    const sourceResolution = await this.sourceResolver.resolve(settings)
    this.captureArea = sourceResolution.captureArea
    this.captureWidth = sourceResolution.captureWidth
    this.captureHeight = sourceResolution.captureHeight

    if (!this.captureArea?.fullBounds) {
      throw new Error('Failed to resolve capture bounds')
    }

    // Select best available strategy
    this.strategy = await this.selectStrategy()
    logger.info(`[RecordingService] Using strategy: ${this.strategy.name}`)

    // Parse recording config
    const sourceInfo = { sourceId: sourceResolution.sourceId, displayId: sourceResolution.displayId }
    const config = this.parseConfig(settings, sourceInfo)

    try {
      await this.strategy.start(config)
      this.mainRecordingStartTime = Date.now()

      // Start tracking after recording begins so mouse timestamps align with the video clock.
      await this.trackingService.start(
        sourceInfo.sourceId,
        { fullBounds: this.captureArea?.fullBounds, scaleFactor: this.captureArea?.scaleFactor },
        this.captureWidth,
        this.captureHeight
      )

      // Start webcam recording if enabled
      if (settings.webcam?.enabled && settings.webcam.deviceId) {
        this.webcamEnabled = true
        this.webcamService = new WebcamService()

        // Set main recording start time for segment offset calculations
        this.webcamService.setMainRecordingStartTime(this.mainRecordingStartTime)

        const resolution = settings.webcam.resolution ?? '1080p'
        const dimensions = {
          '720p': { width: 1280, height: 720 },
          '1080p': { width: 1920, height: 1080 },
          '4k': { width: 3840, height: 2160 }
        }[resolution]

        // Include microphone in webcam ONLY when:
        // 1. Microphone is explicitly enabled
        // 2. No audio input is selected (AudioInput.None) - meaning user wants mic-only, no system audio
        const shouldIncludeMicInWebcam = settings.microphone?.enabled && settings.audioInput === AudioInput.None

        try {
          await this.webcamService.start({
            deviceId: settings.webcam.deviceId,
            width: dimensions.width,
            height: dimensions.height,
            includeMicrophone: shouldIncludeMicInWebcam,
            microphoneDeviceId: settings.microphone?.deviceId
          })
          logger.info('[RecordingService] Webcam recording started')
        } catch (webcamError) {
          logger.warn('[RecordingService] Failed to start webcam, continuing without it:', webcamError)
          this.webcamService = null
          this.webcamEnabled = false
        }
      }

      // Start separate microphone recording if enabled and not already captured via webcam
      // Microphone is captured via webcam ONLY when: webcam is enabled AND audioInput is None
      const micIncludedInWebcam = settings.microphone?.enabled && settings.audioInput === AudioInput.None
      const micCapturedViaWebcam = this.webcamEnabled && micIncludedInWebcam
      if (settings.microphone?.enabled && settings.microphone.deviceId && !micCapturedViaWebcam) {
        this.audioInputService = new AudioInputService()

        // Set main recording start time for segment offset calculations
        this.audioInputService.setMainRecordingStartTime(this.mainRecordingStartTime)

        try {
          await this.audioInputService.start({
            deviceId: settings.microphone.deviceId,
            echoCancellation: settings.microphone.echoCancellation ?? true,
            noiseSuppression: settings.microphone.noiseSuppression ?? true
          })
          logger.info('[RecordingService] Microphone recording started')
        } catch (micError) {
          logger.warn('[RecordingService] Failed to start microphone, continuing without it:', micError)
          this.audioInputService = null
        }
      }

      await this.showRecordingOverlay()
    } catch (error) {
      try {
        if (this.strategy?.isRecording()) {
          await this.strategy.stop()
        }
      } catch { }

      // Clean up any started services on failure
      if (this.webcamService) {
        try { await this.webcamService.stop() } catch { }
        this.webcamService = null
      }
      if (this.audioInputService) {
        try { await this.audioInputService.stop() } catch { }
        this.audioInputService = null
      }
      await this.trackingService.stop()
      throw error
    }
  }

  /**
   * Stops the current recording and returns the result.
   */
  async stop(): Promise<ExtendedRecordingResult> {
    if (!this.strategy) {
      throw new Error('No recording in progress')
    }

    let trackingError: unknown
    let metadata: ElectronMetadata[] = []
    let result: RecordingResult
    let webcamResult: WebcamRecordingResult | undefined
    let microphoneResult: AudioInputResult | undefined

    // Stop tracking
    try {
      metadata = await this.trackingService.stop()
    } catch (error) {
      trackingError = error
    }

    // Stop webcam recording
    if (this.webcamService) {
      try {
        webcamResult = await this.webcamService.stop()
        logger.info('[RecordingService] Webcam recording stopped:', webcamResult.videoPath)
      } catch (webcamError) {
        logger.error('[RecordingService] Failed to stop webcam:', webcamError)
      }
      this.webcamService = null
    }

    // Stop microphone recording
    if (this.audioInputService) {
      try {
        microphoneResult = await this.audioInputService.stop()
        logger.info('[RecordingService] Microphone recording stopped:', microphoneResult.audioPath)
      } catch (micError) {
        logger.error('[RecordingService] Failed to stop microphone:', micError)
      }
      this.audioInputService = null
    }

    // Stop screen recording
    try {
      result = await this.strategy.stop()
    } finally {
      await this.hideRecordingOverlay()
    }

    const recordingResult: ExtendedRecordingResult = {
      videoPath: result.videoPath,
      duration: result.duration,
      metadata,
      captureArea: this.captureArea,
      hasAudio: result.hasAudio,
      webcam: webcamResult,
      microphoneAudio: microphoneResult
    }

    // Reset state
    this.strategy = null
    this.captureArea = undefined
    this.captureWidth = 0
    this.captureHeight = 0
    this.onlySelf = false
    this.webcamEnabled = false
    this.mainRecordingStartTime = 0
    if (trackingError) {
      logger.warn('[RecordingService] Tracking stop failed; returning video with partial metadata', trackingError)
    }

    return recordingResult
  }

  /**
   * Pauses the current recording.
   */
  pause(): void {
    this.strategy?.pause()
    this.trackingService.pause()
    this.webcamService?.pause()
    this.audioInputService?.pause()
  }

  /**
   * Resumes the current recording.
   */
  resume(): void {
    this.strategy?.resume()
    this.trackingService.resume()
    this.webcamService?.resume()
    this.audioInputService?.resume()
  }

  /**
   * Toggle webcam capture on/off during recording.
   * Creates separate segments when toggled off then back on.
   * Uses operation locking to prevent race conditions.
   */
  async toggleWebcamCapture(): Promise<void> {
    return this.withLock(async () => {
      if (!this.isRecording()) {
        throw new Error('Cannot toggle webcam: not recording')
      }
      if (!this.webcamService) {
        logger.warn('[RecordingService] No webcam service available to toggle')
        return
      }

      if (this.webcamService.isToggledOff()) {
        await this.webcamService.startNewSegment()
        logger.info('[RecordingService] Webcam toggled ON (new segment)')
      } else {
        await this.webcamService.endSegment()
        logger.info('[RecordingService] Webcam toggled OFF (segment ended)')
      }
    })
  }

  /**
   * Toggle microphone capture on/off during recording.
   * Creates separate segments when toggled off then back on.
   * Uses operation locking to prevent race conditions.
   */
  async toggleMicrophoneCapture(): Promise<void> {
    return this.withLock(async () => {
      if (!this.isRecording()) {
        throw new Error('Cannot toggle microphone: not recording')
      }
      if (!this.audioInputService) {
        logger.warn('[RecordingService] No microphone service available to toggle')
        return
      }

      if (this.audioInputService.isToggledOff()) {
        await this.audioInputService.startNewSegment()
        logger.info('[RecordingService] Microphone toggled ON (new segment)')
      } else {
        await this.audioInputService.endSegment()
        logger.info('[RecordingService] Microphone toggled OFF (segment ended)')
      }
    })
  }

  /**
   * Check if webcam is currently toggled off (segment ended, waiting for restart).
   */
  isWebcamToggledOff(): boolean {
    return this.webcamService?.isToggledOff() ?? false
  }

  /**
   * Check if microphone is currently toggled off (segment ended, waiting for restart).
   */
  isMicrophoneToggledOff(): boolean {
    return this.audioInputService?.isToggledOff() ?? false
  }

  /**
   * Check if webcam can be toggled (recording in progress and webcam service available).
   */
  canToggleWebcam(): boolean {
    return this.isRecording() && this.webcamService !== null && this.operationLock === null
  }

  /**
   * Check if microphone can be toggled (recording in progress and mic service available).
   */
  canToggleMicrophone(): boolean {
    return this.isRecording() && this.audioInputService !== null && this.operationLock === null
  }

  /**
   * Get the current webcam stream for preview.
   */
  getWebcamStream(): MediaStream | null {
    return this.webcamService?.getStream() ?? null
  }

  /**
   * Check if webcam is currently recording.
   */
  isWebcamRecording(): boolean {
    return this.webcamService?.isRecording() ?? false
  }

  /**
   * Check if microphone is currently recording.
   */
  isMicrophoneRecording(): boolean {
    return this.audioInputService?.isRecording() ?? false
  }

  canPause(): boolean {
    return this.strategy?.canPause() ?? false
  }

  canResume(): boolean {
    return this.strategy?.canResume() ?? false
  }

  isRecording(): boolean {
    return this.strategy?.isRecording() ?? false
  }

  isPaused(): boolean {
    return this.strategy?.isPaused() ?? false
  }

  private async showRecordingOverlay(): Promise<void> {
    if (!window.electronAPI?.showRecordingOverlay || !this.captureArea?.fullBounds) return
    if (this.onlySelf) return

    let label = 'Recording'
    if (this.captureArea.sourceType === RecordingSourceType.Area) {
      label = 'Recording Area'
    } else if (this.captureArea.sourceType === RecordingSourceType.Window) {
      label = 'Recording Window'
    } else if (this.captureArea.sourceType === RecordingSourceType.Screen) {
      label = 'Recording Screen'
    }

    try {
      await window.electronAPI.showRecordingOverlay(this.captureArea.fullBounds, label, { mode: 'hidden' })
    } catch {
      // Overlay is best-effort; recording should still proceed.
    }
  }

  private async hideRecordingOverlay(): Promise<void> {
    if (!window.electronAPI?.hideRecordingOverlay) return
    try {
      await window.electronAPI.hideRecordingOverlay()
    } catch {
      // Ignore overlay cleanup errors.
    }
  }

  /**
   * Checks screen recording permissions.
   */
  private async checkPermissions(): Promise<void> {
    if (!window.electronAPI?.getDesktopSources) {
      throw new ElectronError('Electron API not available', 'getDesktopSources')
    }

    if (window.electronAPI?.checkScreenRecordingPermission) {
      const permissionResult = await window.electronAPI.checkScreenRecordingPermission()
      logger.info('[RecordingService] Permission status:', permissionResult)

      if (!permissionResult.granted) {
        if (window.electronAPI?.requestScreenRecordingPermission) {
          await window.electronAPI.requestScreenRecordingPermission()
        }
        throw new PermissionError(
          'Screen recording permission is required.\n\nPlease grant permission in System Preferences > Security & Privacy > Screen Recording, then try again.',
          'screen'
        )
      }
    }
  }

  /**
   * Selects the best available recording strategy.
   */
  private async selectStrategy(): Promise<RecordingStrategy> {
    const native = new NativeRecordingStrategy()
    if (await native.isAvailable()) {
      logger.info('[RecordingService] Native ScreenCaptureKit available')
      return native
    }

    const mediaRecorder = new MediaRecorderStrategy()
    if (await mediaRecorder.isAvailable()) {
      logger.info('[RecordingService] Falling back to MediaRecorder')
      return mediaRecorder
    }

    throw new Error('No recording strategy available')
  }

  /**
   * Parses recording settings into a strategy config.
   */
  private parseConfig(settings: RecordingSettings, sourceInfo: { sourceId: string; displayId?: number }): RecordingConfig {
    const resolvedSourceId = sourceInfo.sourceId || settings.sourceId || ''
    let sourceType: StrategySourceType = RecordingSourceType.Screen
    let bounds: RecordingConfig['bounds']
    let displayId = sourceInfo.displayId

    if (isAreaSource(resolvedSourceId)) {
      sourceType = RecordingSourceType.Area
      const areaBounds = parseAreaSourceId(resolvedSourceId)
      if (areaBounds) {
        bounds = {
          x: areaBounds.x,
          y: areaBounds.y,
          width: areaBounds.width,
          height: areaBounds.height
        }
        if (typeof areaBounds.displayId === 'number') {
          displayId = areaBounds.displayId
        }
      }
    } else if (isWindowSource(resolvedSourceId)) {
      sourceType = RecordingSourceType.Window
    }

    return {
      sourceId: resolvedSourceId,
      sourceType,
      hasAudio: settings.audioInput !== AudioInput.None,
      bounds,
      displayId,
      onlySelf: settings.onlySelf,
      includeAppWindows: settings.includeAppWindows,
      lowMemoryEncoder: settings.lowMemoryEncoder ?? false,
      useMacOSDefaults: settings.useMacOSDefaults ?? true,
      framerate: settings.framerate
    }
  }
}
