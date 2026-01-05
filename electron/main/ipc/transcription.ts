import { ipcMain, IpcMainInvokeEvent } from 'electron'
import type { ChildProcess } from 'child_process'
import { downloadModel, getAvailableModelNames, listModels, recommendModel } from '../transcription/model-manager'
import { getWhisperBinaryStatus, installWhisperBinary } from '../transcription/whisper-binary-manager'
import { transcribeRecording } from '../transcription/transcription-handler'
import type { TranscriptionProgress, TranscriptionResult, TranscriptionStartOptions, TranscriptionStatusUpdate } from '../transcription/types'

interface ActiveTranscription {
  controller: AbortController
  process?: ChildProcess
}

const activeTranscriptions = new Map<string, ActiveTranscription>()
const progressThrottleMs = 100
const lastProgressSent = new Map<string, { time: number; stage: string }>()

function sendProgress(event: IpcMainInvokeEvent, progress: TranscriptionProgress): void {
  const key = `${event.sender.id}:${progress.recordingId}`
  const now = Date.now()
  const last = lastProgressSent.get(key)
  const stageChanged = !last || last.stage !== progress.stage
  const isFractional = progress.progress != null && progress.progress <= 1
  const isComplete = progress.progress != null && (isFractional ? progress.progress >= 1 : progress.progress >= 100)
  if (!stageChanged && !isComplete && last && now - last.time < progressThrottleMs) {
    return
  }
  lastProgressSent.set(key, { time: now, stage: progress.stage })
  event.sender.send('transcription:progress', progress)
}

function sendStatus(event: IpcMainInvokeEvent, update: TranscriptionStatusUpdate): void {
  event.sender.send('transcription:status', update)
}

export function registerTranscriptionHandlers(): void {
  ipcMain.handle('transcription:list-models', async () => {
    return {
      available: getAvailableModelNames(),
      downloaded: listModels()
    }
  })

  ipcMain.handle('transcription:recommend-model', async () => {
    return recommendModel()
  })

  ipcMain.handle('transcription:download-model', async (event, modelName: string) => {
    sendProgress(event, {
      recordingId: '',
      stage: 'download',
      progress: 0,
      modelName
    })

    try {
      const filePath = await downloadModel(modelName, (progress) => {
        sendProgress(event, {
          recordingId: '',
          stage: 'download',
          progress,
          modelName
        })
      })

      sendProgress(event, {
        recordingId: '',
        stage: 'download',
        progress: 1,
        modelName
      })

      return { success: true, filePath }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Model download failed'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('transcription:start', async (event, options: TranscriptionStartOptions): Promise<TranscriptionResult> => {
    const recordingId = options.recordingId
    if (activeTranscriptions.size > 0) {
      return { success: false, error: 'Another transcription is already in progress. Please wait for it to finish.' }
    }
    if (activeTranscriptions.has(recordingId)) {
      return { success: false, error: 'Transcription already in progress' }
    }

    const controller = new AbortController()
    const entry: ActiveTranscription = { controller }
    activeTranscriptions.set(recordingId, entry)

    sendStatus(event, { recordingId, status: 'processing' })

    try {
      const result = await transcribeRecording(
        options,
        (progress) => sendProgress(event, progress),
        {
          signal: controller.signal,
          onSpawn: (process) => {
            entry.process = process
          }
        }
      )

      if (result.success) {
        sendStatus(event, { recordingId, status: 'complete' })
      } else if (result.error?.toLowerCase().includes('canceled')) {
        sendStatus(event, { recordingId, status: 'none', message: 'Canceled' })
      } else {
        sendStatus(event, { recordingId, status: 'failed', message: result.error })
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed'
      sendStatus(event, { recordingId, status: 'failed', message })
      return { success: false, error: message }
    } finally {
      activeTranscriptions.delete(recordingId)
    }
  })

  ipcMain.handle('transcription:cancel', async (_event, recordingId: string) => {
    const entry = activeTranscriptions.get(recordingId)
    if (!entry) {
      return { success: false, error: 'No active transcription' }
    }
    entry.controller.abort()
    if (entry.process && !entry.process.killed) {
      entry.process.kill('SIGTERM')
    }
    return { success: true }
  })

  ipcMain.handle('transcription:whisper-status', async () => {
    return getWhisperBinaryStatus()
  })

  ipcMain.handle('transcription:install-whisper', async (event) => {
    return installWhisperBinary((stage, progress) => {
      sendProgress(event, {
        recordingId: '',
        stage: 'install',
        progress,
        message: `Installing whisper: ${stage}`
      })
    })
  })
}
