/**
 * Electron-based screen recorder - Facade over RecordingService
 * Maintains backward compatibility while delegating to the new decoupled architecture.
 */

import type { RecordingSettings } from '@/types'
import { RecordingService, ExtendedRecordingResult } from './services/recording-service'
import { logger } from '@/shared/utils/logger'

export class ElectronRecorder {
  private service: RecordingService

  constructor() {
    this.service = new RecordingService()
    logger.debug('ElectronRecorder initialized')
  }

  async startRecording(recordingSettings: RecordingSettings): Promise<void> {
    return this.service.start(recordingSettings)
  }

  async stopRecording(): Promise<ExtendedRecordingResult> {
    return this.service.stop()
  }

  pauseRecording(): void {
    this.service.pause()
  }

  resumeRecording(): void {
    this.service.resume()
  }

  isCurrentlyRecording(): boolean {
    return this.service.isRecording()
  }

  getState(): 'idle' | 'recording' | 'paused' {
    if (!this.service.isRecording()) return 'idle'
    if (this.service.isPaused()) return 'paused'
    return 'recording'
  }

  canPause(): boolean {
    return this.service.canPause()
  }

  canResume(): boolean {
    return this.service.canResume()
  }

  // Independent webcam pause/resume (creates segments)
  async pauseWebcam(): Promise<void> {
    return this.service.pauseWebcam()
  }

  async resumeWebcam(): Promise<void> {
    return this.service.resumeWebcam()
  }

  isWebcamPaused(): boolean {
    return this.service.isWebcamPaused()
  }

  isWebcamRecording(): boolean {
    return this.service.isWebcamRecording()
  }

  // Independent microphone pause/resume
  pauseMicrophone(): void {
    this.service.pauseMicrophone()
  }

  resumeMicrophone(): void {
    this.service.resumeMicrophone()
  }

  isMicrophonePaused(): boolean {
    return this.service.isMicrophonePaused()
  }

  isMicrophoneRecording(): boolean {
    return this.service.isMicrophoneRecording()
  }
}
