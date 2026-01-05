import { spawn } from 'child_process'
import path from 'path'
import { findWhisperBinary } from './whisper-binary-manager'

export interface WhisperRunOptions {
  audioPath: string
  modelPath: string
  language?: string
  outputBase?: string
  onProgress?: (update: { progress?: number; message?: string }) => void
  signal?: AbortSignal
  onSpawn?: (process: ReturnType<typeof spawn>) => void
}

export function resolveWhisperCliPath(): string {
  const binaryPath = findWhisperBinary()
  if (binaryPath) {
    return binaryPath
  }

  const platform = process.platform
  const arch = process.arch
  throw new Error(`whisper binary not found for ${platform}-${arch}`)
}

export async function runWhisper(options: WhisperRunOptions): Promise<string> {
  const outputBase = options.outputBase ?? path.join(
    path.dirname(options.audioPath),
    `whisper-${Date.now()}`
  )
  const outputJson = `${outputBase}.json`
  const args = [
    '-m', options.modelPath,
    '--output-json-full',  // Full JSON includes word-level timestamps
    '--output-file', outputBase,
  ]

  if (options.language) {
    args.push('--language', options.language)
  }

  // Audio file as positional argument (required for whisper main binary)
  args.push(options.audioPath)

  const whisperPath = resolveWhisperCliPath()

  console.log('[Whisper] Running:', whisperPath, args.join(' '))

  return new Promise((resolve, reject) => {
    const proc = spawn(whisperPath, args)
    options.onSpawn?.(proc)

    let aborted = false
    const handleAbort = () => {
      aborted = true
      if (!proc.killed) {
        proc.kill('SIGTERM')
      }
    }

    if (options.signal) {
      if (options.signal.aborted) {
        handleAbort()
      } else {
        options.signal.addEventListener('abort', handleAbort, { once: true })
      }
    }

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stderrBuffer = ''
    let lastPercent: number | null = null

    proc.stdout.on('data', (data) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
      stdoutChunks.push(buffer)
      console.log('[Whisper stdout]:', buffer.toString())
    })
    proc.stderr.on('data', (data) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
      const chunk = buffer.toString()
      stderrChunks.push(buffer)
      console.error('[Whisper stderr]:', chunk)
      stderrBuffer += chunk

      const lines = stderrBuffer.split(/\r?\n/)
      stderrBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const match = line.match(/(\d{1,3})%/)
        if (!match) continue
        const percent = Number(match[1])
        if (Number.isNaN(percent) || percent < 0 || percent > 100) continue
        if (percent === lastPercent) continue
        lastPercent = percent
        options.onProgress?.({ progress: percent / 100, message: line.trim() })
      }
    })

    proc.on('exit', (code) => {
      if (options.signal) {
        options.signal.removeEventListener('abort', handleAbort)
      }

      if (aborted) {
        reject(new Error('Transcription canceled'))
        return
      }

      const stdout = Buffer.concat(stdoutChunks).toString()
      const stderr = Buffer.concat(stderrChunks).toString()

      if (code !== 0) {
        console.error('[Whisper Failed]', { code, stdout, stderr, args })
        reject(new Error(`whisper exited with code ${code}\nStderr: ${stderr}`))
        return
      }
      resolve(outputJson)
    })

    proc.on('error', (err) => {
      console.error('[Whisper Process Error]', err)
      if (options.signal) {
        options.signal.removeEventListener('abort', handleAbort)
      }
      reject(err)
    })
  })
}
