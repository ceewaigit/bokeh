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
import { RecordingSourceType } from '@/types'
import { RecordingStrategy, RecordingConfig, RecordingResult, RecordingSourceType as StrategySourceType } from '../types/recording-strategy'
import { NativeRecordingStrategy } from '../strategies/native-recording-strategy'
import { MediaRecorderStrategy } from '../strategies/media-recorder-strategy'
import { TrackingService } from './tracking-service'
import { WebcamService, WebcamRecordingResult } from './webcam-service'
import { AudioInputService, AudioInputResult } from './audio-input-service'
import { parseAreaSourceId, isAreaSource, isWindowSource } from '../utils/area-source-parser'
import { logger } from '@/lib/utils/logger'
import { PermissionError, ElectronError } from '@/lib/errors'

interface CaptureArea {
  fullBounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  sourceType: RecordingSourceType
  sourceId: string
}

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
  private captureArea: CaptureArea | undefined
  private captureWidth = 0
  private captureHeight = 0
  private onlySelf = false
  private webcamEnabled = false

  constructor() {
    this.trackingService = new TrackingService()
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

    // Get source information
    const sourceInfo = await this.getSourceInfo(settings)
    if (!this.captureArea?.fullBounds) {
      throw new Error('Failed to resolve capture bounds')
    }

    // Select best available strategy
    this.strategy = await this.selectStrategy()
    logger.info(`[RecordingService] Using strategy: ${this.strategy.name}`)

    // Parse recording config
    const config = this.parseConfig(settings, sourceInfo)

    try {
      await this.strategy.start(config)

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

        const resolution = settings.webcam.resolution ?? '1080p'
        const dimensions = {
          '720p': { width: 1280, height: 720 },
          '1080p': { width: 1920, height: 1080 },
          '4k': { width: 3840, height: 2160 }
        }[resolution]

        try {
          await this.webcamService.start({
            deviceId: settings.webcam.deviceId,
            width: dimensions.width,
            height: dimensions.height,
            // Include microphone in webcam if microphone is enabled and no separate audio input
            includeMicrophone: settings.microphone?.enabled && !settings.audioInput,
            microphoneDeviceId: settings.microphone?.deviceId
          })
          logger.info('[RecordingService] Webcam recording started')
        } catch (webcamError) {
          logger.warn('[RecordingService] Failed to start webcam, continuing without it:', webcamError)
          this.webcamService = null
          this.webcamEnabled = false
        }
      }

      // Start separate microphone recording if enabled and not captured via webcam
      const micCapturedViaWebcam = this.webcamEnabled && settings.microphone?.enabled
      if (settings.microphone?.enabled && settings.microphone.deviceId && !micCapturedViaWebcam) {
        this.audioInputService = new AudioInputService()

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
      await window.electronAPI.showRecordingOverlay(this.captureArea.fullBounds, label)
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
   * Gets source information and sets up capture area.
   */
  private async getSourceInfo(settings: RecordingSettings): Promise<{ sourceId: string; displayId?: number }> {
    const sources = await window.electronAPI!.getDesktopSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 }
    })

    if (!sources || sources.length === 0) {
      throw new PermissionError('No screen sources available. Please check permissions.', 'screen')
    }

    // Find the requested source
    let primarySource = sources.find(s => s.id === settings.sourceId)

    // Fallback: Electron window IDs often have a suffix (e.g. "window:123:0"), so try prefix match
    if (!primarySource && settings.sourceId?.startsWith('window:')) {
      primarySource = sources.find(s => s.id.startsWith(settings.sourceId + ':'))
    }

    // Area selections are encoded as "area:x,y,w,h[,displayId]" and won't exist in desktopCapturer sources.
    // Prefer the screen source matching the encoded displayId when possible.
    if (isAreaSource(settings.sourceId)) {
      const area = parseAreaSourceId(settings.sourceId!)
      if (area?.displayId) {
        const matchingScreen = sources.find(s => s.id.startsWith(`screen:${area.displayId}:`))
        if (matchingScreen) {
          primarySource = matchingScreen
        }
      }
    }

    if (!primarySource && settings.onlySelf) {
      const primaryScreen = sources.find(s => s.id.startsWith('screen:') && s.displayInfo?.isPrimary)
      primarySource = primaryScreen || sources.find(s => s.id.startsWith('screen:'))
      if (primarySource) {
        logger.warn('[RecordingService] App-only source not found; falling back to display capture')
      }
    }

    if (!primarySource) {
      // Auto-select screen for fullscreen/region recording
      if (settings.area !== 'window') {
        primarySource = sources.find(s => s.id.startsWith('screen:'))
      }

      if (!primarySource) {
        throw new Error('No suitable recording source found')
      }
    }

    logger.info(`[RecordingService] Using source: ${primarySource.name} (${primarySource.id})`)

    const rawDisplayId =
      typeof (primarySource as any).display_id === 'string'
        ? Number((primarySource as any).display_id)
        : (primarySource as any).display_id
    const displayInfoId = (primarySource as any).displayInfo?.id

    // Get source bounds (in Electron display coordinates)
    if (window.electronAPI?.getSourceBounds) {
      const rawBounds = await window.electronAPI.getSourceBounds(primarySource.id)
      if (rawBounds) {
        let bounds = rawBounds
        let scaleFactor = 1
        const resolvedDisplayId =
          Number.isFinite(rawDisplayId) ? rawDisplayId : (typeof displayInfoId === 'number' ? displayInfoId : undefined)

        // Get display scale factor for screen sources
        if (primarySource.id.startsWith('screen:') && window.electronAPI?.getScreens) {
          try {
            const screens = await window.electronAPI.getScreens()
            const parts = primarySource.id.split(':')
            const displayIdFromSource = resolvedDisplayId ?? parseInt(parts[1])
            const displayInfo = screens?.find((d: { id: number; scaleFactor?: number }) => d.id === displayIdFromSource)
            if (displayInfo?.scaleFactor && displayInfo.scaleFactor > 0) {
              scaleFactor = displayInfo.scaleFactor
            }
          } catch {
            // Keep scaleFactor = 1
          }
        }

        // For window sources, infer scale factor from the display containing the window bounds.
        // Some native window-bounds implementations may return physical pixels; normalize back to
        // Electron display coordinates (DIP) so downstream math can consistently apply scaleFactor.
        if (!primarySource.id.startsWith('screen:') && window.electronAPI?.getScreens) {
          try {
            const screens = await window.electronAPI.getScreens()
            const centerX = bounds.x + bounds.width / 2
            const centerY = bounds.y + bounds.height / 2

            const containsPoint = (b: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
              x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height

            // Pass 1: assume bounds are in DIP
            const dipDisplay = screens?.find((d: { bounds: any }) => d?.bounds && containsPoint(d.bounds, centerX, centerY))
            if (dipDisplay?.scaleFactor && dipDisplay.scaleFactor > 0) {
              scaleFactor = dipDisplay.scaleFactor
            } else {
              // Pass 2: assume bounds are in physical pixels; try per-display de-scaling
              const physicalDisplay = screens?.find((d: { bounds: any; scaleFactor?: number }) => {
                const sf = d?.scaleFactor && d.scaleFactor > 0 ? d.scaleFactor : 1
                return d?.bounds && containsPoint(d.bounds, centerX / sf, centerY / sf)
              })
              const sf = physicalDisplay?.scaleFactor && physicalDisplay.scaleFactor > 0 ? physicalDisplay.scaleFactor : 1
              if (physicalDisplay?.bounds) {
                scaleFactor = sf
                bounds = {
                  x: bounds.x / sf,
                  y: bounds.y / sf,
                  width: bounds.width / sf,
                  height: bounds.height / sf
                }
              }
            }
          } catch {
            // Keep defaults
          }
        }

        let effectiveBounds = bounds
        let sourceType = primarySource.id.startsWith('screen:') ? RecordingSourceType.Screen : RecordingSourceType.Window
        let sourceId = primarySource.id

        // For area selections, set capture bounds to the selected region (in global display coordinates).
        if (isAreaSource(settings.sourceId)) {
          const area = parseAreaSourceId(settings.sourceId!)
          if (area) {
            effectiveBounds = {
              x: bounds.x + area.x,
              y: bounds.y + area.y,
              width: area.width,
              height: area.height
            }
            sourceType = RecordingSourceType.Area
            sourceId = settings.sourceId!
          }
        }

        this.captureArea = {
          fullBounds: effectiveBounds,
          workArea: effectiveBounds,
          scaleFactor,
          sourceType,
          sourceId
        }

        this.captureWidth = Math.round(effectiveBounds.width * scaleFactor)
        this.captureHeight = Math.round(effectiveBounds.height * scaleFactor)
      }
    }

    const parsedDisplayId =
      Number.isFinite(rawDisplayId)
        ? rawDisplayId
        : (typeof displayInfoId === 'number' ? displayInfoId : undefined)

    return {
      sourceId: primarySource.id,
      displayId: Number.isFinite(parsedDisplayId) ? parsedDisplayId : undefined
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
    let sourceType: StrategySourceType = 'screen'
    let bounds: RecordingConfig['bounds']
    let displayId = sourceInfo.displayId

    if (isAreaSource(resolvedSourceId)) {
      sourceType = 'area'
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
      sourceType = 'window'
    }

    return {
      sourceId: resolvedSourceId,
      sourceType,
      hasAudio: settings.audioInput !== 'none',
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
