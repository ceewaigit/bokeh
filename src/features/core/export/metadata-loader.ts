/**
 * Parallel metadata loader for efficient chunk loading
 * Loads metadata chunks from disk in parallel for faster export
 */

import type { Recording, RecordingMetadata, CaptureArea } from '@/types'
import { ProjectStorage } from '@/features/core/storage/project-storage'
import { logger } from '@/shared/utils/logger'
import { assertDefined } from '@/shared/errors'

export interface MetadataLoadResult {
  recordingId: string
  metadata: RecordingMetadata | null
  cached: boolean
}

/**
 * URL set for metadata chunks served via HTTP (used during export)
 */
export interface MetadataUrlSet {
  mouse?: string[]
  keyboard?: string[]
  click?: string[]
  scroll?: string[]
  screen?: string[]
  transcript?: string[]
}

export class MetadataLoader {
  private loadPromises: Map<string, Promise<RecordingMetadata | null>> = new Map()

  /**
   * Load metadata for multiple recordings in parallel
   */
  async loadAllMetadata(recordings: Recording[]): Promise<Map<string, RecordingMetadata>> {
    const startTime = performance.now()
    const results = new Map<string, RecordingMetadata>()
    const recordingsSnapshot = recordings.map((recording) => this.createSnapshot(recording))

    // Create load tasks for each recording
    const loadTasks = recordingsSnapshot.map(async (recording) => {
      const recordingId = assertDefined(
        this.safeGet<string>(recording, 'id') ?? recording.id,
        'Encountered recording without id while loading metadata'
      )

      const metadata = await this.loadRecordingMetadata(recording)
      if (metadata) {
        results.set(recordingId, metadata)
      }
      return { recordingId, metadata, cached: false }
    })

    // Execute all loads in parallel
    const loadResults = await Promise.all(loadTasks)

    const loadTime = performance.now() - startTime
    const successCount = loadResults.filter(r => r.metadata).length

    logger.info(`Loaded metadata for ${successCount}/${recordings.length} recordings in ${loadTime.toFixed(2)}ms`)

    return results
  }

  /**
   * Load metadata for a single recording (with caching)
   */
  async loadRecordingMetadata(recording: Recording): Promise<RecordingMetadata | null> {
    const recordingId = assertDefined(
      this.safeGet<string>(recording, 'id') ?? recording.id,
      'Attempted to load metadata for recording without id'
    );

    // Check memory cache first
    const cached = ProjectStorage.getMetadata(recordingId)
    if (cached) {
      logger.debug(`Using cached metadata for recording ${recordingId}`)
      return cached
    }

    // Check if we're already loading this recording
    const existingPromise = this.loadPromises.get(recordingId)
    if (existingPromise) {
      return existingPromise
    }

    // Create new load promise
    const loadPromise = this.loadMetadataFromDisk(recordingId, recording)
    this.loadPromises.set(recordingId, loadPromise)

    try {
      const metadata = await loadPromise

      // Cache in memory for future use
      if (metadata) {
        ProjectStorage.setMetadata(recordingId, metadata)
      }

      return metadata
    } finally {
      // Clean up promise cache
      this.loadPromises.delete(recordingId)
    }
  }

  /**
   * Load metadata from HTTP URLs (for Remotion export in headless browser)
   * Used when running in a Chromium context without file system access
   */
  async loadMetadataFromUrls(
    recordingId: string,
    metadataUrls: MetadataUrlSet
  ): Promise<RecordingMetadata> {
    // Check cache first (reuse existing LRU cache)
    const cached = ProjectStorage.getMetadata(recordingId)
    if (cached) {
      logger.debug(`Using cached metadata for recording ${recordingId} (HTTP mode)`)
      return cached
    }

    // Check if we're already loading this recording
    const existingPromise = this.loadPromises.get(recordingId)
    if (existingPromise) {
      const result = await existingPromise
      return assertDefined(result, `Metadata load returned null for recording ${recordingId}`)
    }

    // Create new load promise
    const loadPromise = this.fetchMetadataFromUrls(recordingId, metadataUrls)
    this.loadPromises.set(recordingId, loadPromise)

    try {
      const metadata = await loadPromise
      if (metadata) {
        ProjectStorage.setMetadata(recordingId, metadata)
      }
      return assertDefined(metadata, `Metadata load returned null for recording ${recordingId}`)
    } finally {
      this.loadPromises.delete(recordingId)
    }
  }

  /**
   * Fetch metadata chunks from HTTP URLs
   */
  private async fetchMetadataFromUrls(
    recordingId: string,
    metadataUrls: MetadataUrlSet
  ): Promise<RecordingMetadata> {
    const startTime = performance.now()

    // Fetch all chunks in parallel for each event type
    const fetchChunks = async (urls?: string[]): Promise<any[]> => {
      if (!urls?.length) return []
      const results = await Promise.all(
        urls.map(async (url) => {
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`Failed to fetch metadata chunk: ${url} (${response.status})`)
          }
          return response.json()
        })
      )
      // Combine arrays from each chunk (each chunk has shape { eventType: [...events] })
      return results
        .filter(Boolean)
        .flatMap((r) => (Object.values(r)[0] as any[]) || [])
    }

    const [mouseEvents, keyboardEvents, clickEvents, scrollEvents, screenEvents, transcript] =
      await Promise.all([
        fetchChunks(metadataUrls.mouse),
        fetchChunks(metadataUrls.keyboard),
        fetchChunks(metadataUrls.click),
        fetchChunks(metadataUrls.scroll),
        fetchChunks(metadataUrls.screen),
        (async () => {
          if (!metadataUrls.transcript?.length) return undefined
          const response = await fetch(metadataUrls.transcript[0])
          if (!response.ok) {
            throw new Error(`Failed to fetch metadata chunk: ${metadataUrls.transcript[0]} (${response.status})`)
          }
          const json = await response.json()
          return json?.transcript
        })(),
      ])

    const loadTime = performance.now() - startTime
    logger.info(
      `Loaded metadata from URLs for ${recordingId} in ${loadTime.toFixed(2)}ms ` +
        `(mouse: ${mouseEvents.length}, click: ${clickEvents.length}, keyboard: ${keyboardEvents.length})`
    )

    return {
      mouseEvents,
      keyboardEvents,
      clickEvents,
      scrollEvents,
      screenEvents,
      ...(transcript ? { transcript } : {}),
    }
  }

  /**
   * Create empty metadata object
   */
  private createEmptyMetadata(): RecordingMetadata {
    return {
      mouseEvents: [],
      keyboardEvents: [],
      clickEvents: [],
      scrollEvents: [],
      screenEvents: [],
    }
  }

  /**
   * Load metadata chunks from disk
   */
  private async loadMetadataFromDisk(recordingId: string, recording: Recording): Promise<RecordingMetadata | null> {
    // If metadata is already in memory (from recent recording), use it
    try {
      if (recording.metadata) {
        return this.cloneValue(recording.metadata)
      }
    } catch (error) {
      logger.debug(`Direct metadata access failed for recording ${recordingId}`, error)
    }

    // If we have chunked metadata on disk, load it
    const metadataChunks = this.safeGet<{ mouse?: string[]; keyboard?: string[]; click?: string[]; scroll?: string[]; screen?: string[]; transcript?: string[] }>(recording, 'metadataChunks')
    const folderPath = this.safeGet<string>(recording, 'folderPath')

    if (metadataChunks && folderPath) {
      try {
        const metadata = await ProjectStorage.loadMetadataChunks(
          folderPath,
          metadataChunks
        )

        // Add capture area if available
        const captureArea = this.safeGet<CaptureArea>(recording, 'captureArea')
        if (captureArea) {
          metadata.captureArea = this.cloneValue(captureArea)
        }

        return metadata as RecordingMetadata
      } catch (error) {
        logger.error(`Failed to load metadata chunks for recording ${recordingId}:`, error)
      }
    }

    // Fallback: create minimal metadata from recording info
    return {
      mouseEvents: [],
      keyboardEvents: [],
      clickEvents: [],
      scrollEvents: [],
      screenEvents: [],
      captureArea: this.cloneValue(this.safeGet<CaptureArea>(recording, 'captureArea'))
    }
  }

  /**
   * Preload metadata for recordings that will be needed soon
   * Useful for preloading next clips while current clip is exporting
   */
  async preloadMetadata(recordings: Recording[]): Promise<void> {
    // Fire and forget - just start the loading process
    recordings.forEach(recording => {
      const snapshot = this.createSnapshot(recording)
      const recordingId = this.safeGet<string>(recording, 'id') ?? snapshot.id ?? 'unknown'

      this.loadRecordingMetadata(snapshot).catch(error => {
        logger.debug(`Preload failed for recording ${recordingId}:`, error)
      })
    })
  }

  /**
   * Clear all cached metadata to free memory
   */
  clearCache(): void {
    this.loadPromises.clear()
    // Note: We don't clear ProjectStorage cache here as it's managed separately
  }

  private createSnapshot(recording: Recording): Recording {
    const snapshot: Partial<Recording> = {}
    const copyKeys: Array<keyof Recording> = [
      'id',
      'metadata',
      'metadataChunks',
      'folderPath',
      'captureArea',
      'filePath',
      'duration',
      'width',
      'height'
    ]

    for (const key of copyKeys) {
      const value = this.safeGet<any>(recording, key)
      snapshot[key] = this.shouldDeepClone(key) ? this.cloneValue(value) : value
    }

    if (typeof snapshot.id !== 'string' || !snapshot.id) {
      const fallbackId = this.safeGet<string>(recording, 'id')
      if (typeof fallbackId === 'string' && fallbackId) {
        snapshot.id = fallbackId
      }
    }

    return snapshot as Recording
  }

  private shouldDeepClone(key: keyof Recording): boolean {
    return key === 'metadata' || key === 'metadataChunks' || key === 'captureArea'
  }

  private cloneValue<T>(value: T): T {
    if (value === null || value === undefined) {
      return value
    }

    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(value)
      }
    } catch {
      // Ignore structuredClone failures
    }

    try {
      return JSON.parse(JSON.stringify(value)) as T
    } catch {
      // Final fallback to shallow clone for simple objects/arrays
      if (Array.isArray(value)) {
        return [...value] as unknown as T
      }
      if (typeof value === 'object') {
        return { ...(value as Record<string, unknown>) } as unknown as T
      }
      return value
    }
  }

  private safeGet<T>(source: Recording, key: keyof Recording): T | undefined {
    try {
      return source[key] as unknown as T
    } catch (error) {
      logger.debug(`Metadata loader failed to access ${String(key)} on recording`, error)
      return undefined
    }
  }
}

// Singleton instance for shared use
export const metadataLoader = new MetadataLoader()
