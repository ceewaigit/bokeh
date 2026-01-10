import { logger } from '@/shared/utils/logger'
import type { RecordingMetadata } from '@/types/project'
import { joinRendererPath } from './renderer-path'

// Filesystem: save metadata as chunked JSON files under recording folder
export const saveMetadataChunks = async (
  recordingFolder: string,
  metadata: any,
  chunkTargetSize = 250_000
): Promise<{ manifest: Required<NonNullable<Pick<import('@/types/project').Recording, 'metadataChunks'>>['metadataChunks']> } | null> => {
  if (!window.electronAPI?.saveRecording || !window.electronAPI?.getRecordingsDirectory) {
    logger.error('Electron API unavailable for saveMetadataChunks')
    return null
  }

  const kinds: Array<{ key: keyof NonNullable<import('@/types/project').Recording['metadata']>, filePrefix: string }> = [
    { key: 'mouseEvents', filePrefix: 'mouse' },
    { key: 'keyboardEvents', filePrefix: 'keyboard' },
    { key: 'clickEvents', filePrefix: 'click' },
    { key: 'scrollEvents', filePrefix: 'scroll' },
    { key: 'screenEvents', filePrefix: 'screen' },
  ]

  const manifest: any = { mouse: [], keyboard: [], click: [], scroll: [], screen: [], transcript: [] }

  for (const { key, filePrefix } of kinds) {
    const events: any[] = (metadata?.[key as any] as any[]) || []
    if (!events || events.length === 0) continue

    let chunkIndex = 0
    let start = 0
    while (start < events.length) {
      let end = Math.min(events.length, start + 5000)
      let dataStr = ''
      let iterations = 0
      while (true) {
        const slice = events.slice(start, end)
        dataStr = JSON.stringify({ [key]: slice })
        if (dataStr.length <= chunkTargetSize || end - start <= 50 || iterations > 10) break
        end = Math.floor((start + end) / 2)
        iterations++
      }

      const fileName = `${filePrefix}-${chunkIndex}.json`
      const filePath = joinRendererPath(recordingFolder, fileName)
      await window.electronAPI.saveRecording(filePath, new TextEncoder().encode(dataStr).buffer)
      manifest[filePrefix].push(fileName)

      start = end
      chunkIndex++
    }
  }

  if (metadata?.transcript) {
    const fileName = 'transcript-0.json'
    const filePath = joinRendererPath(recordingFolder, fileName)
    const payload = JSON.stringify({ transcript: metadata.transcript })
    await window.electronAPI.saveRecording(filePath, new TextEncoder().encode(payload).buffer)
    manifest.transcript.push(fileName)
  }

  return { manifest }
}

export const saveTranscriptChunk = async (
  recordingFolder: string,
  transcript: RecordingMetadata['transcript']
): Promise<string | null> => {
  if (!window.electronAPI?.saveRecording) {
    logger.error('Electron API unavailable for saveTranscriptChunk')
    return null
  }
  if (!transcript) return null

  const fileName = 'transcript-0.json'
  const filePath = joinRendererPath(recordingFolder, fileName)
  const payload = JSON.stringify({ transcript })
  await window.electronAPI.saveRecording(filePath, new TextEncoder().encode(payload).buffer)
  return fileName
}

// Filesystem: load metadata chunks back into a single object
export const loadMetadataChunks = async (
  recordingFolder: string,
  metadataChunks: NonNullable<Pick<import('@/types/project').Recording, 'metadataChunks'>['metadataChunks']>
): Promise<any> => {
  if (!window.electronAPI?.readLocalFile) {
    logger.error('Electron API unavailable for loadMetadataChunks')
    return {}
  }

  const api = window.electronAPI

  const combine = async (files?: string[]) => {
    const list = files || []
    const all: any[] = []
    for (const name of list) {
      const filePath = joinRendererPath(recordingFolder, name)
      const res = await api.readLocalFile!(filePath)
      if (!res?.success || !res.data) {
        throw new Error(`Failed to read metadata chunk: ${filePath}`)
      }
      const json = JSON.parse(new TextDecoder().decode(res.data))
      const arr = (json && Object.values(json)[0]) as any[]
      if (!Array.isArray(arr)) {
        throw new Error(`Invalid metadata chunk format: ${filePath}`)
      }
      all.push(...arr)
    }
    return all
  }

  const loadTranscript = async (files?: string[]) => {
    const list = files || []
    for (const name of list) {
      const filePath = joinRendererPath(recordingFolder, name)
      const res = await api.readLocalFile!(filePath)
      if (!res?.success || !res.data) {
        throw new Error(`Failed to read metadata chunk: ${filePath}`)
      }
      const json = JSON.parse(new TextDecoder().decode(res.data))
      if (json?.transcript) {
        return json.transcript
      }
    }
    return undefined
  }

  const mouseEvents = await combine(metadataChunks.mouse)
  const keyboardEvents = await combine(metadataChunks.keyboard)
  const clickEvents = await combine(metadataChunks.click)
  const scrollEvents = await combine(metadataChunks.scroll)
  const screenEvents = await combine(metadataChunks.screen)
  const transcript = await loadTranscript(metadataChunks.transcript)

  return {
    mouseEvents,
    keyboardEvents,
    clickEvents,
    scrollEvents,
    screenEvents,
    ...(transcript ? { transcript } : {})
  }
}

