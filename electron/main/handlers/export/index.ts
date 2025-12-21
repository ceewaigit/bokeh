/**
 * Export handler - Main orchestrator
 * Registers IPC handlers and coordinates export operations
 */

import { ipcMain, app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'

import { machineProfiler } from '../../utils/machine-profiler'
import { makeVideoSrc, makeMetadataSrc } from '../../utils/video-url-factory'
import { getVideoServer } from '../../video-http-server'
import { getRecordingsDirectory } from '../../config'
import { resolveFfmpegPath, getCompositorDirectory } from '../../utils/ffmpeg-resolver'
import { normalizeCrossPlatform } from '../../utils/path-normalizer'
import { ensureExportProxy } from '../../services/proxy-service'

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

// Re-export cleanup function for app lifecycle
export { cleanupBundleCache }

let currentExportAbortController: AbortController | null = null

export function isExportInProgress(): boolean {
  return currentExportAbortController !== null
}

/**
 * @deprecated Use machineProfiler.getExportMemoryConstraints() instead
 * Kept for reference during transition - can be removed in next cleanup
 */
function getMaxZoomScaleFromEffects(effects: any[]): number {
  let maxScale = 1
  for (const effect of effects) {
    if (effect.type === 'zoom' && effect.enabled !== false) {
      const scale = effect.data?.scale || 1
      if (scale > maxScale) maxScale = scale
    }
  }
  return maxScale
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
      absolutePaths[recordingId] = normalizedPath

      // Provide both:
      // - `videoUrls`: HTTP URLs for <Video> (Chromium security blocks file:// in many cases)
      // - `videoFilePaths`: HTTP URL for <OffthreadVideo> (Remotion compositor only supports http(s) sources)
      const httpUrl = await makeVideoSrc(normalizedPath, 'export')
      videoUrls[recordingId] = httpUrl

      // Use direct file access for OffthreadVideo
      videoFilePaths[recordingId] = normalizedPath
    }
  }

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
 * Binary search to find the closest event to a target timestamp
 */
function findClosestEvent<T extends { timestamp: number }>(events: T[], targetTimeMs: number): T | null {
  if (!events || events.length === 0) return null

  let low = 0
  let high = events.length - 1

  // Edge cases
  if (targetTimeMs <= events[0].timestamp) return events[0]
  if (targetTimeMs >= events[high].timestamp) return events[high]

  // Binary search for closest
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (events[mid].timestamp === targetTimeMs) {
      return events[mid]
    } else if (events[mid].timestamp < targetTimeMs) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  // Return the closer of the two surrounding events
  if (high < 0) return events[0]
  if (low >= events.length) return events[events.length - 1]

  const lowDiff = Math.abs(events[low].timestamp - targetTimeMs)
  const highDiff = Math.abs(events[high].timestamp - targetTimeMs)
  return lowDiff < highDiff ? events[low] : events[high]
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

  const originalMouseCount = metadata.mouseEvents?.length || 0

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

  ipcMain.handle('get-machine-profile', async (_event, { width, height }: { width?: number; height?: number } = {}) => {
    const videoWidth = typeof width === 'number' && Number.isFinite(width) && width > 0 ? Math.floor(width) : 1920
    const videoHeight = typeof height === 'number' && Number.isFinite(height) && height > 0 ? Math.floor(height) : 1080
    const profile = await machineProfiler.profileSystem(videoWidth, videoHeight)
    return {
      cpuCores: profile.cpuCores,
      totalMemoryGB: profile.totalMemoryGB,
      gpuAvailable: profile.gpuAvailable
    }
  })

  ipcMain.handle('export-video', async (event, { segments, recordings, metadata, settings, projectFolder }) => {
    console.log('[Export] Export handler invoked with settings:', settings)

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
      const totalMemoryGB = machineProfile.totalMemoryGB || 16

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

      // Extract clips and effects
      const allClips = extractClipsFromSegments(segments)
      const segmentEffects = extractEffectsFromSegments(segments)

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

      // PERFORMANCE: Use output resolution directly (not zoom-adjusted)
      // This trades slight quality loss on zoomed sections for MUCH faster exports
      // BLINK FIX: Restore Smart Proxy (Zoom-Aware) for Sharp Zooms.
      // We will throttle concurrency downstream to handle the increased memory load.
      // PERFORMANCE FIX: Cap at 4K (3840px) to prevent hardware encoding (VideoToolbox) failure.
      // 5K/6K software encoding is too slow and causes decoder lag/flicker.
      const MAX_PROXY_WIDTH = 3840 // 4K UHD
      const MAX_PROXY_HEIGHT = 2160

      const maxW = Math.min(outputWidth * maxZoomScale, nativeSourceWidth, MAX_PROXY_WIDTH)
      const maxH = Math.min(outputHeight * maxZoomScale, nativeSourceHeight, MAX_PROXY_HEIGHT)

      // FFmpeg requires even dimensions for yuv420p
      const zoomAdjustedWidth = Math.ceil(maxW / 2) * 2
      const zoomAdjustedHeight = Math.ceil(maxH / 2) * 2

      const proxyTargetWidth = zoomAdjustedWidth
      const proxyTargetHeight = zoomAdjustedHeight

      // Only create proxy if it would be meaningfully smaller than source
      const needsProxy =
        proxyTargetWidth > 0 &&
        proxyTargetHeight > 0 &&
        (proxyTargetWidth < nativeSourceWidth * 0.85 || proxyTargetHeight < nativeSourceHeight * 0.85)

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

      // Some effects (notably background/corner effects) are stored on recordings
      // with source-relative timings. Segment filtering is timeline-relative and may drop them.
      // Merge in recording-scoped effects so Remotion can resolve them at sourceTimeMs.
      const recordingEffects = downsampledRecordings.flatMap((r: any) => r.effects || [])
      const allEffects = (() => {
        const merged = [...segmentEffects, ...recordingEffects]
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
        false

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
        `export-${Date.now()}.${settings.format || 'mp4'}`
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

      // Build pre-filtered metadata
      const metadataMap = metadata instanceof Map ? metadata : new Map(metadata)
      const preFilteredMetadata = new Map<number, Map<string, any>>()
      for (const chunk of chunkPlan) {
        preFilteredMetadata.set(chunk.index, metadataMap)
      }

      // Resolve paths
      const ffmpegPath = resolveFfmpegPath()
      const compositorDir = getCompositorDirectory()
      const workerPath = getWorkerPath()

      if (needsProxy) {
        try {
          console.log('[Export] Creating export proxies for faster decoding...', {
            source: { width: nativeSourceWidth, height: nativeSourceHeight },
            target: { width: proxyTargetWidth, height: proxyTargetHeight },
            fps
          })
          for (const [recordingId, absPath] of Object.entries(absolutePaths)) {
            const proxyPath = await ensureExportProxy(
              absPath,
              proxyTargetWidth,
              proxyTargetHeight,
              fps,
              (progress) => {
                const safeProgress = Number.isFinite(progress) ? progress : 0
                // Manually update progress during proxy phase (0-10% of total export bar usually reserved for prep)
                // But since we don't have a tracker yet, just send text update or minor progress
                event.sender.send('export-progress', {
                  progress: 5 + (safeProgress * 0.05), // Map 0-100% proxy to 5-10% total
                  stage: 'preparing',
                  message: `Generating high-quality proxies: ${Math.round(safeProgress)}%`
                })
              }
            )
            const proxyUrl = await makeVideoSrc(proxyPath, 'export')
            videoUrls[recordingId] = proxyUrl

            // BLINK FIX: We override the HighRes source with the proxy to force consistency.
            // This proxy is now Smart/Zoom-Aware (covers maxZoom), ensuring sharp zooms.
            // Forcing consistent usage prevents useVideoUrl from switching sources (blinks).
            // We handled the memory impact by throttling worker concurrency above.
            videoUrlsHighRes[recordingId] = proxyUrl

            // Use direct file access for OffthreadVideo
            videoFilePaths[recordingId] = proxyPath
          }
          console.log('[Export] Proxies ready')
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
      const inputProps = {
        clips: allClips,
        recordings: downsampledRecordings,
        effects: allEffects,
        videoWidth: settings.resolution?.width || 1920,
        videoHeight: settings.resolution?.height || 1080,
        sourceVideoWidth: nativeSourceWidth,
        sourceVideoHeight: nativeSourceHeight,
        // Prefer OffthreadVideo for formats that are slow/unreliable in headless Chromium.
        // Can be overridden via settings.preferOffthreadVideo.
        preferOffthreadVideo,
        fps,
        metadata: Object.fromEntries(metadata),
        videoUrls,  // Low-res proxy URLs for non-zoomed frames
        videoUrlsHighRes,  // High-res original URLs (or Smart Proxy) for zoomed frames
        videoFilePaths,
        metadataUrls,  // For lazy metadata loading during export
        ...settings,
        projectFolder
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
        concurrency: useParallelEffective
          ? 1
          : Math.min(allocation.concurrency, totalMemGB > 0 && totalMemGB <= 16 ? 2 : allocation.concurrency),
        ffmpegPath,
        compositorDir,
        // Respect the chunk plan decision above (single-pass for sequential exports).
        chunkSizeFrames: effectiveChunkSize,
        preFilteredMetadata,
        totalFrames: totalDurationInFrames,
        totalChunks: chunkPlan.length
      }

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

      if (abortSignal.aborted) {
        throw new Error('Export cancelled')
      }

      if (result.success) {
        // Handle file response
        const stats = await fs.stat(outputPath)
        const fileSize = stats.size

        if (fileSize < 50 * 1024 * 1024) {
          const buffer = await fs.readFile(outputPath)
          const base64 = buffer.toString('base64')
          await fs.unlink(outputPath).catch(() => { })
          return { success: true, data: base64, isStream: false }
        }

        return {
          success: true,
          filePath: outputPath,
          fileSize,
          isStream: true
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
    }
  })

  // Handle export cancellation
  ipcMain.handle('export-cancel', async () => {
    try {
      currentExportAbortController?.abort()
    } catch {
      // ignore abort errors
    }
    return cancelExport()
  })

  // Handle stream requests for large files
  ipcMain.handle('export-stream-chunk', async (_event, { filePath, offset, length }) => {
    try {
      const buffer = Buffer.alloc(length)
      const fd = await fs.open(filePath, 'r')
      await fd.read(buffer, 0, length, offset)
      await fd.close()
      return { success: true, data: buffer.toString('base64') }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Stream failed'
      }
    }
  })

  // Clean up streamed file
  ipcMain.handle('export-cleanup', async (_event, { filePath }) => {
    try {
      await fs.unlink(filePath)
      return { success: true }
    } catch (error) {
      return { success: false }
    }
  })
}
