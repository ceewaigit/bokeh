/**
 * Centralized localStorage management for recordings
 * Single source of truth for recording blobs and metadata
 */

import { logger } from '@/lib/utils/logger'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import type { Project, Recording, Clip, CaptureArea } from '@/types/project'
import { TrackType, ExportFormat, QualityLevel, RecordingSourceType, AspectRatioPreset } from '@/types/project'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { EffectGenerationService } from '@/lib/effects/effect-generation-service'
import { isLikelyKeyboardKey, isStandaloneModifierKey } from '@/lib/keyboard/keyboard-utils'
import { getVideoMetadataFromPath } from '@/lib/utils/video-metadata'

export const PROJECT_EXTENSION = '.bokeh'
// Regex for removing extensions from filenames
export const PROJECT_EXTENSION_REGEX = /\.bokeh$/

export const SUPPORTED_PROJECT_EXTENSIONS = ['bokeh']

export class RecordingStorage {
  private static readonly BLOB_PREFIX = 'recording-blob-'
  private static readonly PROJECT_PREFIX = 'project-'
  private static readonly PROJECT_PATH_PREFIX = 'project-path-'
  private static readonly PROJECT_THUMBNAIL_NAME = 'thumbnail.jpg'

  // In-memory metadata cache with LRU eviction
  // PERF: Limit to 2 recordings since we only need the current + potentially one more
  // Each metadata object can be 1-10MB (mouse/keyboard events)
  private static readonly MAX_METADATA_CACHE_SIZE = 2
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
        if (Object.isExtensible(metadata)) return metadata
        if (Array.isArray(metadata)) return [...metadata]
        return { ...(metadata as Record<string, unknown>) }
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

    const manifest: any = { mouse: [], keyboard: [], click: [], scroll: [], screen: [] }

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

    return { manifest }
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
        if (res?.success && res.data) {
          try {
            const json = JSON.parse(new TextDecoder().decode(res.data))
            const arr = (json && Object.values(json)[0]) as any[]
            if (Array.isArray(arr)) all.push(...arr)
          } catch (e) {
            logger.error('Failed parsing metadata chunk', name, e)
          }
        }
      }
      return all
    }

    const mouseEvents = await combine(metadataChunks.mouse)
    const keyboardEvents = await combine(metadataChunks.keyboard)
    const clickEvents = await combine(metadataChunks.click)
    const scrollEvents = await combine(metadataChunks.scroll)
    const screenEvents = await combine(metadataChunks.screen)

    return {
      mouseEvents,
      keyboardEvents,
      clickEvents,
      scrollEvents,
      screenEvents,
    }
  }

  // In-memory blob URL cache to avoid localStorage hits
  private static blobUrlCache = new Map<string, string>()

  /**
   * Store a recording blob URL
   */
  static setBlobUrl(recordingId: string, url: string): void {
    try {
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
      return this.blobUrlCache.get(recordingId)!
    }
    const url = localStorage.getItem(`${this.BLOB_PREFIX}${recordingId}`)
    if (url) {
      this.blobUrlCache.set(recordingId, url)
    }
    return url
  }

  /**
   * Clear a recording blob URL
   */
  static clearBlobUrl(recordingId: string): void {
    this.blobUrlCache.delete(recordingId)
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
      } catch (e) {
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
      schemaVersion: 1,
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
          }
        ],
        duration: 0,
        effects: []  // Initialize effects array
      },
      settings: {
        resolution: { width: 1920, height: 1080 },
        frameRate: 60,
        backgroundColor: '#000000',
        canvas: {
          aspectRatio: AspectRatioPreset.Original,
          customWidth: 1920,
          customHeight: 1080
        }
      },
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
        return clone
      })
    }

    if (typeof window !== 'undefined' && window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
      try {
        const recordingsDir = await window.electronAPI.getRecordingsDirectory()
        // Use folder-based project layout: <recordingsDir>/<projectName>/<projectId>.bokeh
        const baseName = this.sanitizeName(projectCopy.name || projectCopy.id)
        let projectFolder: string

        // Helper to check extensions
        const hasProjectExt = (p: string) => p.endsWith(PROJECT_EXTENSION)

        if (customPath && hasProjectExt(customPath)) {
          const idx = customPath.lastIndexOf('/')
          projectFolder = idx > 0 ? customPath.slice(0, idx) : recordingsDir
        } else if (customPath && !hasProjectExt(customPath)) {
          projectFolder = customPath
        } else {
          projectFolder = `${recordingsDir}/${baseName}`
        }

        // Note: Metadata chunks are already saved once in saveRecordingWithProject()
        // when the recording is first created. No need to re-save them on every project save.

        // Use correct extension based on existing file or default to .bokeh
        const ext = PROJECT_EXTENSION
        const projectFilePath = `${projectFolder}/${projectCopy.id}${ext}`
        projectCopy.filePath = projectFilePath
        const projectData = JSON.stringify(projectCopy, null, 2)

        await window.electronAPI.saveRecording(projectFilePath, new TextEncoder().encode(projectData).buffer)

        this.setProjectPath(projectCopy.id, projectFilePath)

        logger.info(`Project saved to: ${projectFilePath}`)
        return projectFilePath
      } catch (error) {
        console.error('Failed to save project file:', error)
        const projectData = JSON.stringify(projectCopy, null, 2)
        this.setProject(projectCopy.id, projectData)
        return null
      }
    } else {
      const projectData = JSON.stringify(projectCopy, null, 2)
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
    durationOverrideMs?: number
  ): Promise<{ project: Project; videoPath: string; projectPath: string } | null> {
    if (!window.electronAPI?.saveRecording || !window.electronAPI?.getRecordingsDirectory) {
      return null
    }

    try {
      const recordingsDir = await window.electronAPI.getRecordingsDirectory()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const baseName = projectName || `Recording_${timestamp}`
      const recordingId = `recording-${Date.now()}`
      const projectFolder = `${recordingsDir}/${this.sanitizeName(baseName)}`
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
      project.filePath = `${projectFolder}/${project.id}${PROJECT_EXTENSION}`
      project.settings.resolution = { width, height }
      project.settings.canvas!.customWidth = width
      project.settings.canvas!.customHeight = height
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

      const mouseEvents = metadata
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

      const clickEvents = metadata
        .filter(m => m.eventType === 'click' && m.mouseX !== undefined && m.mouseY !== undefined)
        .map(m => ({
          timestamp: m.timestamp,
          x: applyScaleX(m.mouseX!),
          y: applyScaleY(m.mouseY!),
          button: m.key || 'left' as const,
          captureWidth: normalizedCaptureWidth,
          captureHeight: normalizedCaptureHeight
        }))

      const scrollEvents = metadata
        .filter(m => m.eventType === 'scroll' && m.scrollDelta)
        .map(m => ({
          timestamp: m.timestamp,
          deltaX: m.scrollDelta!.x || 0,
          deltaY: m.scrollDelta!.y || 0
        }))

      console.log('[Recording Storage] Scroll events found:', scrollEvents.length, scrollEvents.slice(0, 5))

      const keyboardEvents = metadata
        .filter(m => m.eventType === 'keypress' && m.keyEventType === 'keydown')
        .filter(m => m.key && m.key.length > 0)  // Filter out empty keys
        .filter(m => isLikelyKeyboardKey(m.key!))
        .filter(m => !isStandaloneModifierKey(m.key!))  // Filter out standalone modifier keys
        .map(m => ({
          timestamp: m.timestamp,
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
        // Effects will be created below via createInitialEffectsForRecording
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

      // Create effects on the recording itself (in source space)
      EffectsFactory.createInitialEffectsForRecording(recording)

      // Ensure global effects exist (background, cursor, and per-typing-period keystroke effects)
      EffectsFactory.ensureGlobalEffects(project)
      // Regenerate all auto effects and default framing for new recordings.
      EffectGenerationService.regenerateAllEffects(
        project,
        undefined,
        new Map([[recording.id, recording.metadata!]])
      )

      // Log keystroke effect status after regeneration.
      const keystrokeEffects = EffectsFactory.getKeystrokeEffects(project.timeline.effects || [])
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

      void this.generateAndSaveProjectThumbnail(videoFilePath, projectFolder)

      return {
        project,
        videoPath: videoFilePath,
        projectPath: projectPath || ''
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
