/**
 * Electron-based screen recorder - Facade over RecordingService
 * Maintains backward compatibility while delegating to the new decoupled architecture.
 */

import type { RecordingSettings } from '@/types'
import type { ElectronRecordingResult } from '@/types/recording'
import { RecordingService } from './services/recording-service'
import { logger } from '@/lib/utils/logger'

export class ElectronRecorder {
  private service: RecordingService

  constructor() {
    this.service = new RecordingService()
    logger.debug('ElectronRecorder initialized')
  }

  async startRecording(recordingSettings: RecordingSettings): Promise<void> {
    return this.service.start(recordingSettings)
  }

  async stopRecording(): Promise<ElectronRecordingResult> {
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
}
