/**
 * Export handler - Main orchestrator
 * Registers IPC handlers and coordinates export operations
 */

import { ipcMain, app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'

import { machineProfiler } from '../utils/machine-profiler'
import { makeVideoSrc, makeMetadataSrc } from '../utils/video-url-factory'
import { getVideoServer } from '../services/video-http-server'
import { getRecordingsDirectory } from '../config'
import { resolveFfmpegPath, resolveFfprobePath, getCompositorDirectory } from '../utils/ffmpeg-resolver'
import { normalizeCrossPlatform } from '../utils/path-normalizer'
import { ensureExportProxy, getExistingProxyPath, getVideoDimensions } from '../services/proxy-service'
import { isPathWithinAny } from '../utils/path-validation'
import { assertTrustedIpcSender } from '../utils/ipc-security'

import { getBundleLocation, cleanupBundleCache } from './bundle-manager'
import { buildChunkPlan, calculateStableChunkSize } from './chunk-planner'
import { getExportStrategy } from './worker-allocator'
import { ProgressTracker } from './progress-tracker'
import {
  runSequentialExport,
  runParallelExport,
  cleanupExportResources,
  cancelExport,
  getWorkerPath
} from './worker-coordinator'

import type { ExportJobConfig, CompositionMetadata } from './types'

import { mapRecordingEffectsToTimeline } from './utils/effect-mapper'
import { exportDirect, exportDirectWithZoom, type DirectExportSettings, type ZoomSegment } from './ffmpeg-direct-export'

// Re-export cleanup function for app lifecycle
export { cleanupBundleCache }

const STREAM_FILE_TTL_MS = 15 * 60 * 1000
const activeStreamFiles = new Map<string, number>()

function trackStreamFile(filePath: string): void {
  const normalized = path.resolve(filePath)
  activeStreamFiles.set(normalized, Date.now() + STREAM_FILE_TTL_MS)
}

function isTrackedStreamFile(filePath: string): boolean {
  const now = Date.now()
  for (const [key, expiresAt] of activeStreamFiles) {
    if (expiresAt <= now) activeStreamFiles.delete(key)
  }
  const normalized = path.resolve(filePath)
  return activeStreamFiles.has(normalized)
}

function consumeTrackedStreamFile(filePath: string): void {
  activeStreamFiles.delete(path.resolve(filePath))
}

let currentExportAbortController: AbortController | null = null

// These constants are duplicated from src/shared/constants/resolution-tiers.ts
// because electron's tsconfig.json doesn't have @/ path aliases configured.
const MAX_PROXY_WIDTH = 3840
const MAX_PROXY_HEIGHT = 2160

interface ProxyDimensionResult {
  width: number
  height: number
  needsProxy: boolean
}

function calculateProxyDimensions(opts: {
  outputWidth: number
  outputHeight: number
  sourceWidth: number
  sourceHeight: number
  maxZoomScale: number
}): ProxyDimensionResult {
  const { outputWidth, outputHeight, sourceWidth, sourceHeight, maxZoomScale } = opts
  const maxW = Math.min(outputWidth * maxZoomScale, sourceWidth, MAX_PROXY_WIDTH)
  const maxH = Math.min(outputHeight * maxZoomScale, sourceHeight, MAX_PROXY_HEIGHT)
  const width = Math.ceil(maxW / 2) * 2
  const height = Math.ceil(maxH / 2) * 2
  const needsProxy =
    width > 0 &&
    height > 0 &&
    (width < sourceWidth * 0.85 || height < sourceHeight * 0.85)

  return { width, height, needsProxy }
}

function createExportTiming() {
  const start = Date.now()
  let lastMark = start

  const mark = (label: string) => {
    const now = Date.now()
    const deltaSeconds = (now - lastMark) / 1000
    console.log(`[Export] Timing ${label}: ${deltaSeconds.toFixed(2)}s`)
    lastMark = now
  }

  const summary = (label = 'total') => {
    const totalSeconds = (Date.now() - start) / 1000
    console.log(`[Export] Timing ${label}: ${totalSeconds.toFixed(2)}s`)
  }

  return { mark, summary }
}

function getMaxZoomScaleFromEffects(effects: any[]): number {
  let maxScale = 1
  for (const effect of effects) {
    if (effect?.type === 'zoom' && effect?.enabled !== false) {
      const scale = effect?.data?.scale || 1
      if (scale > maxScale) maxScale = scale
    }
  }
  return maxScale
}

async function getPrimaryVideoCodecName(ffprobePath: string, videoPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=nw=1:nk=1',
      videoPath,
    ]

    let output = ''
    const proc = spawn(ffprobePath, args)
    const timeout = setTimeout(() => {
      proc.kill()
      resolve(null)
    }, 5000)

    proc.stdout?.on('data', (data) => {
      output += data.toString()
    })

    proc.on('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        const codec = output.trim().split('\n')[0]?.trim()
        resolve(codec || null)
        return
      }
      resolve(null)
    })

    proc.on('error', () => {
      clearTimeout(timeout)
      resolve(null)
    })
  })
}

function shouldForceExportProxyForCodec(codecName: string | null): boolean {
  if (!codecName) return false
  const normalized = codecName.trim().toLowerCase()
  // Chromium decode support is more limited than macOS/Electron playback.
  // HEVC/H.265 is a common culprit for exports hanging (video never becomes ready -> delayRender timeout).
  return normalized === 'hevc' || normalized === 'h265' || normalized === 'prores' || normalized === 'dnxhd'
}

function shouldForceExportProxyForContainer(videoPath: string): boolean {
  const lower = videoPath.toLowerCase()
  // QuickTime .mov is frequently HEVC and is a common export hang in Chromium.
  return lower.endsWith('.mov')
}

function estimateH264BitrateMbps(opts: { width: number; height: number; fps: number }): number {
  const { width, height, fps } = opts
  const referencePixels = 1920 * 1080
  const pixelRatio = Math.max(0.1, (width * height) / referencePixels)
  const fpsRatio = Math.max(0.5, fps / 30)
  // 1080p30 ~= 6 Mbps (baseline), scale with pixels and fps and clamp.
  const estimated = 6 * pixelRatio * fpsRatio
  return Math.max(6, Math.min(40, Math.round(estimated)))
}

export function isExportInProgress(): boolean {
  return currentExportAbortController !== null
}

/**
 * Resolve video paths and create HTTP URLs for export
 */
export async function resolveVideoUrls(
  recordings: Array<[string, any]>,
  projectFolder: string | undefined,
  recordingsDir: string
): Promise<{ videoUrls: Record<string, string>; videoFilePaths: Record<string, string>; absolutePaths: Record<string, string> }> {
  const videoUrls: Record<string, string> = {}
  const videoFilePaths: Record<string, string> = {}
  const absolutePaths: Record<string, string> = {}
  const normalizedRecordingsDir = normalizeCrossPlatform(recordingsDir)

  const startedAt = Date.now()
  for (const [recordingId, recording] of recordings) {
    if (recording.filePath) {
      let fullPath = normalizeCrossPlatform(recording.filePath)

      if (!path.isAbsolute(fullPath)) {
        const candidates = new Set<string>()
        const fileName = path.basename(fullPath)

        if (recording.folderPath) {
          const normalizedFolder = normalizeCrossPlatform(recording.folderPath)
          candidates.add(path.join(normalizedFolder, fileName))

          const folderParent = path.dirname(normalizedFolder)
          if (folderParent && folderParent !== normalizedFolder) {
            candidates.add(path.join(folderParent, fullPath))
            candidates.add(path.join(folderParent, fileName))
          }
        }

        if (projectFolder) {
          const normalizedProject = normalizeCrossPlatform(projectFolder)
          candidates.add(path.join(normalizedProject, fullPath))
          candidates.add(path.join(normalizedProject, fileName))
        }

        candidates.add(path.join(normalizedRecordingsDir, fullPath))
        candidates.add(path.join(normalizedRecordingsDir, fileName))

        for (const candidate of candidates) {
          if (fsSync.existsSync(candidate)) {
            fullPath = candidate
            break
          }
        }
      }

      const normalizedPath = path.resolve(fullPath)

      // Security: Validate that resolved paths are within allowed directories
      const tempDir = path.resolve(app.getPath('temp'))
      const userDataDir = path.resolve(app.getPath('userData'))
      const allowedExportDirs = [
        path.resolve(recordingsDir),
        tempDir,
        userDataDir,
        // Also allow project folder if specified
        ...(projectFolder ? [path.resolve(normalizeCrossPlatform(projectFolder))] : [])
      ]

      if (!isPathWithinAny(normalizedPath, allowedExportDirs)) {
        console.error('[Export] Access denied: video path outside allowed directories:', normalizedPath)
        continue // Skip this recording - don't export files from unauthorized locations
      }

      absolutePaths[recordingId] = normalizedPath

      // Provide both:
      // - `videoUrls`: HTTP URLs for <Video> (Chromium security blocks file:// in many cases)
      // - `videoFilePaths`: HTTP URLs for <OffthreadVideo> (Remotion compositor only supports http(s) sources)
      const httpUrl = await makeVideoSrc(normalizedPath, 'export')
      videoUrls[recordingId] = httpUrl

      // OffthreadVideo should use HTTP sources for compositor compatibility
      videoFilePaths[recordingId] = httpUrl
    }
  }

  console.log(
    '[ExportDebug] resolveVideoUrls',
    JSON.stringify({
      recordings: recordings.length,
      resolved: Object.keys(videoUrls).length,
      ms: Date.now() - startedAt,
    })
  )

  return { videoUrls, videoFilePaths, absolutePaths }
}

/**
 * URL set for metadata chunks (mirrors MetadataUrlSet from metadata-loader.ts)
 */
interface MetadataUrlSet {
  mouse?: string[]
  keyboard?: string[]
  click?: string[]
  scroll?: string[]
  screen?: string[]
  transcript?: string[]
}

/**
 * Resolve metadata chunk paths and create HTTP URLs for export
 */
export async function resolveMetadataUrls(
  recordings: Array<[string, any]>,
  projectFolder: string | undefined,
  recordingsDir: string
): Promise<Record<string, MetadataUrlSet>> {
  const result: Record<string, MetadataUrlSet> = {}
  const normalizedRecordingsDir = normalizeCrossPlatform(recordingsDir)

  for (const [recordingId, recording] of recordings) {
    // Skip recordings without metadata chunks
    if (!recording.metadataChunks) {
      continue
    }

    // Resolve the folder path
    let folderPath = recording.folderPath
    if (!folderPath) {
      continue
    }

    // Normalize folder path
    folderPath = normalizeCrossPlatform(folderPath)
    if (!path.isAbsolute(folderPath)) {
      // Try various base paths
      const candidates = [
        projectFolder ? path.join(normalizeCrossPlatform(projectFolder), folderPath) : null,
        path.join(normalizedRecordingsDir, folderPath),
      ].filter(Boolean) as string[]

      for (const candidate of candidates) {
        if (fsSync.existsSync(candidate)) {
          folderPath = candidate
          break
        }
      }
    }

    const urlSet: MetadataUrlSet = {}
    const chunks = recording.metadataChunks

    // Register each metadata chunk type
    for (const [type, chunkFiles] of Object.entries(chunks) as Array<[keyof MetadataUrlSet, string[] | undefined]>) {
      if (!chunkFiles?.length) continue

      const urls: string[] = []
      for (const chunkFile of chunkFiles) {
        const chunkPath = path.join(folderPath, chunkFile)
        if (fsSync.existsSync(chunkPath)) {
          const url = await makeMetadataSrc(chunkPath, 'export')
          urls.push(url)
        } else {
          console.warn(`[Export] Metadata chunk not found: ${chunkPath}`)
        }
      }

      if (urls.length > 0) {
        urlSet[type] = urls
      }
    }

    // Only add if we have any URLs
    if (Object.keys(urlSet).length > 0) {
      result[recordingId] = urlSet
      console.log(`[Export] Registered metadata URLs for ${recordingId}:`, {
        mouse: urlSet.mouse?.length || 0,
        keyboard: urlSet.keyboard?.length || 0,
        click: urlSet.click?.length || 0,
        scroll: urlSet.scroll?.length || 0,
        screen: urlSet.screen?.length || 0
      })
    }
  }

  return result
}

/**
 * Extract all clips from segments
 */
export function extractClipsFromSegments(segments: any[]): any[] {
  const allClips: any[] = []
  const seenClipIds = new Set<string>()

  if (segments) {
    for (const segment of segments) {
      if (segment.clips) {
        for (const clipData of segment.clips) {
          if (clipData.clip && !seenClipIds.has(clipData.clip.id)) {
            allClips.push(clipData.clip)
            seenClipIds.add(clipData.clip.id)
          }
        }
      }
    }
  }

  return allClips.sort((a, b) => a.startTime - b.startTime)
}

/**
 * Collect all effects from segments
 */
export function extractEffectsFromSegments(segments: any[]): any[] {
  const allEffects: any[] = []
  if (segments) {
    for (const segment of segments) {
      if (segment.effects) {
        allEffects.push(...segment.effects)
      }
    }
  }
  return allEffects
}

/**
 * Check if the export can use the fast FFmpeg path (no Remotion needed)
 * Returns true if there are no effects that require per-frame rendering
 */
export function canUseFastPath(
  effects: any[],
  settings: any,
  webcamClips: any[] = [],
  audioClips: any[] = []
): { canUse: boolean; reason?: string } {
  // Check for zoom effects with scale > 1
  const hasZoom = effects.some((e: any) =>
    e?.type === 'zoom' && e?.enabled !== false && ((e?.data?.scale ?? 1) > 1.01)
  )
  if (hasZoom) {
    return { canUse: false, reason: 'has zoom effects' }
  }

  // Check for motion blur
  if (settings?.cameraSettings?.motionBlurEnabled) {
    return { canUse: false, reason: 'motion blur enabled' }
  }

  // Check for cursor rendering
  if (settings?.cameraSettings?.showCursor) {
    return { canUse: false, reason: 'cursor rendering enabled' }
  }

  // Check for annotations, text overlays, keystrokes
  const hasAnnotations = effects.some((e: any) =>
    ['annotation', 'text', 'keystroke', 'subtitle'].includes(e?.type) && e?.enabled !== false
  )
  if (hasAnnotations) {
    return { canUse: false, reason: 'has annotation effects' }
  }

  // Check for background effects (other than solid black)
  const hasCustomBackground = effects.some((e: any) =>
    e?.type === 'background' && e?.enabled !== false && e?.data?.type !== 'none'
  )
  if (hasCustomBackground) {
    return { canUse: false, reason: 'has custom background' }
  }

  // Check for webcam overlays
  if (webcamClips && webcamClips.length > 0) {
    return { canUse: false, reason: 'has webcam clips' }
  }

  // Multiple audio tracks need Remotion mixing
  if (audioClips && audioClips.length > 0) {
    return { canUse: false, reason: 'has separate audio clips' }
  }

  // Check for speed changes (playback rate != 1)
  // This could be supported by FFmpeg but adds complexity - skip for now

  return { canUse: true }
}

/**
 * Zoom segment that can be rendered by FFmpeg
 */
export interface FFmpegZoomSegment {
  startTimeMs: number
  endTimeMs: number
  scale: number
  targetX: number  // 0-1 normalized
  targetY: number  // 0-1 normalized
  introMs: number
  outroMs: number
}

/**
 * Check if zoom effects can be handled by FFmpeg's zoompan filter
 * Static zooms (fixed target, center mode) can be done without Remotion
 * Cursor-following zooms require per-frame rendering
 */
export function canZoomBeHandledByFFmpeg(effects: any[]): {
  canHandle: boolean
  reason?: string
  zoomSegments: FFmpegZoomSegment[]
} {
  const zoomEffects = effects.filter((e: any) =>
    e?.type === 'zoom' && e?.enabled !== false && ((e?.data?.scale ?? 1) > 1.01)
  )

  if (zoomEffects.length === 0) {
    return { canHandle: true, zoomSegments: [] }
  }

  const zoomSegments: FFmpegZoomSegment[] = []

  for (const effect of zoomEffects) {
    const data = effect.data

    // Reject if cursor-following mode
    if (data?.followStrategy === 'mouse') {
      return { canHandle: false, reason: 'zoom uses mouse following', zoomSegments: [] }
    }
    if (data?.zoomMode === 'follow') {
      return { canHandle: false, reason: 'zoom uses follow mode', zoomSegments: [] }
    }
    if (data?.zoomIntoCursorMode === 'cursor' || data?.zoomIntoCursorMode === 'lead') {
      return { canHandle: false, reason: 'zoom follows cursor position', zoomSegments: [] }
    }

    // Static zoom - can be handled by FFmpeg
    // Normalize target position to 0-1 range
    const screenWidth = data?.screenWidth ?? 1920
    const screenHeight = data?.screenHeight ?? 1080
    const targetX = data?.targetX !== undefined ? data.targetX / screenWidth : 0.5
    const targetY = data?.targetY !== undefined ? data.targetY / screenHeight : 0.5

    zoomSegments.push({
      startTimeMs: effect.startTime,
      endTimeMs: effect.endTime,
      scale: data?.scale ?? 2,
      targetX: Math.max(0, Math.min(1, targetX)),
      targetY: Math.max(0, Math.min(1, targetY)),
      introMs: data?.introMs ?? 600,
      outroMs: data?.outroMs ?? 650,
    })
  }

  return { canHandle: true, zoomSegments }
}

/**
 * Enhanced fast path check that includes static zoom support
 * Returns zoom segments if they can be handled by FFmpeg
 */
export function canUseEnhancedFastPath(
  effects: any[],
  settings: any,
  webcamClips: any[] = [],
  audioClips: any[] = []
): { canUse: boolean; reason?: string; zoomSegments?: FFmpegZoomSegment[] } {
  // Check for motion blur
  if (settings?.cameraSettings?.motionBlurEnabled) {
    return { canUse: false, reason: 'motion blur enabled' }
  }

  // Check for cursor rendering
  if (settings?.cameraSettings?.showCursor) {
    return { canUse: false, reason: 'cursor rendering enabled' }
  }

  // Check for annotations, text overlays, keystrokes
  const hasAnnotations = effects.some((e: any) =>
    ['annotation', 'text', 'keystroke', 'subtitle'].includes(e?.type) && e?.enabled !== false
  )
  if (hasAnnotations) {
    return { canUse: false, reason: 'has annotation effects' }
  }

  // Check for background effects (other than solid black)
  const hasCustomBackground = effects.some((e: any) =>
    e?.type === 'background' && e?.enabled !== false && e?.data?.type !== 'none'
  )
  if (hasCustomBackground) {
    return { canUse: false, reason: 'has custom background' }
  }

  // Check for webcam overlays
  if (webcamClips && webcamClips.length > 0) {
    return { canUse: false, reason: 'has webcam clips' }
  }

  // Multiple audio tracks need Remotion mixing
  if (audioClips && audioClips.length > 0) {
    return { canUse: false, reason: 'has separate audio clips' }
  }

  // Check if zoom effects can be handled by FFmpeg
  const zoomCheck = canZoomBeHandledByFFmpeg(effects)
  if (!zoomCheck.canHandle) {
    return { canUse: false, reason: zoomCheck.reason }
  }

  return { canUse: true, zoomSegments: zoomCheck.zoomSegments }
}

/**
 * Sample a smooth mouse event at a specific time by interpolating between
 * surrounding raw events. This avoids snapping to the nearest event, which
 * can introduce jitter when camera follow uses spring physics during export.
 */
function sampleMouseEventAtTime<T extends { timestamp: number; x: number; y: number }>(
  events: T[],
  targetTimeMs: number
): T | null {
  if (!events || events.length === 0) return null

  if (targetTimeMs <= events[0].timestamp) {
    return { ...events[0], timestamp: targetTimeMs }
  }

  const lastIdx = events.length - 1
  if (targetTimeMs >= events[lastIdx].timestamp) {
    return { ...events[lastIdx], timestamp: targetTimeMs }
  }

  // Binary search for last event <= targetTimeMs
  let low = 0
  let high = lastIdx
  let beforeIdx = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    if (events[mid].timestamp <= targetTimeMs) {
      beforeIdx = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  const before = events[beforeIdx]
  const after = events[Math.min(beforeIdx + 1, lastIdx)]
  if (!before || !after) return before || after || null

  const dt = after.timestamp - before.timestamp
  if (dt <= 0) {
    return { ...before, timestamp: targetTimeMs }
  }

  const tRaw = (targetTimeMs - before.timestamp) / dt
  const t = Math.max(0, Math.min(1, tRaw))
  const smoothT = t * t * (3 - 2 * t)

  const x = before.x + (after.x - before.x) * smoothT
  const y = before.y + (after.y - before.y) * smoothT

  return {
    ...before,
    x,
    y,
    timestamp: targetTimeMs,
  }
}

/**
 * Downsample mouse events to one per frame for efficient rendering
 * Reduces ~87 events/sec to fps events/sec (typically 30)
 */
function downsampleMouseEvents(
  events: any[],
  fps: number,
  durationMs: number
): any[] {
  if (!events || events.length === 0) return []

  // If already sparse enough, don't downsample
  const eventsPerSecond = (events.length / durationMs) * 1000
  // Export jitter can appear if we over-downsample mouse input while zoom-following.
  // Keep raw events unless they're extremely dense/large.
  const maxAllowedEps = Math.max(fps * 8, 240) // allow 120-144Hz+ captures
  const maxAllowedTotal = 50000                // avoid memory blowups on very long recordings
  if (eventsPerSecond <= maxAllowedEps || events.length <= maxAllowedTotal) {
    return events
  }

  const frameCount = Math.ceil((durationMs / 1000) * fps)
  const sampledEvents: any[] = []
  const frameDurationMs = 1000 / fps

  for (let frame = 0; frame < frameCount; frame++) {
    const targetTimeMs = frame * frameDurationMs
    const event = sampleMouseEventAtTime(events, targetTimeMs)
    if (event) {
      sampledEvents.push(event)
    }
  }

  console.log(`[Export] Downsampled mouseEvents: ${events.length} → ${sampledEvents.length} (${fps}fps)`)
  return sampledEvents
}

/**
 * Downsample recording metadata for efficient export rendering
 * Reduces mouse events to one per frame while keeping other events intact
 */
export function downsampleRecordingMetadata(recording: any, fps: number): any {
  const metadata = recording.metadata
  if (!metadata) return recording

  const durationMs = recording.duration
  if (!durationMs || durationMs <= 0) return recording

  return {
    ...recording,
    metadata: {
      ...metadata,
      // Downsample mouse events (biggest contributor to size)
      mouseEvents: downsampleMouseEvents(metadata.mouseEvents || [], fps, durationMs),
      // Keep other events as-is (they're small)
      clickEvents: metadata.clickEvents,
      keyboardEvents: metadata.keyboardEvents,
      scrollEvents: metadata.scrollEvents,
      screenEvents: metadata.screenEvents,
      captureArea: metadata.captureArea,
      detectedTypingPeriods: metadata.detectedTypingPeriods,
    }
  }
}

/**
 * Setup export IPC handlers
 */
export function setupExportHandler(): void {
  console.log('[Export] Setting up export handler with supervised worker')

  ipcMain.handle('get-machine-profile', async (event, { width, height }: { width?: number; height?: number } = {}) => {
    assertTrustedIpcSender(event, 'get-machine-profile')
    const videoWidth = typeof width === 'number' && Number.isFinite(width) && width > 0 ? Math.floor(width) : 1920
    const videoHeight = typeof height === 'number' && Number.isFinite(height) && height > 0 ? Math.floor(height) : 1080
    const profile = await machineProfiler.profileSystem(videoWidth, videoHeight)
    return {
      cpuCores: profile.cpuCores,
      totalMemoryGB: profile.totalMemoryGB,
      gpuAvailable: profile.gpuAvailable
    }
  })

  ipcMain.handle('export-video', async (event, { segments, recordings, metadata, settings, projectFolder, webcamClips, audioClips }) => {
    assertTrustedIpcSender(event, 'export-video')
    console.log('[Export] Export handler invoked with settings:', settings)
    const timing = createExportTiming()

    const localAbortController = new AbortController()
    currentExportAbortController = localAbortController
    const abortSignal = localAbortController.signal

    try {
      if (abortSignal.aborted) {
        throw new Error('Export cancelled')
      }

      // Profile the machine
      const videoWidth = settings.resolution?.width || 1920
      const videoHeight = settings.resolution?.height || 1080

      const machineProfile = await machineProfiler.profileSystem(videoWidth, videoHeight)
      console.log('[Export] Machine profile:', {
        cpuCores: machineProfile.cpuCores,
        memoryGB: machineProfile.totalMemoryGB.toFixed(1),
        gpuAvailable: machineProfile.gpuAvailable
      })
      timing.mark('profile system')

      // Get export settings
      const targetQuality = settings.quality === 'ultra' ? 'quality' :
        settings.quality === 'low' ? 'fast' : 'balanced'
      const dynamicSettings = machineProfiler.getDynamicExportSettings(
        machineProfile,
        videoWidth,
        videoHeight,
        targetQuality
      )

      // Calculate memory constraints using consolidated utility
      const memoryConstraints = machineProfiler.getExportMemoryConstraints(machineProfile)
      const effectiveMemoryGB = memoryConstraints.effectiveMemoryGB
      // Apply video cache size
      dynamicSettings.offthreadVideoCacheSizeInBytes = memoryConstraints.videoCacheSizeBytes

      console.log(`[Export] Video cache: ${memoryConstraints.videoCacheSizeBytes / (1024 * 1024)}MB (effective memory: ${effectiveMemoryGB.toFixed(2)}GB)`)

      console.log('[Export] Export settings:', {
        jpegQuality: dynamicSettings.jpegQuality,
        videoBitrate: dynamicSettings.videoBitrate,
        x264Preset: dynamicSettings.x264Preset,
        useGPU: dynamicSettings.useGPU,
        concurrency: dynamicSettings.concurrency
      })

      // Get bundled location (cached or new)
      const bundleLocation = await getBundleLocation()
      timing.mark('bundle ready')

      // Select composition in main process to avoid OOM in worker
      const { selectComposition } = await import('@remotion/renderer')

      // Extract clips for composition selection
      const clipsForSelection = extractClipsFromSegments(segments)
      const clipsForComposition = clipsForSelection.length > 0
        ? clipsForSelection
        : [{ startTime: 0, duration: 30000 }]

      const minimalProps = {
        clips: clipsForComposition,
        recordings: [],
        effects: [],
        videoWidth: settings.resolution?.width || 1920,
        videoHeight: settings.resolution?.height || 1080,
        fps: settings.framerate || 30,
        enhanceAudio: settings.enhanceAudio,
        ...settings
      }

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'TimelineComposition',
        inputProps: minimalProps
      })
      timing.mark('composition selected')

      const totalDurationInFrames = composition.durationInFrames
      console.log(`[Export] Composition selected: ${clipsForComposition.length} clips, ${totalDurationInFrames} frames`)

      const compositionMetadata: CompositionMetadata = {
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
        durationInFrames: totalDurationInFrames,
        id: composition.id,
        defaultProps: composition.defaultProps
      }

      // Start video server
      await getVideoServer()

      // Resolve video URLs
      const recordingsDir = getRecordingsDirectory()
      const { videoUrls, videoFilePaths, absolutePaths } = await resolveVideoUrls(recordings, projectFolder, recordingsDir)

      // SMART RESOLUTION: Keep a copy of the original high-res URLs before proxy replacement
      const videoUrlsHighRes = { ...videoUrls }

      // Resolve metadata URLs for lazy loading during export
      const metadataUrls = await resolveMetadataUrls(recordings, projectFolder, recordingsDir)
      timing.mark('resolved media urls')

      // Prefer existing preview proxies as low-res sources for export when available.
      // This keeps non-zoom clips fast while preserving high-res sources for zoomed clips.
      const previewProxyUrls: Record<string, string> = {}
      for (const [recordingId, absPath] of Object.entries(absolutePaths)) {
        const previewProxyPath = await getExistingProxyPath(absPath)
        if (previewProxyPath) {
          const previewUrl = await makeVideoSrc(previewProxyPath, 'export')
          previewProxyUrls[recordingId] = previewUrl
          videoUrls[recordingId] = previewUrl
        }
      }

      // Extract clips and effects
      const allClips = extractClipsFromSegments(segments)
      const segmentEffects = extractEffectsFromSegments(segments)

      // ======================================================================
      // FAST PATH: Check if we can use direct FFmpeg export (no Remotion)
      // ======================================================================

      // Try original fast path first (no effects at all)
      const fastPathCheck = canUseFastPath(segmentEffects, settings, webcamClips, audioClips)

      // If original fast path fails, try enhanced fast path (static zooms supported)
      const enhancedFastPathCheck = !fastPathCheck.canUse
        ? canUseEnhancedFastPath(segmentEffects, settings, webcamClips, audioClips)
        : null

      const useFastPath = fastPathCheck.canUse || enhancedFastPathCheck?.canUse
      const zoomSegments = enhancedFastPathCheck?.zoomSegments || []

      if (useFastPath && allClips.length > 0) {
        const hasZoom = zoomSegments.length > 0
        console.log(`[Export] Using FAST PATH - direct FFmpeg export ${hasZoom ? '(with static zoom)' : '(no effects)'}`)
        timing.mark('fast path selected')

        // Get the source video path for the first clip
        const firstClip = allClips[0]
        const recordingId = firstClip.recordingId
        const absolutePath = absolutePaths[recordingId]

        if (absolutePath && fsSync.existsSync(absolutePath)) {
          const outputPath = path.join(
            app.getPath('temp'),
            `export-${randomUUID()}.${settings.format || 'mp4'}`
          )

          const directSettings: DirectExportSettings = {
            width: settings.resolution?.width || 1920,
            height: settings.resolution?.height || 1080,
            fps: settings.framerate || 30,
            bitrate: dynamicSettings.videoBitrate || '8M',
            format: settings.format || 'mp4',
          }

          // Handle trimming if clips don't cover full recording
          if (firstClip.sourceIn) {
            directSettings.trimStart = firstClip.sourceIn / 1000
          }
          if (firstClip.duration && firstClip.sourceIn !== undefined) {
            directSettings.trimEnd = (firstClip.sourceIn + firstClip.duration) / 1000
          }

          // Progress callback
          const onProgress = (percent: number) => {
            event.sender.send('export-progress', {
              progress: percent,
              stage: 'rendering',
              message: `Exporting... ${percent}%`,
            })
          }

          // Use zoom-enabled export if we have zoom segments, otherwise use basic export
          const result = hasZoom
            ? await exportDirectWithZoom(
                absolutePath,
                outputPath,
                directSettings,
                zoomSegments as ZoomSegment[],
                onProgress,
                abortSignal
              )
            : await exportDirect(
                absolutePath,
                outputPath,
                directSettings,
                onProgress,
                abortSignal
              )

          if (result.success && result.outputPath) {
            // Read the output file and return as buffer
            const outputBuffer = await fs.readFile(result.outputPath)
            await fs.unlink(result.outputPath).catch(() => {})

            timing.summary('fast path export complete')
            console.log(`[Export] Fast path export complete in ${(result.durationMs || 0) / 1000}s`)

            return outputBuffer
          } else {
            console.warn('[Export] Fast path failed, falling back to Remotion:', result.error)
            // Fall through to Remotion path
          }
        } else {
          console.warn('[Export] Fast path: source file not found, falling back to Remotion')
        }
      } else {
        const reason = fastPathCheck.reason || enhancedFastPathCheck?.reason || 'multiple clips or effects required'
        console.log('[Export] Using Remotion path:', reason)
      }

      // ======================================================================
      // STANDARD PATH: Remotion-based export with full effect support
      // ======================================================================

      // Calculate max zoom scale for proxy resolution decision
      const maxZoomScale = getMaxZoomScaleFromEffects(segmentEffects)

      // Log metadata sizes for debugging memory issues
      for (const [recordingId, recording] of recordings) {
        const meta = recording.metadata
        if (meta) {
          console.log(`[Export] Recording ${recordingId} metadata (before downsample):`, {
            mouseEvents: meta.mouseEvents?.length || 0,
            clickEvents: meta.clickEvents?.length || 0,
            keyboardEvents: meta.keyboardEvents?.length || 0,
            scrollEvents: meta.scrollEvents?.length || 0
          })
        }
      }

      // PERFORMANCE FIX: Downsample recordings for efficient rendering
      // Reduces ~87 mouse events/sec to 30/sec (one per frame)
      const fps = settings.framerate || 30
      const recordingsEntries = Array.from(new Map(recordings).entries())
      const downsampledRecordings = recordingsEntries
        .map(([id, recording]) => {
          const base = recording && typeof recording === 'object' ? recording : {}
          return downsampleRecordingMetadata({ ...(base as any), id }, fps)
        })

      const nativeSourceWidth = downsampledRecordings.reduce((max, r: any) => Math.max(max, r?.width || 0), 0) ||
        (settings.resolution?.width || 1920)
      const nativeSourceHeight = downsampledRecordings.reduce((max, r: any) => Math.max(max, r?.height || 0), 0) ||
        (settings.resolution?.height || 1080)

      // PERFORMANCE: If the export resolution is a significant downscale, create lightweight proxies
      // to avoid decoding the full-resolution source during rendering.
      // NOTE: We use OUTPUT resolution for the proxy, NOT zoom-adjusted resolution.
      // The performance penalty for decoding 4800×2700 for every frame far outweighs
      // the slight quality loss on zoomed sections. Most frames don't have active zoom.
      const outputWidth = settings.resolution?.width || 1920
      const outputHeight = settings.resolution?.height || 1080

      let { width: proxyTargetWidth, height: proxyTargetHeight, needsProxy } =
        calculateProxyDimensions({
          outputWidth,
          outputHeight,
          sourceWidth: nativeSourceWidth,
          sourceHeight: nativeSourceHeight,
          maxZoomScale,
        })

      // FORCE PROXY for Motion Blur:
      // Motion blur requires sampling multiple frames (16+) per output frame.
      // Standard Long-GOP videos cause massive seek latency/jitter.
      // Export proxies are All-Intra (-g 1), ensuring instant frame access.
      if (settings.cameraSettings?.motionBlurEnabled) {
        console.log('[Export] Forcing proxy for Motion Blur (All-Intra needed for sampling)')
        needsProxy = true
      }

      console.log('[Export] Proxy resolution decision', {
        outputWidth,
        outputHeight,
        maxZoomScale: maxZoomScale.toFixed(2),
        proxyTargetWidth,
        proxyTargetHeight,
        nativeSourceWidth,
        nativeSourceHeight,
        needsProxy
      })

      // PROPER FIX (not a timeout bump): If any source codec is unreliable in Chromium (e.g. HEVC),
      // force an export proxy (H.264) even if a resolution proxy is not otherwise needed.
      const codecProxyRecordings = new Set<string>()
      const ffprobePath = resolveFfprobePath()
      for (const [recordingId, absPath] of Object.entries(absolutePaths)) {
        const codecName = await getPrimaryVideoCodecName(ffprobePath, absPath)
        if (shouldForceExportProxyForContainer(absPath) || shouldForceExportProxyForCodec(codecName)) {
          codecProxyRecordings.add(recordingId)
        }
      }

      if (codecProxyRecordings.size > 0) {
        console.log('[Export] Forcing export proxies for unsupported codecs', {
          count: codecProxyRecordings.size,
          codecs: ['hevc', 'h265', 'prores', 'dnxhd'],
        })
      }
      const forceSingleThreadedDecode = codecProxyRecordings.size > 0

      // Some effects (notably background/corner effects) are stored on recordings
      // with source-relative timings. Segment filtering is timeline-relative and may drop them.
      // Merge in recording-scoped effects, BUT map them to timeline space for each clip.
      // This ensures getActiveClipDataAtFrame (which filters by timeline time) picks them up.
      const recordingEffectsMapped = mapRecordingEffectsToTimeline(allClips, downsampledRecordings)

      const allEffects = (() => {
        const merged = [...segmentEffects, ...recordingEffectsMapped]
        const seen = new Set<string>()
        return merged.filter((e: any) => {
          const id = e?.id
          if (!id || seen.has(id)) return false
          seen.add(id)
          return true
        })
      })()

      // Build input props with downsampled recordings.
      // Default to <Video> for export. OffthreadVideo goes through /proxy frame extraction which can spawn
      // extra Chromium work and is often slower/more memory hungry. Users can override via settings.preferOffthreadVideo.
      const hasLocalVideoFiles = Boolean(videoFilePaths && Object.keys(videoFilePaths).length > 0)
      const preferOffthreadVideoOverride =
        typeof (settings as any)?.preferOffthreadVideo === 'boolean'
          ? Boolean((settings as any).preferOffthreadVideo)
          : null

      // PERFORMANCE NOTE: OffthreadVideo via HTTP is actually SLOWER than <Video>
      // because the compositor has to download and extract each frame via HTTP.
      // The <Video> component uses Chromium's native video decode which is faster.
      const preferOffthreadVideo =
        preferOffthreadVideoOverride ??
        // Stability: If we forced a compatibility proxy (e.g. .mov/HEVC), use OffthreadVideo to
        // avoid Html5Video delayRender hangs in Chromium under concurrency.
        (codecProxyRecordings.size > 0)

      console.log('[Export] Source video dimensions', {
        nativeSourceWidth,
        nativeSourceHeight,
        outputWidth: settings.resolution?.width || 1920,
        outputHeight: settings.resolution?.height || 1080,
      })

      console.log('[Export] Video strategy', {
        preferOffthreadVideo,
        source: preferOffthreadVideoOverride == null ? 'default-video' : 'settings',
        hasLocalVideoFiles,
      })

      // Create output path
      const outputPath = path.join(
        app.getPath('temp'),
        `export-${randomUUID()}.${settings.format || 'mp4'}`
      )
      await fs.mkdir(path.dirname(outputPath), { recursive: true })

      // Calculate chunk plan
      const durationSeconds = totalDurationInFrames / (compositionMetadata.fps || 30)
      const targetWidth = settings.resolution?.width || compositionMetadata.width || 1920
      const targetHeight = settings.resolution?.height || compositionMetadata.height || 1080
      const megapixels = (targetWidth * targetHeight) / 1_000_000
      const sourceMegapixels = (nativeSourceWidth * nativeSourceHeight) / 1_000_000
      const totalMemGB = machineProfile.totalMemoryGB || 0
      const isHighFps = (settings.framerate || compositionMetadata.fps || 30) > 30
      // Use consolidated memory constraint utility for sequential decision
      const forceSequential = memoryConstraints.forceSequentialThreshold.shouldForceSequential(
        durationSeconds, megapixels, isHighFps
      )

      // Even if output is small (e.g. 1080p), decoding very large sources (5K/6K) can still spawn
      // multiple heavy Chromium decode services. On 16GB machines this often leads to swap thrash
      // when combined with parallel workers.
      const decodeHeavy = sourceMegapixels > 8.3 && isHighFps && durationSeconds >= 30
      const forceSequentialDecode = totalMemGB > 0 && totalMemGB <= 16 && decodeHeavy

      const optimalChunkSize = calculateStableChunkSize(totalDurationInFrames, durationSeconds)
      let chunkPlan = buildChunkPlan(
        totalDurationInFrames,
        optimalChunkSize,
        compositionMetadata.fps || settings.framerate || 30
      )

      // Calculate worker allocation using consolidated strategy
      const allocation = getExportStrategy(machineProfile, {
        chunkCount: chunkPlan.length,
        totalFrames: totalDurationInFrames,
        fps: compositionMetadata.fps || 30,
        effectiveMemoryGB
      })

      // STABILITY: Some codecs/containers (notably .mov / HEVC) can cause one of the parallel Chromium tabs
      // to never finish loading the first frame, eventually timing out Remotion's internal delayRender().
      // Force single-tab rendering in those cases.
      if (forceSingleThreadedDecode && !preferOffthreadVideo) {
        if (allocation.concurrency !== 1) {
          console.log('[Export] Forcing render concurrency to 1 for codec compatibility', {
            previous: allocation.concurrency,
          })
        }
        allocation.concurrency = 1
      }

      // STABILITY FIX: If using High-Res Smart Proxies (maxZoomScale > 1.25), 
      // reduce worker count to prevent memory thrashing on 16GB machines.
      // High-Res decode consumes significantly more RAM per worker.
      if (maxZoomScale > 1.25 && totalMemGB <= 16) {
        const safeLimit = effectiveMemoryGB < 8 ? 2 : 3
        if (allocation.workerCount > safeLimit) {
          console.log(`[Export] Throttling workers from ${allocation.workerCount} to ${safeLimit} due to High-Res Proxy usage`)
          allocation.workerCount = safeLimit
        }
      }
      const useParallelEffective = allocation.useParallel && !forceSequential && !forceSequentialDecode
      if ((forceSequential || forceSequentialDecode) && allocation.useParallel) {
        console.log('[Export] Forcing sequential export (high workload on 16GB)', {
          resolution: { width: targetWidth, height: targetHeight },
          megapixels: megapixels.toFixed(2),
          sourceMegapixels: sourceMegapixels.toFixed(2),
          framerate: settings.framerate || compositionMetadata.fps || 30,
          durationSeconds: durationSeconds.toFixed(1),
          requestedWorkers: allocation.workerCount
        })
      }

      // If we're not going to run multiple workers, avoid chunked rendering.
      // Chunking causes multiple Chromium lifecycles and extra seeking overhead, which can be slower
      // than single-pass rendering when memory is under control.
      let effectiveChunkSize = optimalChunkSize
      if (!useParallelEffective && chunkPlan.length > 1) {
        effectiveChunkSize = totalDurationInFrames
        chunkPlan = buildChunkPlan(
          totalDurationInFrames,
          effectiveChunkSize,
          compositionMetadata.fps || settings.framerate || 30
        )
      }

      console.log('[Export] Chunk plan metrics', {
        totalFrames: totalDurationInFrames,
        chunkCount: chunkPlan.length,
        chunkSize: effectiveChunkSize,
        workerCount: useParallelEffective ? allocation.workerCount : 1,
        concurrency: allocation.concurrency
      })

      // PERFORMANCE FIX: Pre-filter metadata by chunk time range.
      // This reduces IPC payload size (e.g., 3162 mouse events → only events in chunk's time range)
      // and prevents redundant filtering in workers.
      const metadataMap = metadata instanceof Map ? metadata : new Map(metadata)
      const preFilteredMetadata = new Map<number, Map<string, any>>()
      for (const chunk of chunkPlan) {
        const chunkMetadata = new Map<string, any>()
        const chunkStartMs = chunk.startTimeMs
        const chunkEndMs = chunk.endTimeMs

        for (const [recordingId, recordingMeta] of metadataMap) {
          if (!recordingMeta) continue
          const filteredMeta: any = { ...recordingMeta }

          // Filter event arrays by chunk time range (with small buffer for edge cases)
          const bufferMs = 50 // ~1-2 frames at 30fps
          if (Array.isArray(recordingMeta.mouseEvents) && recordingMeta.mouseEvents.length > 0) {
            filteredMeta.mouseEvents = recordingMeta.mouseEvents.filter(
              (e: any) => e.timestamp >= chunkStartMs - bufferMs && e.timestamp <= chunkEndMs + bufferMs
            )
          }
          if (Array.isArray(recordingMeta.keyboardEvents) && recordingMeta.keyboardEvents.length > 0) {
            filteredMeta.keyboardEvents = recordingMeta.keyboardEvents.filter(
              (e: any) => e.timestamp >= chunkStartMs - bufferMs && e.timestamp <= chunkEndMs + bufferMs
            )
          }
          if (Array.isArray(recordingMeta.clickEvents) && recordingMeta.clickEvents.length > 0) {
            filteredMeta.clickEvents = recordingMeta.clickEvents.filter(
              (e: any) => e.timestamp >= chunkStartMs - bufferMs && e.timestamp <= chunkEndMs + bufferMs
            )
          }
          if (Array.isArray(recordingMeta.scrollEvents) && recordingMeta.scrollEvents.length > 0) {
            filteredMeta.scrollEvents = recordingMeta.scrollEvents.filter(
              (e: any) => e.timestamp >= chunkStartMs - bufferMs && e.timestamp <= chunkEndMs + bufferMs
            )
          }

          chunkMetadata.set(recordingId, filteredMeta)
        }
        preFilteredMetadata.set(chunk.index, chunkMetadata)
      }

      // Resolve paths
      const ffmpegPath = resolveFfmpegPath()
      const compositorDir = getCompositorDirectory()
      const workerPath = getWorkerPath()

      if (needsProxy || codecProxyRecordings.size > 0) {
        try {
          console.log('[Export] Creating export proxies for faster decoding...', {
            source: { width: nativeSourceWidth, height: nativeSourceHeight },
            target: { width: proxyTargetWidth, height: proxyTargetHeight },
            fps
          })

          // PERFORMANCE: Parallel proxy generation with concurrency limit
          // Running 3 FFmpeg processes in parallel is optimal - more can overwhelm the system
          const PROXY_CONCURRENCY = 3

          // Filter to only recordings that need proxies
          const proxyTasks = Object.entries(absolutePaths).filter(([recordingId]) => {
            const codecForced = codecProxyRecordings.has(recordingId)
            return needsProxy || codecForced
          })

          // Track progress across all proxies
          const proxyProgress: Record<string, number> = {}
          const totalProxies = proxyTasks.length
          let completedProxies = 0

          const updateOverallProgress = () => {
            // Calculate weighted progress: completed proxies + partial progress of in-flight
            const inFlightProgress = Object.values(proxyProgress).reduce((sum, p) => sum + p, 0)
            const overallProgress = ((completedProxies * 100) + inFlightProgress) / totalProxies
            const safeProgress = Number.isFinite(overallProgress) ? overallProgress : 0

            event.sender.send('export-progress', {
              progress: 5 + (safeProgress * 0.05), // Map 0-100% proxy to 5-10% total
              stage: 'preparing',
              message: `Generating proxies: ${Math.round(safeProgress)}% (${completedProxies}/${totalProxies})`
            })
          }

          // Process in batches for controlled concurrency
          const results: Array<{ recordingId: string; proxyUrl: string; codecForced: boolean }> = []

          for (let i = 0; i < proxyTasks.length; i += PROXY_CONCURRENCY) {
            const batch = proxyTasks.slice(i, i + PROXY_CONCURRENCY)

            const batchResults = await Promise.all(
              batch.map(async ([recordingId, absPath]) => {
                const codecForced = codecProxyRecordings.has(recordingId)

                const dimensions = codecForced && !needsProxy ? await getVideoDimensions(absPath) : null
                const targetWidth = dimensions?.width ?? proxyTargetWidth
                const targetHeight = dimensions?.height ?? proxyTargetHeight
                const bitrateMbps = estimateH264BitrateMbps({ width: targetWidth, height: targetHeight, fps })
                const proxyOverrides = codecForced && !needsProxy ? {
                  videoBitrate: `${bitrateMbps}M`,
                  crf: 18,
                  preset: 'fast' as const,
                } : undefined

                proxyProgress[recordingId] = 0

                const proxyPath = await ensureExportProxy(
                  absPath,
                  targetWidth,
                  targetHeight,
                  settings.cameraSettings?.motionBlurEnabled ? undefined : fps,
                  (progress) => {
                    proxyProgress[recordingId] = Number.isFinite(progress) ? progress : 0
                    updateOverallProgress()
                  },
                  proxyOverrides
                )

                delete proxyProgress[recordingId]
                completedProxies++
                updateOverallProgress()

                const proxyUrl = await makeVideoSrc(proxyPath, 'export')
                return { recordingId, proxyUrl, codecForced }
              })
            )

            results.push(...batchResults)
          }

          // Apply results to URL maps
          for (const { recordingId, proxyUrl, codecForced } of results) {
            // If we're forcing a codec-safe proxy, prefer it over preview proxies
            if (!previewProxyUrls[recordingId] || (codecForced && !needsProxy)) {
              videoUrls[recordingId] = proxyUrl
            }
            videoUrlsHighRes[recordingId] = proxyUrl
            videoFilePaths[recordingId] = proxyUrl
          }

          console.log(`[Export] Proxies ready (${totalProxies} processed in parallel batches)`)
          timing.mark('proxies ready')
        } catch (error) {
          console.warn('[Export] Proxy generation failed, falling back to original media', error)
        }
      }

      if (!fsSync.existsSync(workerPath)) {
        throw new Error(`Export worker not found at ${workerPath}`)
      }

      // Build inputProps AFTER proxy generation to ensure all URLs are up to date.
      // This fixes a race condition where workers could receive stale HighRes URLs
      // that pointed to the original source instead of the "Smart Proxy", preventing
      // the blink fix from working.
      //
      // ARCHITECTURE: Use structured props format (resources, renderSettings, playback, cropSettings)
      // This matches the TimelineComposition interface and eliminates the need for defensive fallbacks.
      const inputProps = {
        // Core timeline data
        clips: allClips,
        webcamClips: Array.isArray(webcamClips) ? webcamClips : [],
        audioClips: Array.isArray(audioClips) ? audioClips : [],
        recordings: downsampledRecordings,
        effects: allEffects,

        // Video dimensions
        videoWidth: settings.resolution?.width || 1920,
        videoHeight: settings.resolution?.height || 1080,
        sourceVideoWidth: nativeSourceWidth,
        sourceVideoHeight: nativeSourceHeight,
        fps,

        // Camera settings (if any)
        cameraSettings: settings.cameraSettings,

        // STRUCTURED: Video resources group
        resources: {
          videoUrls,           // Low-res proxy URLs for non-zoomed frames
          videoUrlsHighRes,    // High-res original URLs (or Smart Proxy) for zoomed frames
          videoFilePaths,      // Direct file paths for OffthreadVideo
          metadataUrls,        // For lazy metadata loading during export
        },

        // STRUCTURED: Playback settings group (export doesn't play, but needs defaults)
        playback: {
          isPlaying: false,
          isScrubbing: false,
          isHighQualityPlaybackEnabled: true, // Always high quality for export
          previewMuted: true,
          previewVolume: 1,
        },

        // STRUCTURED: Render settings group
        renderSettings: {
          isGlowMode: false,
          preferOffthreadVideo,
          enhanceAudio: settings.enhanceAudio ?? false,
          isEditingCrop: false,
        },

        // STRUCTURED: Crop settings group (export never edits crops)
        cropSettings: {
          cropData: null,
        },

        // STRUCTURED: Zoom settings group (export never edits zoom)
        zoomSettings: {
          isEditing: false,
          zoomData: null,
        },
      }

      // Build common job config
      const commonJob: ExportJobConfig = {
        bundleLocation,
        compositionMetadata,
        inputProps,
        outputPath,
        settings,
        offthreadVideoCacheSizeInBytes: dynamicSettings.offthreadVideoCacheSizeInBytes,
        jpegQuality: dynamicSettings.jpegQuality,
        videoBitrate: dynamicSettings.videoBitrate,
        x264Preset: dynamicSettings.x264Preset,
        useGPU: dynamicSettings.useGPU,
        // Concurrency is a big multiplier for Chromium child processes and memory use.
        // Keep it conservative, especially when source decoding is heavy.
        concurrency: (() => {
          const memoryCapped = Math.min(
            allocation.concurrency,
            totalMemGB > 0 && totalMemGB <= 16 ? 3 : allocation.concurrency
          )
          if (!useParallelEffective) {
            return memoryCapped
          }
          const decodeSensitive = maxZoomScale > 1.5 || decodeHeavy
          return decodeSensitive ? Math.min(2, memoryCapped) : memoryCapped
        })(),
        ffmpegPath,
        compositorDir,
        // Respect the chunk plan decision above (single-pass for sequential exports).
        chunkSizeFrames: effectiveChunkSize,
        preFilteredMetadata,
        totalFrames: totalDurationInFrames,
        totalChunks: chunkPlan.length
      }

      const toCount = (obj: unknown) =>
        obj && typeof obj === 'object' ? Object.keys(obj as Record<string, unknown>).length : 0
      console.log(
        '[ExportDebug] plan',
        JSON.stringify({
          fps,
          totalFrames: totalDurationInFrames,
          durationSeconds,
          resolution: { width: targetWidth, height: targetHeight },
          megapixels,
          source: { width: nativeSourceWidth, height: nativeSourceHeight, megapixels: sourceMegapixels },
          maxZoomScale,
          preferOffthreadVideo,
          enhanceAudio: Boolean(settings.enhanceAudio ?? false),
          useGPU: Boolean(dynamicSettings.useGPU),
          x264Preset: dynamicSettings.x264Preset,
          jpegQuality: dynamicSettings.jpegQuality,
          videoBitrate: dynamicSettings.videoBitrate,
          chunking: {
            useParallelEffective,
            workerCount: useParallelEffective ? allocation.workerCount : 1,
            chunkSizeFrames: effectiveChunkSize,
            chunkCount: chunkPlan.length,
            concurrency: (commonJob as any).concurrency,
            forceSequential,
            forceSequentialDecode,
            decodeHeavy,
          },
          resources: {
            videoUrls: toCount(videoUrls),
            videoUrlsHighRes: toCount(videoUrlsHighRes),
            videoFilePaths: toCount(videoFilePaths),
            metadataUrls: toCount(metadataUrls),
          },
        })
      )

      // Create progress tracker
      const progressTracker = new ProgressTracker(event.sender, totalDurationInFrames)

      // Execute export
      const primaryWorkerMemoryMB = Math.min(4096, Math.floor((effectiveMemoryGB || 2) * 1024 / 4))

      const result = useParallelEffective
        ? await runParallelExport(
          commonJob,
          chunkPlan,
          allocation.workerCount,
          workerPath,
          machineProfile,
          allocation.timeoutMs,
          progressTracker,
          ffmpegPath,
          outputPath,
          preFilteredMetadata,
          abortSignal
        )
        : await runSequentialExport(
          commonJob,
          workerPath,
          primaryWorkerMemoryMB,
          allocation.timeoutMs,
          progressTracker,
          abortSignal
        )

      timing.mark('render complete')

      if (abortSignal.aborted) {
        throw new Error('Export cancelled')
      }

      if (result.success) {
        // Handle file response
        const stats = await fs.stat(outputPath)
        const fileSize = stats.size

        // PERFORMANCE FIX: Use different transfer methods based on file size
        // - Small (<10MB): Base64 inline (simple, fast enough)
        // - Medium (10-50MB): Direct buffer transfer (Electron IPC handles Buffer efficiently)
        // - Large (>50MB): Streaming with direct buffer chunks
        if (fileSize < 10 * 1024 * 1024) {
          // Small files: base64 is fine, minimal overhead
          const buffer = await fs.readFile(outputPath)
          const base64 = buffer.toString('base64')
          await fs.unlink(outputPath).catch(() => { })
          return { success: true, data: base64, isStream: false }
        } else if (fileSize < 50 * 1024 * 1024) {
          // Medium files: Use direct Buffer transfer (Electron serializes efficiently)
          const buffer = await fs.readFile(outputPath)
          await fs.unlink(outputPath).catch(() => { })
          return { success: true, buffer: buffer, isBuffer: true, isStream: false }
        }

        // Large files: stream with direct buffer chunks
        trackStreamFile(outputPath)
        return {
          success: true,
          filePath: outputPath,
          fileSize,
          isStream: true,
          useBufferChunks: true // Signal renderer to use buffer-based streaming
        }
      } else {
        await fs.unlink(outputPath).catch(() => { })
        return {
          success: false,
          error: result.error || 'Export failed'
        }
      }

    } catch (error) {
      console.error('[Export] Export failed:', error)

      // Clean up resources on failure
      await cleanupExportResources()

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Export failed'
      }
    } finally {
      if (currentExportAbortController === localAbortController) {
        currentExportAbortController = null
      }
      timing.summary()
    }
  })

  // Handle export cancellation
  ipcMain.handle('export-cancel', async (event) => {
    assertTrustedIpcSender(event, 'export-cancel')
    try {
      currentExportAbortController?.abort()
    } catch {
      // ignore abort errors
    }
    return cancelExport()
  })

  // Handle stream requests for large files (legacy base64 for compatibility)
  ipcMain.handle('export-stream-chunk', async (event, { filePath, offset, length }) => {
    try {
      assertTrustedIpcSender(event, 'export-stream-chunk')
      const normalizedPath = path.resolve(String(filePath))
      const tempDir = path.resolve(app.getPath('temp'))

      if (!isTrackedStreamFile(normalizedPath) || !isPathWithinAny(normalizedPath, [tempDir])) {
        return { success: false, error: 'Access denied' }
      }

      if (!path.basename(normalizedPath).startsWith('export-')) {
        return { success: false, error: 'Access denied' }
      }

      const safeOffset = Number(offset)
      const safeLength = Number(length)
      if (!Number.isFinite(safeOffset) || !Number.isFinite(safeLength) || safeOffset < 0 || safeLength <= 0) {
        return { success: false, error: 'Invalid stream range' }
      }
      if (safeLength > 16 * 1024 * 1024) {
        return { success: false, error: 'Chunk too large' }
      }

      const buffer = Buffer.alloc(safeLength)
      const fd = await fs.open(normalizedPath, 'r')
      await fd.read(buffer, 0, safeLength, safeOffset)
      await fd.close()
      return { success: true, data: buffer.toString('base64') }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Stream failed'
      }
    }
  })

  // PERFORMANCE: Direct buffer streaming - no base64 encoding overhead
  // Electron IPC serializes Buffer/Uint8Array efficiently
  ipcMain.handle('export-stream-buffer-chunk', async (event, { filePath, offset, length }) => {
    try {
      assertTrustedIpcSender(event, 'export-stream-buffer-chunk')
      const normalizedPath = path.resolve(String(filePath))
      const tempDir = path.resolve(app.getPath('temp'))

      if (!isTrackedStreamFile(normalizedPath) || !isPathWithinAny(normalizedPath, [tempDir])) {
        return { success: false, error: 'Access denied' }
      }

      if (!path.basename(normalizedPath).startsWith('export-')) {
        return { success: false, error: 'Access denied' }
      }

      const safeOffset = Number(offset)
      const safeLength = Number(length)
      if (!Number.isFinite(safeOffset) || !Number.isFinite(safeLength) || safeOffset < 0 || safeLength <= 0) {
        return { success: false, error: 'Invalid stream range' }
      }
      if (safeLength > 16 * 1024 * 1024) {
        return { success: false, error: 'Chunk too large' }
      }

      const buffer = Buffer.alloc(safeLength)
      const fd = await fs.open(normalizedPath, 'r')
      await fd.read(buffer, 0, safeLength, safeOffset)
      await fd.close()
      // Return raw buffer - Electron IPC handles this efficiently
      return { success: true, buffer: buffer }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Stream failed'
      }
    }
  })

  // Clean up streamed file
  ipcMain.handle('export-cleanup', async (event, { filePath }) => {
    try {
      assertTrustedIpcSender(event, 'export-cleanup')
      const normalizedPath = path.resolve(String(filePath))
      const tempDir = path.resolve(app.getPath('temp'))

      if (!isTrackedStreamFile(normalizedPath) || !isPathWithinAny(normalizedPath, [tempDir])) {
        return { success: false }
      }

      if (!path.basename(normalizedPath).startsWith('export-')) {
        return { success: false }
      }

      await fs.unlink(normalizedPath)
      consumeTrackedStreamFile(normalizedPath)
      return { success: true }
    } catch (_error) {
      return { success: false }
    }
  })
}
