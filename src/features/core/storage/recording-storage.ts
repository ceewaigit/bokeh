/**
 * Centralized localStorage management for recordings
 * Single source of truth for recording blobs and metadata
 */

import { logger } from '@/shared/utils/logger'
import { current, isDraft } from 'immer'
import { ThumbnailGenerator } from '@/shared/utils/thumbnail-generator'
import type { Project, Recording, Clip, CaptureArea, RecordingMetadata } from '@/types/project'
import { TrackType, ExportFormat, QualityLevel, RecordingSourceType, EffectType } from '@/types/project'
import { EffectInitialization } from '@/features/effects/core/initialization'
import { getEffectsOfType } from '@/features/effects/core/filters'
import { regenerateProjectEffects } from '@/features/effects/logic/effect-applier'
import { EffectStore } from '@/features/effects/core/store'
import { isLikelyKeyboardKey, isStandaloneModifierKey } from '@/features/core/keyboard/keyboard-utils'
import { getVideoMetadataFromPath } from '@/shared/utils/video-metadata'
import { normalizeProjectSettings } from '@/features/core/settings/normalize-project-settings'
import { migrationRunner } from '@/shared/migrations'

export const PROJECT_EXTENSION = '.bokeh'
// Regex for removing extensions from filenames
export const PROJECT_EXTENSION_REGEX = /\.bokeh$/
export const PROJECT_PACKAGE_FILE = 'project.json'

export const SUPPORTED_PROJECT_EXTENSIONS = ['bokeh']

export const buildProjectFilePath = (projectRoot: string): string =>
  `${projectRoot}/${PROJECT_PACKAGE_FILE}`

export const resolveProjectRoot = async (
  projectPath: string,
  fileExists?: (path: string) => Promise<boolean>
): Promise<string> => {
  if (!projectPath) return ''
  if (projectPath.endsWith(`/${PROJECT_PACKAGE_FILE}`)) {
    return projectPath.slice(0, -(`/${PROJECT_PACKAGE_FILE}`).length)
  }
  if (projectPath.endsWith(PROJECT_EXTENSION) && fileExists) {
    const packageFilePath = buildProjectFilePath(projectPath)
    if (await fileExists(packageFilePath)) {
      return projectPath
    }
  }
  const idx = projectPath.lastIndexOf('/')
  return idx >= 0 ? projectPath.substring(0, idx) : projectPath
}

export class RecordingStorage {
  private static readonly BLOB_PREFIX = 'recording-blob-'
  private static readonly PROJECT_PREFIX = 'project-'
  private static readonly PROJECT_PATH_PREFIX = 'project-path-'
  private static readonly PROJECT_THUMBNAIL_NAME = 'thumbnail.jpg'

  // In-memory metadata cache with LRU eviction
  // PERF: Limit to 20 recordings to cover typical timeline usage
  // Each metadata object can be 1-10MB (mouse/keyboard events), but 20 is safe for modern RAM
  private static readonly MAX_METADATA_CACHE_SIZE = 20
  private static metadataCacheOrder: string[] = []
  private static metadataCache = new Map<string, any>()

  // Helper: join paths safely in renderer without path import
  private static joinPath(base: string, ...parts: string[]): string {
    const segments = [base, ...parts].join('/').replace(/\\/g, '/').split('/')
    const filtered: string[] = []
    for (const seg of segments) {
      if (!seg || seg === '.') continue
      if (seg === '..') { filtered.pop(); continue }
      filtered.push(seg)
    }
    return (base.startsWith('/') ? '/' : '') + filtered.join('/')
  }

  // Compute a stable project folder name
  private static sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  }

  // Public: store metadata in memory with LRU eviction
  static setMetadata(recordingId: string, metadata: any): void {
    try {
      const safeMetadata = (() => {
        if (!metadata || typeof metadata !== 'object') return metadata
        const resolved = isDraft(metadata) ? current(metadata) : metadata
        if (!resolved || typeof resolved !== 'object') return resolved
        if (Object.isExtensible(resolved)) return resolved
        if (Array.isArray(resolved)) return [...resolved]
        return { ...(resolved as Record<string, unknown>) }
      })()

      // LRU management
      if (this.metadataCache.has(recordingId)) {
        // Move to end (most recently used)
        this.metadataCacheOrder = this.metadataCacheOrder.filter(id => id !== recordingId)
      } else if (this.metadataCacheOrder.length >= this.MAX_METADATA_CACHE_SIZE) {
        // Evict oldest (least recently used)
        const oldest = this.metadataCacheOrder.shift()
        if (oldest) {
          this.metadataCache.delete(oldest)
          logger.debug(`Evicted metadata for recording ${oldest} (LRU)`)
        }
      }
      this.metadataCacheOrder.push(recordingId)
      this.metadataCache.set(recordingId, safeMetadata)
      logger.debug(`Cached metadata for recording ${recordingId} (${this.metadataCacheOrder.length}/${this.MAX_METADATA_CACHE_SIZE})`)
    } catch (error) {
      logger.error(`Failed to cache metadata for recording ${recordingId}:`, error)
    }
  }

  // Public: get metadata from memory cache (updates LRU order)
  static getMetadata(recordingId: string): any | null {
    try {
      const metadata = this.metadataCache.get(recordingId)
      if (metadata) {
        // Move to end (most recently used)
        this.metadataCacheOrder = this.metadataCacheOrder.filter(id => id !== recordingId)
        this.metadataCacheOrder.push(recordingId)
      }
      return metadata || null
    } catch (error) {
      logger.error(`Failed to get cached metadata for recording ${recordingId}:`, error)
      return null
    }
  }

  // Public: clear metadata cache (useful for memory management)
  static clearMetadataCache(): void {
    const size = this.metadataCache.size
    this.metadataCache.clear()
    this.metadataCacheOrder = []
    logger.info(`Cleared ${size} items from metadata cache`)
  }

  // Public: clear metadata for a specific recording
  static clearMetadataForRecording(recordingId: string): void {
    if (this.metadataCache.has(recordingId)) {
      this.metadataCache.delete(recordingId)
      this.metadataCacheOrder = this.metadataCacheOrder.filter(id => id !== recordingId)
      logger.debug(`Cleared metadata for recording ${recordingId}`)
    }
  }

  // Public: Generic helper to cache analysis periods (typing, idle, etc.)
  static cacheAnalysisPeriods<T extends object>(
    project: Project | null,
    recordingId: string,
    periodKey: 'detectedTypingPeriods' | 'detectedIdlePeriods',
    periods: T[],
    transformer: (p: T) => object
  ): void {
    if (!project) return

    const recording = project.recordings.find((r: Recording) => r.id === recordingId)
    if (!recording) {
      logger.warn(`[RecordingStorage] ${periodKey}: Recording not found:`, recordingId)
      return
    }

    // Ensure metadata object exists
    if (!recording.metadata) {
      recording.metadata = {
        mouseEvents: [],
        keyboardEvents: [],
        clickEvents: [],
        screenEvents: []
      }
    }

    // Update the specific period key
    recording.metadata[periodKey] = periods.map(transformer) as any

    // Update cache
    this.setMetadata(recordingId, recording.metadata)
  }

  // Filesystem: save metadata as chunked JSON files under recording folder
  static async saveMetadataChunks(recordingFolder: string, metadata: any, chunkTargetSize = 250_000): Promise<{ manifest: Required<NonNullable<Pick<import('@/types/project').Recording, 'metadataChunks'>>['metadataChunks']> } | null> {
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

    // Ensure folder exists by saving a tiny placeholder file first (mkdir helper not exposed)
    // We'll rely on saveRecording with nested paths; Node will create intermediate dirs via main handler logic if implemented.
    // If not, we must save at least one file to force path creation.

    for (const { key, filePrefix } of kinds) {
      const events: any[] = (metadata?.[key as any] as any[]) || []
      if (!events || events.length === 0) continue

      // Chunk events into roughly chunkTargetSize JSON byte size per file
      let chunkIndex = 0
      let start = 0
      while (start < events.length) {
        // Exponentially back off chunk size to fit target byte size
        let end = Math.min(events.length, start + 5000) // initial guess
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
        const filePath = this.joinPath(recordingFolder, fileName)
        await window.electronAPI.saveRecording(filePath, new TextEncoder().encode(dataStr).buffer)
        manifest[filePrefix].push(fileName)

        start = end
        chunkIndex++
      }
    }

    if (metadata?.transcript) {
      const fileName = 'transcript-0.json'
      const filePath = this.joinPath(recordingFolder, fileName)
      const payload = JSON.stringify({ transcript: metadata.transcript })
      await window.electronAPI.saveRecording(filePath, new TextEncoder().encode(payload).buffer)
      manifest.transcript.push(fileName)
    }

    return { manifest }
  }

  static async saveTranscriptChunk(
    recordingFolder: string,
    transcript: RecordingMetadata['transcript']
  ): Promise<string | null> {
    if (!window.electronAPI?.saveRecording) {
      logger.error('Electron API unavailable for saveTranscriptChunk')
      return null
    }
    if (!transcript) return null

    const fileName = 'transcript-0.json'
    const filePath = this.joinPath(recordingFolder, fileName)
    const payload = JSON.stringify({ transcript })
    await window.electronAPI.saveRecording(filePath, new TextEncoder().encode(payload).buffer)
    return fileName
  }

  // Filesystem: load metadata chunks back into a single object
  static async loadMetadataChunks(recordingFolder: string, metadataChunks: NonNullable<Pick<import('@/types/project').Recording, 'metadataChunks'>['metadataChunks']>): Promise<any> {
    if (!window.electronAPI?.readLocalFile) {
      logger.error('Electron API unavailable for loadMetadataChunks')
      return {}
    }

    const api = window.electronAPI!

    const combine = async (files?: string[]) => {
      const list = files || []
      const all: any[] = []
      for (const name of list) {
        const filePath = this.joinPath(recordingFolder, name)
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
        const filePath = this.joinPath(recordingFolder, name)
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

  // In-memory blob URL cache with LRU eviction to prevent memory leaks
  private static readonly MAX_BLOB_CACHE_SIZE = 50
  private static blobUrlCacheOrder: string[] = []
  private static blobUrlCache = new Map<string, string>()

  /**
   * Store a recording blob URL
   */
  static setBlobUrl(recordingId: string, url: string): void {
    try {
      // LRU management
      if (this.blobUrlCache.has(recordingId)) {
        // Move to end (most recently used)
        this.blobUrlCacheOrder = this.blobUrlCacheOrder.filter(id => id !== recordingId)
      } else if (this.blobUrlCacheOrder.length >= this.MAX_BLOB_CACHE_SIZE) {
        // Evict oldest (least recently used)
        const oldest = this.blobUrlCacheOrder.shift()
        if (oldest) {
          this.blobUrlCache.delete(oldest)
          logger.debug(`Evicted blob URL for recording ${oldest} (LRU)`)
        }
      }
      this.blobUrlCacheOrder.push(recordingId)
      this.blobUrlCache.set(recordingId, url)
      localStorage.setItem(`${this.BLOB_PREFIX}${recordingId}`, url)
      logger.debug(`Stored blob URL for recording ${recordingId}`)
    } catch (error) {
      logger.error(`Failed to store blob URL for recording ${recordingId}:`, error)
    }
  }

  /**
   * Get a recording blob URL
   */
  static getBlobUrl(recordingId: string): string | null {
    if (this.blobUrlCache.has(recordingId)) {
      // Move to end (most recently used)
      this.blobUrlCacheOrder = this.blobUrlCacheOrder.filter(id => id !== recordingId)
      this.blobUrlCacheOrder.push(recordingId)
      return this.blobUrlCache.get(recordingId)!
    }
    const url = localStorage.getItem(`${this.BLOB_PREFIX}${recordingId}`)
    if (url) {
      // Add to cache with LRU management
      if (this.blobUrlCacheOrder.length >= this.MAX_BLOB_CACHE_SIZE) {
        const oldest = this.blobUrlCacheOrder.shift()
        if (oldest) this.blobUrlCache.delete(oldest)
      }
      this.blobUrlCacheOrder.push(recordingId)
      this.blobUrlCache.set(recordingId, url)
    }
    return url
  }

  /**
   * Clear a recording blob URL
   */
  static clearBlobUrl(recordingId: string): void {
    this.blobUrlCache.delete(recordingId)
    this.blobUrlCacheOrder = this.blobUrlCacheOrder.filter(id => id !== recordingId)
    localStorage.removeItem(`${this.BLOB_PREFIX}${recordingId}`)
    logger.debug(`Cleared blob URL for recording ${recordingId}`)
  }

  /**
   * Cache video URLs for multiple recordings at once.
   * This prevents repeated video-stream IPC requests during project load/render.
   * Can be called fire-and-forget (non-awaited) or awaited for sequential loading.
   */
  static async cacheVideoUrls(recordings: Recording[]): Promise<void> {
    if (!recordings || recordings.length === 0) return
    if (!window.electronAPI?.getVideoUrl) return

    const electronAPI = window.electronAPI
    await Promise.all(recordings.map(async (recording) => {
      // Skip if already cached
      if (this.getBlobUrl(recording.id)) return
      if (!recording.filePath || recording.sourceType === 'generated') return

      try {
        const videoUrl = await electronAPI.getVideoUrl!(recording.filePath)
        if (videoUrl) {
          this.setBlobUrl(recording.id, videoUrl)
        }
      } catch {
        console.warn('Failed to cache video URL for recording:', recording.id)
      }
    }))
  }

  // setMetadata/getMetadata replaced above with in-memory cache

  /**
   * Store project data
   */
  static setProject(projectId: string, projectData: any): void {
    try {
      const dataStr = typeof projectData === 'string'
        ? projectData
        : JSON.stringify(projectData)
      localStorage.setItem(`${this.PROJECT_PREFIX}${projectId}`, dataStr)
      logger.debug(`Stored project ${projectId}`)
    } catch (error) {
      logger.error(`Failed to store project ${projectId}:`, error)
    }
  }

  /**
   * Get project data
   */
  static getProject(projectId: string): any | null {
    try {
      const projectStr = localStorage.getItem(`${this.PROJECT_PREFIX}${projectId}`)
      if (!projectStr) return null
      return JSON.parse(projectStr)
    } catch (error) {
      logger.error(`Failed to parse project ${projectId}:`, error)
      return null
    }
  }

  /**
   * Store project path
   */
  static setProjectPath(projectId: string, path: string): void {
    try {
      localStorage.setItem(`${this.PROJECT_PATH_PREFIX}${projectId}`, path)
      logger.debug(`Stored project path for ${projectId}: ${path}`)
    } catch (error) {
      logger.error(`Failed to store project path for ${projectId}:`, error)
    }
  }

  /**
   * Clear all blob URLs from localStorage (useful on app startup)
   * Since blob URLs are session-specific and become invalid after restart
   */
  static clearAllBlobUrls(): void {
    this.blobUrlCache.clear()
    this.blobUrlCacheOrder = []
    const keysToRemove: string[] = []

    // Find all blob URL keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(this.BLOB_PREFIX)) {
        keysToRemove.push(key)
      }
    }

    // Remove all blob URL entries
    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    if (keysToRemove.length > 0) {
      logger.info(`Cleared ${keysToRemove.length} cached blob URLs on startup`)
    }
  }

  /**
   * Create a new project with default settings
   */
  static createProject(name: string): Project {
    return {
      version: '1.0.0',
      id: `project-${Date.now()}`,
      name,
      schemaVersion: migrationRunner.getLatestVersion(),
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      recordings: [],
      timeline: {
        tracks: [
          {
            id: 'video-1',
            name: 'Video',
            type: TrackType.Video,
            clips: [],
            muted: false,
            locked: false
          },
          {
            id: 'audio-1',
            name: 'Audio',
            type: TrackType.Audio,
            clips: [],
            muted: false,
            locked: false
          },
          {
            id: 'webcam-1',
            name: 'Webcam',
            type: TrackType.Webcam,
            clips: [],
            muted: false,
            locked: false
          }
        ],
        duration: 0,
        effects: []  // Initialize effects array
      },
      settings: normalizeProjectSettings(),
      exportPresets: [
        {
          id: 'default',
          name: 'Default',
          format: ExportFormat.MP4,
          codec: 'h264',
          quality: QualityLevel.High,
          resolution: { width: 1920, height: 1080 },
          frameRate: 60
        }
      ]
    }
  }

  /**
   * Save project to file system
   */
  static async saveProject(project: Project, customPath?: string): Promise<string | null> {
    // Deep clone and remove heavy metadata before serialization
    const projectCopy: Project = {
      ...project,
      recordings: project.recordings.map(r => {
        const clone: any = { ...r }
        if ('metadata' in clone) delete clone.metadata
        if (!r.folderPath && r.metadata?.transcript) {
          clone.metadata = {
            transcript: r.metadata.transcript,
            transcriptionStatus: r.metadata.transcriptionStatus
          }
        }
        return clone
      })
    }

    if (typeof window !== 'undefined' && window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
      try {
        const recordingsDir = await window.electronAPI.getRecordingsDirectory()
        const baseName = this.sanitizeName(projectCopy.name || projectCopy.id)

        const hasProjectExt = (p: string) => p.endsWith(PROJECT_EXTENSION)
        const trimTrailingSlash = (p: string) => p.replace(/\/+$/, '')

        let projectRoot: string

        let useLegacyFile = false

        if (customPath && hasProjectExt(customPath)) {
          projectRoot = trimTrailingSlash(customPath)

          const packageFilePath = buildProjectFilePath(projectRoot)
          const packageExists = window.electronAPI?.fileExists
            ? await window.electronAPI.fileExists(packageFilePath)
            : false

          let legacyFileDetected = false
          if (!packageExists && window.electronAPI?.readLocalFile) {
            const legacyRead = await window.electronAPI.readLocalFile(projectRoot)
            legacyFileDetected = !!legacyRead?.success
          }

          if (legacyFileDetected && window.electronAPI?.moveFile) {
            const legacyBackupBase = `${projectRoot}.legacy`
            let legacyBackupPath = legacyBackupBase

            if (window.electronAPI?.fileExists && await window.electronAPI.fileExists(legacyBackupPath)) {
              legacyBackupPath = `${legacyBackupBase}-${Date.now()}`
            }

            const backupResult = await window.electronAPI.moveFile(projectRoot, legacyBackupPath)
            if (!backupResult?.success) {
              logger.warn('[RecordingStorage] Failed to preserve legacy project file during package upgrade')
              useLegacyFile = true
            }
          } else if (legacyFileDetected) {
            useLegacyFile = true
          }
        } else if (customPath && !hasProjectExt(customPath)) {
          projectRoot = `${trimTrailingSlash(customPath)}/${baseName}${PROJECT_EXTENSION}`
        } else {
          projectRoot = `${recordingsDir}/${baseName}${PROJECT_EXTENSION}`
        }

        // Note: Metadata chunks are already saved once in saveRecordingWithProject()
        // when the recording is first created. No need to re-save them on every project save.

        const projectFilePath = useLegacyFile ? projectRoot : buildProjectFilePath(projectRoot)
        projectCopy.filePath = projectRoot
        // PERF: Use compact JSON for internal saves (~40% smaller files)
        const projectData = JSON.stringify(projectCopy)

        await window.electronAPI.saveRecording(projectFilePath, new TextEncoder().encode(projectData).buffer)

        this.setProjectPath(projectCopy.id, projectCopy.filePath)

        logger.info(`Project saved to: ${projectFilePath}`)
        return projectCopy.filePath
      } catch (error) {
        console.error('Failed to save project file:', error)
        const projectData = JSON.stringify(projectCopy)
        this.setProject(projectCopy.id, projectData)
        return null
      }
    } else {
      const projectData = JSON.stringify(projectCopy)
      this.setProject(projectCopy.id, projectData)
      return null
    }
  }

  /**
   * Save recording with project - uses file path from streaming
   */
  static async saveRecordingWithProject(
    videoPath: string,  // File path from streaming
    metadata: any[],
    projectName?: string,
    captureArea?: CaptureArea,
    hasAudio?: boolean,
    durationOverrideMs?: number,
    webcamResult?: { videoPath: string; duration: number; hasAudio?: boolean },
    microphoneResult?: { audioPath: string; duration: number }
  ): Promise<{ project: Project; videoPath: string; projectPath: string; webcamVideoPath?: string; audioPath?: string } | null> {
    if (!window.electronAPI?.saveRecording || !window.electronAPI?.getRecordingsDirectory) {
      return null
    }

    try {
      const recordingsDir = await window.electronAPI.getRecordingsDirectory()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const baseName = projectName || `Recording_${timestamp}`
      const recordingId = `recording-${Date.now()}`
      const projectFolder = `${recordingsDir}/${this.sanitizeName(baseName)}${PROJECT_EXTENSION}`
      const recordingFolder = `${projectFolder}/${recordingId}`

      // Move video file from temp to project folder (new folder structure nests media inside recording folder)
      if (!window.electronAPI?.moveFile) {
        throw new Error('moveFile API not available')
      }

      const ext = videoPath.toLowerCase().endsWith('.mov') ? 'mov' :
        videoPath.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm'
      const videoFileName = `${recordingId}.${ext}`
      const videoFilePath = `${recordingFolder}/${videoFileName}`

      const moveResult = await window.electronAPI.moveFile(videoPath, videoFilePath)
      if (!moveResult?.success) {
        throw new Error('Failed to move video file')
      }

      // Get video metadata from the metadata array or fallbacks
      let duration = 0
      let width = 0
      let height = 0
      let actualWidth = 0
      let actualHeight = 0

      try {
        const videoMeta = await getVideoMetadataFromPath(videoFilePath)
        actualWidth = videoMeta.width || 0
        actualHeight = videoMeta.height || 0
        if (actualWidth > 0 && actualHeight > 0) {
          width = actualWidth
          height = actualHeight
        }
        if (videoMeta.duration > 0) {
          duration = videoMeta.duration
        }
      } catch (error) {
        logger.warn('[Recording Storage] Failed to read video metadata, using fallbacks', error)
      }

      // Fallbacks if metadata could not be read (e.g., QuickTime in Chromium)
      if (duration <= 0) {
        const lastTs = (metadata && metadata.length > 0) ? (metadata[metadata.length - 1].timestamp || 0) : 0
        duration = durationOverrideMs || lastTs || 0
      }
      if (!width || !height) {
        const scale = captureArea?.scaleFactor || 1
        width = (captureArea?.fullBounds?.width ? Math.round(captureArea.fullBounds.width * scale) : width) || width || 1920
        height = (captureArea?.fullBounds?.height ? Math.round(captureArea.fullBounds.height * scale) : height) || height || 1080
      }

      // Create project with recording
      const project = this.createProject(baseName)
      project.filePath = projectFolder
      project.settings.resolution = { width, height }
      project.settings.canvas.customWidth = width
      project.settings.canvas.customHeight = height
      project.exportPresets = project.exportPresets.map(preset => ({
        ...preset,
        resolution: { width, height }
      }))

      // Get capture dimensions from first mouse event (they all have it now)
      const firstMouseEvent = metadata.find(m => m.eventType === 'mouse' && m.captureWidth && m.captureHeight)
      const expectedScale = captureArea?.scaleFactor || 1
      const expectedWidth = captureArea?.fullBounds?.width
        ? Math.round(captureArea.fullBounds.width * expectedScale)
        : (firstMouseEvent?.captureWidth ? Math.round(firstMouseEvent.captureWidth) : 0)
      const expectedHeight = captureArea?.fullBounds?.height
        ? Math.round(captureArea.fullBounds.height * expectedScale)
        : (firstMouseEvent?.captureHeight ? Math.round(firstMouseEvent.captureHeight) : 0)
      const needsScaleFix = actualWidth > 0 && actualHeight > 0 &&
        expectedWidth > 0 && expectedHeight > 0 &&
        (Math.abs(actualWidth - expectedWidth) > 2 || Math.abs(actualHeight - expectedHeight) > 2)
      const scaleX = needsScaleFix ? actualWidth / expectedWidth : 1
      const scaleY = needsScaleFix ? actualHeight / expectedHeight : 1

      const normalizedCaptureWidth = actualWidth || width
      const normalizedCaptureHeight = actualHeight || height

      const captureWidth = expectedWidth || normalizedCaptureWidth
      const captureHeight = expectedHeight || normalizedCaptureHeight
      const applyScaleX = (value: number) => needsScaleFix ? Math.round(value * scaleX) : value
      const applyScaleY = (value: number) => needsScaleFix ? Math.round(value * scaleY) : value

      const firstEventWithBounds = metadata.find(m => m.sourceBounds)
      const sourceBounds = firstEventWithBounds?.sourceBounds

      const rawMouseEvents = metadata
        .filter(m => m.eventType === 'mouse' && m.mouseX !== undefined && m.mouseY !== undefined)
        .map(m => ({
          timestamp: m.timestamp,
          x: applyScaleX(m.mouseX!),
          y: applyScaleY(m.mouseY!),
          screenWidth: applyScaleX(m.screenWidth || captureWidth),
          screenHeight: applyScaleY(m.screenHeight || captureHeight),
          captureWidth: normalizedCaptureWidth,
          captureHeight: normalizedCaptureHeight,
          cursorType: m.cursorType
        }))

      // Normalize cursor event timestamps to start from 0 (align with video playback)
      // This fixes cursor sync issues caused by delay between tracking start and video capture start
      const firstEventTime = rawMouseEvents[0]?.timestamp ?? 0
      const mouseEvents = rawMouseEvents.map(m => ({
        ...m,
        timestamp: m.timestamp - firstEventTime
      }))

      const clickEvents = metadata
        .filter(m => m.eventType === 'click' && m.mouseX !== undefined && m.mouseY !== undefined)
        .map(m => ({
          timestamp: m.timestamp - firstEventTime, // Use same offset as mouse events
          x: applyScaleX(m.mouseX!),
          y: applyScaleY(m.mouseY!),
          button: m.key || 'left' as const,
          captureWidth: normalizedCaptureWidth,
          captureHeight: normalizedCaptureHeight
        }))

      const scrollEvents = metadata
        .filter(m => m.eventType === 'scroll' && m.scrollDelta)
        .map(m => ({
          timestamp: m.timestamp - firstEventTime, // Use same offset as mouse events
          deltaX: m.scrollDelta!.x || 0,
          deltaY: m.scrollDelta!.y || 0
        }))

      const keyboardEvents = metadata
        .filter(m => m.eventType === 'keypress' && m.keyEventType === 'keydown')
        .filter(m => m.key && m.key.length > 0)  // Filter out empty keys
        .filter(m => isLikelyKeyboardKey(m.key!))
        .filter(m => !isStandaloneModifierKey(m.key!))  // Filter out standalone modifier keys
        .map(m => ({
          timestamp: m.timestamp - firstEventTime, // Use same offset as mouse events
          key: m.key,
          modifiers: m.modifiers || []
        }))

      logger.info(`📊 Saving recording with ${keyboardEvents.length} keyboard events`)

      const reconstructedCaptureArea = sourceBounds ? {
        fullBounds: sourceBounds,
        workArea: sourceBounds,
        scaleFactor: 1,
        sourceType: firstEventWithBounds?.sourceType || RecordingSourceType.Screen,
        sourceId: ''
      } : captureArea

      // Add recording to project
      const recording: Recording = {
        id: recordingId,
        filePath: `${recordingId}/${videoFileName}`,
        duration,
        width,
        height,
        frameRate: 30,
        hasAudio: hasAudio || false,
        sourceType: 'video',
        captureArea: reconstructedCaptureArea,
        // For folder-based metadata storage
        folderPath: recordingFolder,
        // Keep metadata in memory for immediate use; will be omitted from saved project
        metadata: {
          mouseEvents,
          keyboardEvents,
          clickEvents,
          scrollEvents,
          screenEvents: [],
          captureArea: reconstructedCaptureArea
        },
        // Legacy field: effects now live in project.timeline.effects (SSOT)
        effects: []
      }

      project.recordings.push(recording)

      // Create and add clip (without effects)
      const clip: Clip = {
        id: `clip-${Date.now()}`,
        recordingId: recording.id,
        startTime: 0,
        duration,
        sourceIn: 0,
        sourceOut: duration
      }

      const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
      if (videoTrack) {
        videoTrack.clips.push(clip)
      }

      project.timeline.duration = duration

      // Handle webcam recording if present
      let webcamVideoFilePath: string | undefined
      if (webcamResult?.videoPath && window.electronAPI?.moveFile) {
        const webcamRecordingId = `webcam-${Date.now()}`
        const webcamFolder = `${projectFolder}/${webcamRecordingId}`
        const webcamExt = webcamResult.videoPath.toLowerCase().endsWith('.mov') ? 'mov' :
          webcamResult.videoPath.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm'
        const webcamFileName = `${webcamRecordingId}.${webcamExt}`
        webcamVideoFilePath = `${webcamFolder}/${webcamFileName}`

        try {
          const webcamMoveResult = await window.electronAPI.moveFile(webcamResult.videoPath, webcamVideoFilePath)
          if (webcamMoveResult?.success) {
            // Get webcam video metadata
            let webcamWidth = 1920
            let webcamHeight = 1080
            // Prefer wall-clock duration from WebcamService (reliable), fallback to main recording duration
            // WebM files created by MediaRecorder streaming often have incorrect/missing duration metadata
            let webcamDuration = webcamResult.duration || duration

            try {
              const webcamMeta = await getVideoMetadataFromPath(webcamVideoFilePath)
              if (webcamMeta.width > 0) webcamWidth = webcamMeta.width
              if (webcamMeta.height > 0) webcamHeight = webcamMeta.height
              // Only use file metadata duration if we don't have a valid duration from WebcamService
              // and the metadata duration is reasonable (at least 100ms)
              if (!webcamResult.duration && webcamMeta.duration > 100) {
                webcamDuration = webcamMeta.duration
              }
            } catch (_e) {
              logger.warn('[Recording Storage] Failed to read webcam metadata, using defaults')
            }

            // Create webcam Recording
            const webcamRecording: Recording = {
              id: webcamRecordingId,
              filePath: `${webcamRecordingId}/${webcamFileName}`,
              duration: webcamDuration,
              width: webcamWidth,
              height: webcamHeight,
              frameRate: 30,
              hasAudio: webcamResult.hasAudio || false,
              folderPath: webcamFolder,
              sourceType: 'video',
              effects: []
            }
            project.recordings.push(webcamRecording)

            // Create webcam clip matching screen recording duration
            const webcamClip: Clip = {
              id: `webcam-clip-${Date.now()}`,
              recordingId: webcamRecordingId,
              startTime: 0,
              duration: Math.min(webcamDuration, duration),
              sourceIn: 0,
              sourceOut: Math.min(webcamDuration, duration)
            }

            const webcamTrack = project.timeline.tracks.find(t => t.type === TrackType.Webcam)
            if (webcamTrack) {
              webcamTrack.clips.push(webcamClip)
              logger.info(`[Recording Storage] Webcam clip added to track:`, { clipId: webcamClip.id, recordingId: webcamRecordingId, trackClipsCount: webcamTrack.clips.length })
            } else {
              logger.warn('[Recording Storage] No webcam track found in project!')
            }

            logger.info(`[Recording Storage] Webcam recording saved: ${webcamVideoFilePath}`, { recordingId: webcamRecordingId, filePath: webcamRecording.filePath, folderPath: webcamFolder })
          } else {
            logger.warn('[Recording Storage] Failed to move webcam file')
          }
        } catch (webcamError) {
          logger.error('[Recording Storage] Error saving webcam recording:', webcamError)
        }
      }

      // Handle microphone audio recording if present
      let audioFilePath: string | undefined
      if (microphoneResult?.audioPath && window.electronAPI?.moveFile) {
        const audioRecordingId = `audio-${Date.now()}`
        const audioFolder = `${projectFolder}/${audioRecordingId}`
        const audioExt = microphoneResult.audioPath.toLowerCase().endsWith('.wav') ? 'wav' :
          microphoneResult.audioPath.toLowerCase().endsWith('.mp3') ? 'mp3' : 'webm'
        const audioFileName = `${audioRecordingId}.${audioExt}`
        audioFilePath = `${audioFolder}/${audioFileName}`

        try {
          const audioMoveResult = await window.electronAPI.moveFile(microphoneResult.audioPath, audioFilePath)
          if (audioMoveResult?.success) {
            const audioDuration = microphoneResult.duration || duration

            // Create audio Recording entry
            const audioRecording: Recording = {
              id: audioRecordingId,
              filePath: `${audioRecordingId}/${audioFileName}`,
              duration: audioDuration,
              width: 0,
              height: 0,
              frameRate: 0,
              hasAudio: true,
              folderPath: audioFolder,
              sourceType: 'video', // Use 'video' type since Remotion Audio component handles it
              effects: []
            }
            project.recordings.push(audioRecording)

            // Create audio clip matching screen recording duration
            const audioClip: Clip = {
              id: `audio-clip-${Date.now()}`,
              recordingId: audioRecordingId,
              startTime: 0,
              duration: Math.min(audioDuration, duration),
              sourceIn: 0,
              sourceOut: Math.min(audioDuration, duration)
            }

            const audioTrack = project.timeline.tracks.find(t => t.type === TrackType.Audio)
            if (audioTrack) {
              audioTrack.clips.push(audioClip)
            }

            logger.info(`[Recording Storage] Microphone audio saved: ${audioFilePath}`)
          } else {
            logger.warn('[Recording Storage] Failed to move audio file')
            audioFilePath = undefined
          }
        } catch (audioError) {
          logger.error('[Recording Storage] Error saving microphone recording:', audioError)
          audioFilePath = undefined
        }
      }

      // Ensure global effects exist (background, cursor, and per-typing-period keystroke effects)
      EffectInitialization.ensureGlobalEffects(project)

      // Dynamically load IdleActivityDetector to avoid circular dependencies
      const { IdleActivityDetector } = require('@/features/ui/timeline/activity-detection/idle-detector')

      // Regenerate all auto effects and default framing for new recordings.
      regenerateProjectEffects(
        project,
        IdleActivityDetector,
        undefined,
        new Map([[recording.id, recording.metadata!]])
      )

      // Log keystroke effect status after regeneration.
      const keystrokeEffects = getEffectsOfType(EffectStore.getAll(project), EffectType.Keystroke, false)
      if (keystrokeEffects.length > 0) {
        logger.info(`✅ Created ${keystrokeEffects.length} keystroke effect blocks from typing periods`)
      } else if (keyboardEvents.length > 0) {
        logger.info('⚠️ Keyboard events detected but no typing periods found')
      } else {
        logger.info('ℹ️ No keyboard events detected - skipping keystroke effects')
      }

      // Save metadata chunks under recording folder
      const manifest = await this.saveMetadataChunks(recording.folderPath!, {
        mouseEvents,
        keyboardEvents,
        clickEvents,
        scrollEvents,
        screenEvents: [],
      })

      // Attach manifest to recording
      if (manifest) {
        recording.metadataChunks = manifest.manifest
      }

      // Cache metadata in memory for quick access
      this.setMetadata(recording.id, recording.metadata)

      // Save project file to folder
      const projectPath = await this.saveProject(project, project.filePath)

      await this.generateAndSaveProjectThumbnail(videoFilePath, projectFolder)

      return {
        project,
        videoPath: videoFilePath,
        projectPath: projectPath || '',
        webcamVideoPath: webcamVideoFilePath,
        audioPath: audioFilePath
      }
    } catch (error) {
      logger.error('Failed to save recording with project:', error)
      return null
    }
  }

  private static async generateAndSaveProjectThumbnail(videoPath: string, projectFolder: string): Promise<void> {
    try {
      if (!window.electronAPI?.saveRecording) return
      const thumbnailPath = this.joinPath(projectFolder, this.PROJECT_THUMBNAIL_NAME)

      if (window.electronAPI?.fileExists) {
        const exists = await window.electronAPI.fileExists(thumbnailPath)
        if (exists) return
      }

      const dataUrl = await ThumbnailGenerator.generateThumbnail(
        videoPath,
        thumbnailPath,
        {
          width: 320,
          height: 180,
          quality: 0.6,
          timestamp: 0.1
        }
      )

      if (!dataUrl) return

      const buffer = this.dataUrlToArrayBuffer(dataUrl)
      if (!buffer) return

      await window.electronAPI.saveRecording(thumbnailPath, buffer)
    } catch (error) {
      logger.warn('[RecordingStorage] Failed to save project thumbnail:', error)
    }
  }

  private static dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return null

    try {
      const base64 = match[2]
      const binary = atob(base64)
      const len = binary.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes.buffer
    } catch {
      return null
    }
  }

}
