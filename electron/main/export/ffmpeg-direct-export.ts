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
  // Use minimal environment for FFmpeg - only required variables
  // We explicitly limit env vars to prevent secret leakage to child processes
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin',
    DYLD_LIBRARY_PATH: `${ffmpegDir}:${process.env.DYLD_LIBRARY_PATH || ''}`
  } as unknown as NodeJS.ProcessEnv

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

/**
 * Zoom segment for FFmpeg-based zoom rendering
 */
export interface ZoomSegment {
  startTimeMs: number
  endTimeMs: number
  scale: number
  targetX: number  // 0-1 normalized
  targetY: number  // 0-1 normalized
  introMs: number
  outroMs: number
}

/**
 * Build FFmpeg zoompan filter expression for multiple zoom segments
 * Uses smooth easing (sine) to match Remotion's zoom transitions
 *
 * The zoompan filter syntax:
 * zoompan=z='expr':x='expr':y='expr':d=frames:s=size:fps=fps
 *
 * Where expressions can use:
 * - t: current time in seconds (since zoompan start)
 * - in_t: input video time in seconds
 * - frame: current frame number
 * - on_frame: output frame number
 * - iw, ih: input width/height
 * - zoom: current zoom value
 */
function buildZoompanFilter(
  zoomSegments: ZoomSegment[],
  fps: number,
  inputWidth: number,
  inputHeight: number
): string {
  if (zoomSegments.length === 0) {
    return ''
  }

  // Sort segments by start time
  const sortedSegments = [...zoomSegments].sort((a, b) => a.startTimeMs - b.startTimeMs)

  // Build the zoom expression using FFmpeg's conditional syntax
  // if(between(t,start,end),value,else)
  const zoomExprParts: string[] = []
  const xExprParts: string[] = []
  const yExprParts: string[] = []

  for (const seg of sortedSegments) {
    const startSec = seg.startTimeMs / 1000
    const endSec = seg.endTimeMs / 1000
    const introSec = seg.introMs / 1000
    const outroSec = seg.outroMs / 1000
    const introEndSec = startSec + introSec
    const outroStartSec = endSec - outroSec
    const scale = seg.scale

    // Smooth easing using sine function (matches Remotion's default)
    // During intro: zoom from 1 to scale using sin((t-start)/intro * PI/2)
    // During hold: stay at scale
    // During outro: zoom from scale to 1 using sin((t-outroStart)/outro * PI/2 + PI/2)

    // Intro phase (zoom in)
    const introPhase = `between(in_t,${startSec.toFixed(4)},${introEndSec.toFixed(4)})`
    const introProgress = `(in_t-${startSec.toFixed(4)})/${introSec.toFixed(4)}`
    const introZoom = `1+(${scale}-1)*sin(${introProgress}*PI/2)`

    // Hold phase (full zoom)
    const holdPhase = `between(in_t,${introEndSec.toFixed(4)},${outroStartSec.toFixed(4)})`

    // Outro phase (zoom out)
    const outroPhase = `between(in_t,${outroStartSec.toFixed(4)},${endSec.toFixed(4)})`
    const outroProgress = `(in_t-${outroStartSec.toFixed(4)})/${outroSec.toFixed(4)}`
    const outroZoom = `${scale}-(${scale}-1)*sin(${outroProgress}*PI/2)`

    // Combined zoom expression for this segment
    zoomExprParts.push(`if(${introPhase},${introZoom},if(${holdPhase},${scale},if(${outroPhase},${outroZoom},1)))`)

    // Pan expressions: center the zoom on the target point
    // x = (targetX * iw) - (iw / zoom / 2)
    // y = (targetY * ih) - (ih / zoom / 2)
    const targetXPx = seg.targetX * inputWidth
    const targetYPx = seg.targetY * inputHeight

    // During zoom phases, calculate pan position
    const fullPhase = `between(in_t,${startSec.toFixed(4)},${endSec.toFixed(4)})`
    xExprParts.push(`if(${fullPhase},(${targetXPx.toFixed(1)})-(iw/zoom/2),iw/2-iw/zoom/2)`)
    yExprParts.push(`if(${fullPhase},(${targetYPx.toFixed(1)})-(ih/zoom/2),ih/2-ih/zoom/2)`)
  }

  // Combine all segment expressions
  // For multiple segments, nest them with else clauses defaulting to zoom=1
  let zoomExpr = '1'
  let xExpr = 'iw/2-iw/zoom/2'
  let yExpr = 'ih/2-ih/zoom/2'

  // Build nested if-else chain
  for (let i = zoomExprParts.length - 1; i >= 0; i--) {
    const seg = sortedSegments[i]
    const startSec = seg.startTimeMs / 1000
    const endSec = seg.endTimeMs / 1000
    const phase = `between(in_t,${startSec.toFixed(4)},${endSec.toFixed(4)})`

    zoomExpr = `if(${phase},${zoomExprParts[i]},${zoomExpr})`
    xExpr = `if(${phase},${xExprParts[i]},${xExpr})`
    yExpr = `if(${phase},${yExprParts[i]},${yExpr})`
  }

  // Build the zoompan filter
  // Note: zoompan processes at input fps, outputs at specified fps
  return `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${inputWidth}x${inputHeight}:fps=${fps}`
}

/**
 * Export video with static zoom effects using FFmpeg
 * This is much faster than Remotion for zoom effects that don't follow the cursor
 */
export async function exportDirectWithZoom(
  inputPath: string,
  outputPath: string,
  settings: DirectExportSettings,
  zoomSegments: ZoomSegment[],
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<DirectExportResult> {
  const startTime = Date.now()

  console.log('[DirectExport] Starting STATIC ZOOM fast path export:', {
    input: path.basename(inputPath),
    output: path.basename(outputPath),
    resolution: `${settings.width}x${settings.height}`,
    zoomSegments: zoomSegments.length,
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

    // Build filter chain
    const filters: string[] = []

    // Apply zoompan filter if we have zoom segments
    if (zoomSegments.length > 0) {
      const zoompanFilter = buildZoompanFilter(
        zoomSegments,
        settings.fps,
        settings.width,
        settings.height
      )
      filters.push(zoompanFilter)
    }

    // Scale to output resolution (after zoompan to maintain quality)
    filters.push(`scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease`)
    filters.push(`pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2`)

    // Apply filter chain
    args.push('-vf', filters.join(','))

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
    console.log(`[DirectExport] Static zoom export complete in ${(durationMs / 1000).toFixed(1)}s`)

    return {
      success: true,
      outputPath,
      durationMs,
    }
  } catch (error) {
    console.error('[DirectExport] Static zoom export failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
