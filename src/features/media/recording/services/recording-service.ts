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
import { RecordingSourceType, AudioInput } from '@/types'
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
import type { PrewarmedStreams } from './stream-warmer'

// Extended result type to include webcam and microphone recordings
export interface ExtendedRecordingResult extends ElectronRecordingResult {
  webcam?: WebcamRecordingResult
  microphoneAudio?: AudioInputResult
}

// Configuration types for optional services
interface WebcamStartConfig {
  deviceId: string
  width: number
  height: number
  includeMicrophone: boolean
  microphoneDeviceId?: string
  prewarmedStream?: MediaStream
  prewarmedDimensions?: { width: number; height: number }
}

interface MicStartConfig {
  deviceId: string
  echoCancellation: boolean
  noiseSuppression: boolean
  prewarmedStream?: MediaStream
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
   * @param settings Recording settings
   * @param prewarmedStreams Optional pre-warmed streams from countdown phase
   */
  async start(settings: RecordingSettings, prewarmedStreams?: PrewarmedStreams): Promise<void> {
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

    // Determine microphone routing
    // Include microphone in webcam ONLY when:
    // 1. Microphone is explicitly enabled
    // 2. No audio input is selected (AudioInput.None) - meaning user wants mic-only, no system audio
    const shouldIncludeMicInWebcam = settings.microphone?.enabled && settings.audioInput === AudioInput.None
    const micCapturedViaWebcam = settings.webcam?.enabled && settings.webcam.deviceId && shouldIncludeMicInWebcam

    try {
      // Capture coordinated start time BEFORE starting all services
      // This ensures all services (webcam, audio) have the same reference point for duration calculation.
      // NOTE: Tracking service intentionally starts AFTER all recording services are running,
      // so mouse/cursor timestamps align with actual video frame timestamps. The small delay
      // (typically <100ms) between mainRecordingStartTime and tracking start is acceptable
      // because tracking events are relative to video playback, not absolute time.
      this.mainRecordingStartTime = Date.now()
      logger.info(`[RecordingService] Coordinated start time: ${this.mainRecordingStartTime}`)

      // Prepare webcam and mic services if needed (but don't start yet)
      let webcamConfig: WebcamStartConfig | null = null
      let micConfig: MicStartConfig | null = null

      if (settings.webcam?.enabled && settings.webcam.deviceId) {
        this.webcamEnabled = true
        this.webcamService = new WebcamService()
        this.webcamService.setMainRecordingStartTime(this.mainRecordingStartTime)

        const resolution = settings.webcam.resolution ?? '1080p'
        const dimensions = {
          '720p': { width: 1280, height: 720 },
          '1080p': { width: 1920, height: 1080 },
          '4k': { width: 3840, height: 2160 }
        }[resolution]

        webcamConfig = {
          deviceId: settings.webcam.deviceId,
          width: dimensions.width,
          height: dimensions.height,
          includeMicrophone: shouldIncludeMicInWebcam ?? false,
          microphoneDeviceId: settings.microphone?.deviceId,
          // Use pre-warmed stream if available
          prewarmedStream: prewarmedStreams?.webcam,
          prewarmedDimensions: prewarmedStreams?.webcamDimensions
        }

        if (prewarmedStreams?.webcam) {
          logger.info('[RecordingService] Using pre-warmed webcam stream')
        }
      }

      if (settings.microphone?.enabled && settings.microphone.deviceId && !micCapturedViaWebcam) {
        this.audioInputService = new AudioInputService()
        this.audioInputService.setMainRecordingStartTime(this.mainRecordingStartTime)

        micConfig = {
          deviceId: settings.microphone.deviceId,
          echoCancellation: settings.microphone.echoCancellation ?? true,
          noiseSuppression: settings.microphone.noiseSuppression ?? true,
          // Use pre-warmed stream if available
          prewarmedStream: prewarmedStreams?.microphone
        }

        if (prewarmedStreams?.microphone) {
          logger.info('[RecordingService] Using pre-warmed microphone stream')
        }
      }

      // Start all services in PARALLEL for synchronized start
      const startPromises: Promise<void>[] = [
        this.strategy.start(config)
      ]

      if (this.webcamService && webcamConfig) {
        startPromises.push(
          this.webcamService.start(webcamConfig)
            .then(() => logger.info('[RecordingService] Webcam recording started'))
            .catch(webcamError => {
              logger.warn('[RecordingService] Failed to start webcam, continuing without it:', webcamError)
              this.webcamService = null
              this.webcamEnabled = false
            })
        )
      }

      if (this.audioInputService && micConfig) {
        startPromises.push(
          this.audioInputService.start(micConfig)
            .then(() => logger.info('[RecordingService] Microphone recording started'))
            .catch(micError => {
              logger.warn('[RecordingService] Failed to start microphone, continuing without it:', micError)
              this.audioInputService = null
            })
        )
      }

      // Wait for all services to start simultaneously
      await Promise.all(startPromises)
      logger.info(`[RecordingService] All services started in parallel (${startPromises.length} service(s))`)

      // Start tracking after recording begins so mouse timestamps align with the video clock.
      await this.trackingService.start(
        sourceInfo.sourceId,
        { fullBounds: this.captureArea?.fullBounds, scaleFactor: this.captureArea?.scaleFactor },
        this.captureWidth,
        this.captureHeight
      )

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

    // Capture coordinated stop time BEFORE stopping any service
    // This ensures all services use the same timestamp for duration calculation
    const coordinatedStopTime = Date.now()
    this.webcamService?.setCoordinatedStopTime(coordinatedStopTime)
    this.audioInputService?.setCoordinatedStopTime(coordinatedStopTime)

    // Stop all services in parallel for atomic timing
    const [trackingResult, webcamStopResult, micStopResult, strategyResult] = await Promise.all([
      // Tracking
      this.trackingService.stop().catch(err => {
        trackingError = err
        return [] as ElectronMetadata[]
      }),
      // Webcam
      this.webcamService?.stop().then(res => {
        if (res) logger.info('[RecordingService] Webcam recording stopped:', res.videoPath)
        return res
      }).catch(err => {
        logger.error('[RecordingService] Failed to stop webcam:', err)
        return undefined
      }) ?? Promise.resolve(undefined),
      // Microphone
      this.audioInputService?.stop().then(res => {
        if (res) logger.info('[RecordingService] Microphone recording stopped:', res.audioPath)
        return res
      }).catch(err => {
        logger.error('[RecordingService] Failed to stop microphone:', err)
        return undefined
      }) ?? Promise.resolve(undefined),
      // Screen recording (strategy)
      this.strategy.stop()
    ])

    metadata = trackingResult
    webcamResult = webcamStopResult ?? undefined
    microphoneResult = micStopResult ?? undefined
    result = strategyResult

    // Cleanup after parallel stop
    this.webcamService = null
    this.audioInputService = null
    await this.hideRecordingOverlay()

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
