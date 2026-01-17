/**
 * Stream Pre-warming Service
 *
 * Optional optimization: pre-acquires webcam/mic streams during countdown
 * to eliminate getUserMedia latency from recording start.
 *
 * Note: This provides ~100-300ms faster start. The 3-second countdown
 * is usually sufficient, so pre-warming is optional.
 */

import { logger } from '@/shared/utils/logger'

export interface WebcamWarmConfig {
  deviceId: string
  width?: number
  height?: number
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

  /** Pre-warm webcam stream. Returns null on failure (non-blocking). */
  async warmWebcam(config: WebcamWarmConfig): Promise<MediaStream | null> {
    if (this.webcamStream) return this.webcamStream

    const width = config.width ?? 1920
    const height = config.height ?? 1080

    try {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: config.deviceId }, width: { ideal: width }, height: { ideal: height } },
        audio: false
      })

      const track = this.webcamStream.getVideoTracks()[0]
      if (track) {
        const settings = track.getSettings()
        this.webcamDimensions = { width: settings.width ?? width, height: settings.height ?? height }
        track.onended = () => { this.webcamStream = null; this.webcamDimensions = null }
      }
      logger.debug('[StreamWarmer] Webcam pre-warmed')
      return this.webcamStream
    } catch (error) {
      logger.warn('[StreamWarmer] Webcam pre-warm failed (will retry at recording start):', error)
      return null
    }
  }

  /** Pre-warm microphone stream. Returns null on failure (non-blocking). */
  async warmMicrophone(config: MicrophoneWarmConfig): Promise<MediaStream | null> {
    if (this.microphoneStream) return this.microphoneStream

    try {
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { deviceId: { exact: config.deviceId }, echoCancellation: config.echoCancellation ?? true, noiseSuppression: config.noiseSuppression ?? true }
      })

      const track = this.microphoneStream.getAudioTracks()[0]
      if (track) track.onended = () => { this.microphoneStream = null }
      logger.debug('[StreamWarmer] Microphone pre-warmed')
      return this.microphoneStream
    } catch (error) {
      logger.warn('[StreamWarmer] Microphone pre-warm failed (will retry at recording start):', error)
      return null
    }
  }

  /** Get pre-warmed streams. */
  getPrewarmedStreams(): PrewarmedStreams {
    return {
      webcam: this.webcamStream ?? undefined,
      microphone: this.microphoneStream ?? undefined,
      webcamDimensions: this.webcamDimensions ?? undefined
    }
  }

  /** Release streams without stopping tracks (handoff to recording). */
  handOff(): void {
    this.webcamStream = null
    this.microphoneStream = null
    this.webcamDimensions = null
  }

  /** Release and stop all streams (on abort). */
  releaseAll(): void {
    this.webcamStream?.getTracks().forEach(t => t.stop())
    this.microphoneStream?.getTracks().forEach(t => t.stop())
    this.webcamStream = null
    this.microphoneStream = null
    this.webcamDimensions = null
  }
}
