/**
 * Stream Pre-warming Service
 *
 * Pre-acquires webcam and microphone streams during the countdown period
 * to eliminate getUserMedia latency from the critical recording start path.
 */

import { logger } from '@/shared/utils/logger'

export interface WebcamWarmConfig {
  deviceId: string
  width?: number
  height?: number
  frameRate?: number
}

export interface MicrophoneWarmConfig {
  deviceId: string
  echoCancellation?: boolean
  noiseSuppression?: boolean
}

export interface PrewarmedStreams {
  webcam?: MediaStream
  microphone?: MediaStream
  webcamDimensions?: { width: number; height: number }
}

export class StreamWarmer {
  private webcamStream: MediaStream | null = null
  private microphoneStream: MediaStream | null = null
  private webcamDimensions: { width: number; height: number } | null = null
  private isWarming = false
  private warmingPromises: Promise<void>[] = []

  /**
   * Pre-warm webcam stream during countdown.
   * Returns the acquired stream for immediate use.
   */
  async warmWebcam(config: WebcamWarmConfig): Promise<MediaStream | null> {
    if (this.webcamStream) {
      logger.debug('[StreamWarmer] Webcam already warmed')
      return this.webcamStream
    }

    const width = config.width ?? 1920
    const height = config.height ?? 1080
    const frameRate = config.frameRate ?? 30

    logger.info(`[StreamWarmer] Pre-warming webcam (${width}x${height}@${frameRate}fps)`)

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: config.deviceId },
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: frameRate }
        },
        audio: false // Webcam audio handled separately via microphone config
      }

      this.webcamStream = await navigator.mediaDevices.getUserMedia(constraints)

      // Get actual dimensions from video track
      const videoTrack = this.webcamStream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings()
        this.webcamDimensions = {
          width: settings.width ?? width,
          height: settings.height ?? height
        }
        logger.info(`[StreamWarmer] Webcam pre-warmed: ${this.webcamDimensions.width}x${this.webcamDimensions.height}`)

        // Monitor for track ending
        videoTrack.onended = () => {
          logger.warn('[StreamWarmer] Pre-warmed webcam track ended')
          this.webcamStream = null
          this.webcamDimensions = null
        }
      }

      return this.webcamStream
    } catch (error) {
      logger.error('[StreamWarmer] Failed to pre-warm webcam:', error)
      this.webcamStream = null
      this.webcamDimensions = null
      return null
    }
  }

  /**
   * Pre-warm microphone stream during countdown.
   * Returns the acquired stream for immediate use.
   */
  async warmMicrophone(config: MicrophoneWarmConfig): Promise<MediaStream | null> {
    if (this.microphoneStream) {
      logger.debug('[StreamWarmer] Microphone already warmed')
      return this.microphoneStream
    }

    logger.info('[StreamWarmer] Pre-warming microphone')

    try {
      const constraints: MediaStreamConstraints = {
        video: false,
        audio: {
          deviceId: { exact: config.deviceId },
          echoCancellation: config.echoCancellation ?? true,
          noiseSuppression: config.noiseSuppression ?? true
        }
      }

      this.microphoneStream = await navigator.mediaDevices.getUserMedia(constraints)

      const audioTrack = this.microphoneStream.getAudioTracks()[0]
      if (audioTrack) {
        logger.info('[StreamWarmer] Microphone pre-warmed successfully')

        // Monitor for track ending
        audioTrack.onended = () => {
          logger.warn('[StreamWarmer] Pre-warmed microphone track ended')
          this.microphoneStream = null
        }
      }

      return this.microphoneStream
    } catch (error) {
      logger.error('[StreamWarmer] Failed to pre-warm microphone:', error)
      this.microphoneStream = null
      return null
    }
  }

  /**
   * Start warming both webcam and microphone in parallel.
   * Non-blocking - use getPrewarmedStreams() to retrieve when ready.
   */
  startWarming(
    webcamConfig?: WebcamWarmConfig,
    microphoneConfig?: MicrophoneWarmConfig
  ): void {
    if (this.isWarming) {
      logger.debug('[StreamWarmer] Already warming streams')
      return
    }

    this.isWarming = true
    this.warmingPromises = []

    if (webcamConfig) {
      this.warmingPromises.push(
        this.warmWebcam(webcamConfig).then(() => {})
      )
    }

    if (microphoneConfig) {
      this.warmingPromises.push(
        this.warmMicrophone(microphoneConfig).then(() => {})
      )
    }

    logger.info(`[StreamWarmer] Started warming ${this.warmingPromises.length} stream(s)`)
  }

  /**
   * Wait for all warming operations to complete.
   * @param timeoutMs Maximum time to wait (default: 10 seconds)
   */
  async waitForWarming(timeoutMs: number = 10000): Promise<void> {
    if (this.warmingPromises.length === 0) return

    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Stream warming timed out')), timeoutMs)
    )

    try {
      await Promise.race([
        Promise.allSettled(this.warmingPromises),
        timeout
      ])
    } catch (_error) {
      logger.warn('[StreamWarmer] Warming timed out after', timeoutMs, 'ms')
      // Continue anyway - partial streams may still be available
    }
  }

  /**
   * Get pre-warmed streams. May be partially available if warming is still in progress.
   */
  getPrewarmedStreams(): PrewarmedStreams {
    return {
      webcam: this.webcamStream ?? undefined,
      microphone: this.microphoneStream ?? undefined,
      webcamDimensions: this.webcamDimensions ?? undefined
    }
  }

  /**
   * Check if webcam stream is ready.
   */
  hasWebcam(): boolean {
    return this.webcamStream !== null && this.webcamStream.active
  }

  /**
   * Check if microphone stream is ready.
   */
  hasMicrophone(): boolean {
    return this.microphoneStream !== null && this.microphoneStream.active
  }

  /**
   * Release all pre-warmed streams without stopping tracks.
   * Call this when streams have been handed off to recording services.
   */
  handOff(): void {
    logger.info('[StreamWarmer] Handing off streams to recording services')
    // Don't stop tracks - they're being used by recording services
    this.webcamStream = null
    this.microphoneStream = null
    this.webcamDimensions = null
    this.isWarming = false
    this.warmingPromises = []
  }

  /**
   * Release all pre-warmed streams and stop tracks.
   * Call this on countdown abort or error.
   */
  releaseAll(): void {
    logger.info('[StreamWarmer] Releasing all pre-warmed streams')

    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => {
        track.stop()
        logger.debug(`[StreamWarmer] Stopped webcam track: ${track.kind}`)
      })
      this.webcamStream = null
    }

    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(track => {
        track.stop()
        logger.debug(`[StreamWarmer] Stopped microphone track: ${track.kind}`)
      })
      this.microphoneStream = null
    }

    this.webcamDimensions = null
    this.isWarming = false
    this.warmingPromises = []
  }
}
