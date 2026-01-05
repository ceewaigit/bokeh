import { app } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import { resolveFfmpegPath } from '../utils/ffmpeg-resolver'

export async function extractAudioForTranscription(
  mediaPath: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const ffmpegPath = resolveFfmpegPath()
  const outputPath = path.join(app.getPath('temp'), `whisper-${Date.now()}.wav`)

  const args = [
    '-i', mediaPath,
    '-ar', '16000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    '-y',
    '-progress', 'pipe:2',
    '-nostats',
    outputPath
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args)
    let stderrBuffer = ''
    let durationMs: number | null = null
    let lastProgress = 0

    const parseDurationMs = (line: string) => {
      const match = line.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (!match) return null
      const hours = Number(match[1])
      const minutes = Number(match[2])
      const seconds = Number(match[3])
      if ([hours, minutes, seconds].some(Number.isNaN)) return null
      return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000)
    }

    const handleProgress = (timeMs: number) => {
      if (!durationMs || durationMs <= 0) return
      const progress = Math.max(0, Math.min(1, timeMs / durationMs))
      if (progress - lastProgress < 0.01 && progress < 1) return
      lastProgress = progress
      onProgress?.(progress)
    }

    proc.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderrBuffer += chunk
      const lines = stderrBuffer.split(/\r?\n/)
      stderrBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (durationMs == null) {
          const parsed = parseDurationMs(line)
          if (parsed) durationMs = parsed
        }

        const progressMatch = line.match(/out_time_ms=(\d+)/)
        if (progressMatch) {
          const timeUs = Number(progressMatch[1])
          if (!Number.isNaN(timeUs)) {
            handleProgress(timeUs / 1000)
          }
        }
      }
    })

    proc.on('error', (error) => {
      reject(error)
    })

    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`))
        return
      }
      onProgress?.(1)
      resolve(outputPath)
    })
  })
}
