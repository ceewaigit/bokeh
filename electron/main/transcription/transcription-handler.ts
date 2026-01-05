import fs from 'fs'
import path from 'path'
import { extractAudioForTranscription } from './audio-extractor'
import { resolveModelPath } from './model-manager'
import { runWhisper } from './whisper-runner'
import type { TranscriptionProgress, TranscriptionResult, TranscriptionStartOptions } from './types'
import { resolveRecordingFilePath } from '../utils/file-resolution'
import type { ChildProcess } from 'child_process'

export async function transcribeRecording(
  options: TranscriptionStartOptions,
  onProgress: (progress: TranscriptionProgress) => void,
  controls?: {
    signal?: AbortSignal
    onSpawn?: (process: ChildProcess) => void
  }
): Promise<TranscriptionResult> {
  let audioPath: string | null = null
  let outputJson: string | null = null

  try {
    if (controls?.signal?.aborted) {
      return { success: false, error: 'Transcription canceled' }
    }

    onProgress({ recordingId: options.recordingId, stage: 'extract', progress: 0 })
    const resolvedPath = resolveRecordingFilePath(options.filePath, options.folderPath)
    if (!resolvedPath) {
      return { success: false, error: 'Recording file not found' }
    }

    audioPath = await extractAudioForTranscription(resolvedPath, (progress) => {
      onProgress({ recordingId: options.recordingId, stage: 'extract', progress })
    })
    onProgress({ recordingId: options.recordingId, stage: 'extract', progress: 1 })

    const modelName = options.modelName ?? 'base'
    const modelPath = resolveModelPath(modelName)

    if (controls?.signal?.aborted) {
      return { success: false, error: 'Transcription canceled' }
    }

    onProgress({ recordingId: options.recordingId, stage: 'transcribe', message: 'Running whisper' })
    const outputBase = path.join(
      path.dirname(audioPath),
      `whisper-${Date.now()}`
    )
    outputJson = `${outputBase}.json`
    await runWhisper({
      audioPath,
      modelPath,
      outputBase,
      language: options.language,
      signal: controls?.signal,
      onSpawn: controls?.onSpawn,
      onProgress: ({ progress, message }) => onProgress({
        recordingId: options.recordingId,
        stage: 'transcribe',
        progress,
        message
      })
    })

    onProgress({ recordingId: options.recordingId, stage: 'parse' })
    const raw = await fs.promises.readFile(outputJson, 'utf8')
    const parsed = JSON.parse(raw)

    // Support both whisper output formats:
    // - Older (v1.7.x): transcription[] with tokens[]
    // - Newer (v1.8+): segments[] with words[]
    let words: Array<{ id: string; text: string; startTime: number; endTime: number; confidence: number }> = []

    const mergeTokenWords = (tokens: Array<{ text?: string; offsets?: { from?: number; to?: number }; p?: number }>) => {
      const merged: Array<{ text: string; startTime: number; endTime: number; confidence: number }> = []
      let current: { text: string; startTime: number; endTime: number; confidenceSum: number; count: number } | null = null

      for (const token of tokens) {
        const rawText = String(token.text ?? '')
        if (!rawText) continue
        if (rawText.startsWith('[') && rawText.endsWith(']')) continue

        const startsNewWord = rawText.startsWith(' ')
        const tokenText = startsNewWord ? rawText.trim() : rawText.trimStart()
        if (!tokenText) continue

        const startTime = Math.max(0, token.offsets?.from ?? 0)
        const endTime = Math.max(0, token.offsets?.to ?? startTime)
        const confidence = Number(token.p ?? 1)

        if (!current || startsNewWord) {
          if (current) {
            merged.push({
              text: current.text,
              startTime: current.startTime,
              endTime: current.endTime,
              confidence: current.count > 0 ? current.confidenceSum / current.count : 1
            })
          }
          current = {
            text: tokenText,
            startTime,
            endTime,
            confidenceSum: confidence,
            count: 1
          }
        } else {
          current.text += tokenText
          current.endTime = Math.max(current.endTime, endTime)
          current.confidenceSum += confidence
          current.count += 1
        }
      }

      if (current) {
        merged.push({
          text: current.text,
          startTime: current.startTime,
          endTime: current.endTime,
          confidence: current.count > 0 ? current.confidenceSum / current.count : 1
        })
      }

      return merged
    }

    const mergeSegmentWords = (tokens: Array<{ word?: string; start?: number; end?: number; probability?: number }>) => {
      const merged: Array<{ text: string; startTime: number; endTime: number; confidence: number }> = []
      let current: { text: string; startTime: number; endTime: number; confidenceSum: number; count: number } | null = null

      for (const token of tokens) {
        const rawText = String(token.word ?? '')
        if (!rawText) continue
        if (rawText.startsWith('[') && rawText.endsWith(']')) continue

        const startsNewWord = rawText.startsWith(' ')
        const tokenText = startsNewWord ? rawText.trim() : rawText.trimStart()
        if (!tokenText) continue

        const startTime = Math.max(0, Math.round((token.start ?? 0) * 1000))
        const endTime = Math.max(0, Math.round((token.end ?? 0) * 1000))
        const confidence = Number(token.probability ?? 1)

        if (!current || startsNewWord) {
          if (current) {
            merged.push({
              text: current.text,
              startTime: current.startTime,
              endTime: current.endTime,
              confidence: current.count > 0 ? current.confidenceSum / current.count : 1
            })
          }
          current = {
            text: tokenText,
            startTime,
            endTime,
            confidenceSum: confidence,
            count: 1
          }
        } else {
          current.text += tokenText
          current.endTime = Math.max(current.endTime, endTime)
          current.confidenceSum += confidence
          current.count += 1
        }
      }

      if (current) {
        merged.push({
          text: current.text,
          startTime: current.startTime,
          endTime: current.endTime,
          confidence: current.count > 0 ? current.confidenceSum / current.count : 1
        })
      }

      return merged
    }

    if (parsed?.segments) {
      // Newer format: segments with words (sometimes tokenized)
      words = (parsed.segments ?? [])
        .flatMap((segment: any) => mergeSegmentWords(segment.words ?? []))
        .map((word: any, index: number) => ({
          id: `${options.recordingId}-word-${index}`,
          text: String(word.text ?? '').trim(),
          startTime: Math.max(0, word.startTime),
          endTime: Math.max(0, word.endTime),
          confidence: Number(word.confidence ?? 1)
        }))
        .filter((word: { text: string }) => word.text.length > 0)
    } else if (parsed?.transcription) {
      // Older format: transcription array with tokens
      words = (parsed.transcription ?? [])
        .flatMap((segment: any) => {
          const tokens = segment.tokens ?? []
          return mergeTokenWords(tokens)
        })
        .map((word: any, index: number) => ({
          id: `${options.recordingId}-word-${index}`,
          text: word.text,
          startTime: Math.max(0, word.startTime),
          endTime: Math.max(0, word.endTime),
          confidence: Number(word.confidence ?? 1)
        }))
        .filter((word: { text: string }) => word.text.length > 0)
    }

    const transcript = {
      id: `transcript-${Date.now()}`,
      recordingId: options.recordingId,
      language: parsed?.result?.language ?? parsed?.language ?? options.language ?? 'en',
      modelUsed: modelName,
      generatedAt: new Date().toISOString(),
      words
    }

    return { success: true, transcript }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed'
    return { success: false, error: message }
  } finally {
    const cleanup = async (filePath: string | null) => {
      if (!filePath) return
      try {
        await fs.promises.unlink(filePath)
      } catch {
        // Best-effort cleanup; ignore missing files.
      }
    }
    await cleanup(audioPath)
    await cleanup(outputJson)
  }
}
