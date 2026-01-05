import type { TranscriptionStatus } from './project'

export type TranscriptionStage = 'extract' | 'transcribe' | 'parse' | 'download' | 'install'

export interface TranscriptionProgress {
  recordingId: string
  stage: TranscriptionStage
  progress?: number
  message?: string
  modelName?: string
}

export interface TranscriptionStatusUpdate {
  recordingId: string
  status: TranscriptionStatus
  message?: string
}

export interface TranscriptionStartOptions {
  recordingId: string
  filePath: string
  folderPath?: string
  modelName?: string
  language?: string
}

export interface TranscriptionModelInfo {
  name: string
  filePath: string
  sizeBytes: number
}

export interface TranscriptionModelList {
  available: string[]
  downloaded: TranscriptionModelInfo[]
}
