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

    /**
     * Merge tokens/words into word-level entries.
     * Handles both old format (tokens with text/offsets/p) and new format (words with word/start/end/probability).
     */
    const mergeWords = <T>(
      tokens: T[],
      accessor: (token: T) => { text: string; startTime: number; endTime: number; confidence: number } | null
    ) => {
      const merged: Array<{ text: string; startTime: number; endTime: number; confidence: number }> = []
      let current: { text: string; startTime: number; endTime: number; confidenceSum: number; count: number } | null = null

      for (const token of tokens) {
        const extracted = accessor(token)
        if (!extracted) continue

        const { text: rawText, startTime, endTime, confidence } = extracted
        if (!rawText) continue
        if (rawText.startsWith('[') && rawText.endsWith(']')) continue

        const startsNewWord = rawText.startsWith(' ')
        const tokenText = startsNewWord ? rawText.trim() : rawText.trimStart()
        if (!tokenText) continue

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

    // Accessor for old format (v1.7.x): tokens with text/offsets/p
    const tokenAccessor = (token: { text?: string; offsets?: { from?: number; to?: number }; p?: number }) => ({
      text: String(token.text ?? ''),
      startTime: Math.max(0, token.offsets?.from ?? 0),
      endTime: Math.max(0, token.offsets?.to ?? 0),
      confidence: Number(token.p ?? 1)
    })

    // Accessor for new format (v1.8+): words with word/start/end/probability (times in seconds)
    const segmentWordAccessor = (token: { word?: string; start?: number; end?: number; probability?: number }) => ({
      text: String(token.word ?? ''),
      startTime: Math.max(0, Math.round((token.start ?? 0) * 1000)),
      endTime: Math.max(0, Math.round((token.end ?? 0) * 1000)),
      confidence: Number(token.probability ?? 1)
    })

    if (parsed?.segments) {
      // Newer format: segments with words (sometimes tokenized)
      words = (parsed.segments ?? [])
        .flatMap((segment: any) => mergeWords(segment.words ?? [], segmentWordAccessor))
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
        .flatMap((segment: any) => mergeWords(segment.tokens ?? [], tokenAccessor))
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
