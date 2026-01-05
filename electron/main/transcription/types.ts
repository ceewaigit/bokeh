export type TranscriptionStatus =
  | 'none'
  | 'pending'
  | 'processing'
  | 'complete'
  | 'failed'

export interface TranscriptionStartOptions {
  recordingId: string
  filePath: string
  folderPath?: string
  modelName?: string
  language?: string
}

export interface TranscriptionProgress {
  recordingId: string
  stage: 'extract' | 'transcribe' | 'parse' | 'download' | 'install'
  progress?: number
  message?: string
  modelName?: string
}

export interface TranscriptionResult {
  success: boolean
  transcript?: {
    id: string
    recordingId: string
    language: string
    modelUsed: string
    generatedAt: string
    words: Array<{
      id: string
      text: string
      startTime: number
      endTime: number
      confidence: number
    }>
  }
  error?: string
}

export interface TranscriptionStatusUpdate {
  recordingId: string
  status: TranscriptionStatus
  message?: string
}
