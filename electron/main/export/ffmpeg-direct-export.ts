/**
 * FFmpeg Direct Export
 *
 * Fast path for exports without effects - bypasses Remotion entirely.
 * Uses FFmpeg with hardware acceleration for maximum speed.
 */

import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { resolveFfmpegPath } from '../utils/ffmpeg-resolver'

export interface DirectExportSettings {
  /** Output width */
  width: number
  /** Output height */
  height: number
  /** Target framerate */
  fps: number
  /** Video bitrate (e.g., '8M') */
  bitrate: string
  /** Trim start in seconds */
  trimStart?: number
  /** Trim end in seconds */
  trimEnd?: number
  /** Output format */
  format?: 'mp4' | 'mov' | 'webm'
}

export interface DirectExportResult {
  success: boolean
  outputPath?: string
  error?: string
  durationMs?: number
}

/**
 * Run FFmpeg with progress tracking
 */
async function runFfmpegWithProgress(
  args: string[],
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const ffmpegPath = resolveFfmpegPath()
  const ffmpegDir = path.dirname(ffmpegPath)
  const env = {
    ...process.env,
    DYLD_LIBRARY_PATH: `${ffmpegDir}:${process.env.DYLD_LIBRARY_PATH || ''}`
  }

  await new Promise<void>((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error('Export cancelled'))
      return
    }

    const proc: ChildProcess = spawn(ffmpegPath, args, { env })
    let stderr = ''
    let duration = 0

    const abortHandler = () => {
      try {
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 1000).unref?.()
      } catch {
        // ignore kill errors
      }
      reject(new Error('Export cancelled'))
    }

    abortSignal?.addEventListener('abort', abortHandler, { once: true })

    proc.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stderr += chunk

      // Parse duration from initial output
      const durationMatch = chunk.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/)
      if (durationMatch) {
        const hours = parseInt(durationMatch[1], 10)
        const minutes = parseInt(durationMatch[2], 10)
        const seconds = parseInt(durationMatch[3], 10)
        duration = hours * 3600 + minutes * 60 + seconds
      }

      // Parse progress
      if (onProgress && duration > 0) {
        const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+)\.(\d+)/)
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const seconds = parseInt(timeMatch[3], 10)
          const currentTime = hours * 3600 + minutes * 60 + seconds
          const progress = Math.min(99, Math.round((currentTime / duration) * 100))
          onProgress(progress)
        }
      }
    })

    proc.on('exit', (code) => {
      abortSignal?.removeEventListener('abort', abortHandler)
      if (code === 0) {
        onProgress?.(100)
        resolve()
      } else {
        reject(new Error(stderr || `ffmpeg exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      abortSignal?.removeEventListener('abort', abortHandler)
      reject(err)
    })
  })
}

/**
 * Export video directly using FFmpeg - fast path for effect-free exports
 *
 * @param inputPath - Source video file path
 * @param outputPath - Destination file path
 * @param settings - Export settings (resolution, bitrate, trim)
 * @param onProgress - Progress callback (0-100)
 * @param abortSignal - Optional abort signal for cancellation
 */
export async function exportDirect(
  inputPath: string,
  outputPath: string,
  settings: DirectExportSettings,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<DirectExportResult> {
  const startTime = Date.now()

  console.log('[DirectExport] Starting fast path export:', {
    input: path.basename(inputPath),
    output: path.basename(outputPath),
    resolution: `${settings.width}x${settings.height}`,
    bitrate: settings.bitrate,
  })

  try {
    const args: string[] = [
      '-hide_banner',
      '-y', // Overwrite output
    ]

    // Trim start (before input for fast seeking)
    if (settings.trimStart && settings.trimStart > 0) {
      args.push('-ss', settings.trimStart.toString())
    }

    // Input file
    args.push('-i', inputPath)

    // Trim end (after input for duration)
    if (settings.trimEnd && settings.trimEnd > 0) {
      args.push('-to', settings.trimEnd.toString())
    }

    // Video filter for scaling (only if needed)
    args.push('-vf', `scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2`)

    // Framerate
    args.push('-r', settings.fps.toString())

    // Try hardware encoding first (macOS VideoToolbox)
    if (process.platform === 'darwin') {
      args.push(
        '-c:v', 'h264_videotoolbox',
        '-allow_sw', '1', // Allow software fallback
        '-profile:v', 'high',
        '-b:v', settings.bitrate,
      )
    } else {
      // Software encoding fallback
      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-b:v', settings.bitrate,
      )
    }

    // Audio (pass through or re-encode)
    args.push(
      '-c:a', 'aac',
      '-b:a', '192k',
    )

    // Output optimizations
    args.push(
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
    )

    // Output file
    args.push(outputPath)

    await runFfmpegWithProgress(args, onProgress, abortSignal)

    const durationMs = Date.now() - startTime
    console.log(`[DirectExport] Export complete in ${(durationMs / 1000).toFixed(1)}s`)

    return {
      success: true,
      outputPath,
      durationMs,
    }
  } catch (error) {
    console.error('[DirectExport] Export failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Export multiple clips concatenated using FFmpeg
 * For timelines with multiple clips but no effects
 */
export async function exportDirectWithConcat(
  inputPaths: Array<{ path: string; startTime: number; duration: number }>,
  outputPath: string,
  settings: DirectExportSettings,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<DirectExportResult> {
  // For single input, use simple export
  if (inputPaths.length === 1) {
    return exportDirect(inputPaths[0].path, outputPath, settings, onProgress, abortSignal)
  }

  // For multiple inputs, use concat filter
  const startTime = Date.now()

  console.log('[DirectExport] Starting multi-clip fast path export:', {
    clips: inputPaths.length,
    resolution: `${settings.width}x${settings.height}`,
  })

  try {
    const args: string[] = ['-hide_banner', '-y']

    // Add all inputs
    for (const input of inputPaths) {
      args.push('-i', input.path)
    }

    // Build concat filter complex
    const filterParts: string[] = []
    for (let i = 0; i < inputPaths.length; i++) {
      filterParts.push(`[${i}:v:0][${i}:a:0]`)
    }
    const filterComplex = `${filterParts.join('')}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`

    args.push('-filter_complex', filterComplex)
    args.push('-map', '[outv]', '-map', '[outa]')

    // Video filter for scaling
    args.push('-vf', `scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2`)

    // Encoding settings (same as single export)
    if (process.platform === 'darwin') {
      args.push(
        '-c:v', 'h264_videotoolbox',
        '-allow_sw', '1',
        '-profile:v', 'high',
        '-b:v', settings.bitrate,
      )
    } else {
      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
      )
    }

    args.push(
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    )

    await runFfmpegWithProgress(args, onProgress, abortSignal)

    const durationMs = Date.now() - startTime
    console.log(`[DirectExport] Multi-clip export complete in ${(durationMs / 1000).toFixed(1)}s`)

    return {
      success: true,
      outputPath,
      durationMs,
    }
  } catch (error) {
    console.error('[DirectExport] Multi-clip export failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
