/**
 * BlobURLManager - Unified video/blob management with automatic cleanup
 * Handles video loading, caching, and memory management
 */

import { logger } from '@/shared/utils/logger'
import { MemoryError } from '@/shared/errors'
import { RecordingStorage } from '@/features/core/storage/recording-storage'

interface BlobEntry {
  url: string
  size: number
  createdAt: number
  description?: string
  type?: 'thumbnail' | 'video' | 'export' | 'other'
  priority?: number // Higher = more important to keep
  lastAccessed?: number
}

export class BlobURLManager {
  private entries = new Map<string, BlobEntry>()
  private disposed = false
  private totalSize = 0
  private maxSize = 50 * 1024 * 1024 // 50MB limit - reduced from 500MB (only for UI assets now)
  private thumbnailMaxSize = 30 * 1024 * 1024 // 30MB for thumbnails
  private cleanupTimer: NodeJS.Timeout | null = null
  private loadingPromises = new Map<string, Promise<string | null>>()
  private thumbnailSize = 0
  private videoSize = 0

  create(blob: Blob, description?: string, type: BlobEntry['type'] = 'other', priority = 5): string {
    if (this.disposed) {
      // Revive manager if it was previously disposed (e.g., after navigation)
      this.disposed = false
      this.entries = new Map<string, BlobEntry>()
      this.totalSize = 0
      this.thumbnailSize = 0
      this.videoSize = 0
    }

    // Smart memory management based on type
    if (type === 'thumbnail') {
      // Thumbnails have separate, smaller limit
      if (this.thumbnailSize + blob.size > this.thumbnailMaxSize) {
        this.cleanupThumbnails()
      }
    } else {
      // Check main memory limit
      if (this.totalSize + blob.size > this.maxSize) {
        this.performSmartCleanup(blob.size)
        if (this.totalSize + blob.size > this.maxSize) {
          throw new MemoryError(
            `Blob memory limit exceeded: ${Math.round(this.totalSize / 1024 / 1024)}MB used`,
            this.totalSize
          )
        }
      }
    }

    const url = URL.createObjectURL(blob)
    const entry: BlobEntry = {
      url,
      size: blob.size,
      createdAt: Date.now(),
      description,
      type,
      priority,
      lastAccessed: Date.now()
    }

    this.entries.set(url, entry)
    this.totalSize += blob.size

    // Track size by type
    if (type === 'thumbnail') {
      this.thumbnailSize += blob.size
    } else if (type === 'video') {
      this.videoSize += blob.size
    }

    // Auto-cache if it's a recording
    if (description?.startsWith('recording-')) {
      const recordingId = description.replace('recording-', '')
      RecordingStorage.setBlobUrl(recordingId, url)
    }

    logger.debug(`Blob URL created: ${description || 'unnamed'}, size: ${blob.size} bytes`)

    // Schedule automatic cleanup for old entries
    this.scheduleCleanup()

    return url
  }

  revoke(url: string, options?: { soft?: boolean }): void {
    const entry = this.entries.get(url)
    if (entry) {
      try {
        if (options?.soft) {
          // Mark as stale but keep URL alive briefly to avoid 404s during rapid UI teardown
          entry.lastAccessed = Date.now()
          // Schedule a real revoke shortly
          setTimeout(() => {
            this.revoke(url)
          }, 300)
          return
        }
        URL.revokeObjectURL(url)
        this.totalSize -= entry.size

        // Update type-specific counters
        if (entry.type === 'thumbnail') {
          this.thumbnailSize -= entry.size
        } else if (entry.type === 'video') {
          this.videoSize -= entry.size
        }

        this.entries.delete(url)
        logger.debug(`Blob URL revoked: ${entry.description || url}`)
      } catch (error) {
        logger.error('Error revoking blob URL:', error)
      }
    }
  }

  getUrlCount(): number {
    return this.entries.size
  }

  getMemoryUsage(): number {
    return this.totalSize
  }

  getMemoryReport(): {
    count: number;
    totalSize: number;
    thumbnailSize: number;
    videoSize: number;
    entries: Array<{
      description?: string;
      size: number;
      age: number;
      type?: string;
      priority?: number;
    }>
  } {
    const now = Date.now()
    return {
      count: this.entries.size,
      totalSize: this.totalSize,
      thumbnailSize: this.thumbnailSize,
      videoSize: this.videoSize,
      entries: Array.from(this.entries.values()).map(entry => ({
        description: entry.description,
        size: entry.size,
        age: now - entry.createdAt,
        type: entry.type,
        priority: entry.priority
      }))
    }
  }

  /**
   * Mark a blob as accessed (updates priority)
   */
  markAccessed(url: string): void {
    const entry = this.entries.get(url)
    if (entry) {
      entry.lastAccessed = Date.now()
      // Boost priority slightly when accessed
      if (entry.priority && entry.priority < 10) {
        entry.priority = Math.min(10, entry.priority + 1)
      }
    }
  }

  /**
   * Clean up all blobs of a specific type
   */
  cleanupByType(type: BlobEntry['type']): void {
    let cleaned = 0
    let freedSize = 0

    const entriesToClean: string[] = []
    this.entries.forEach((entry, url) => {
      if (entry.type === type) {
        freedSize += entry.size
        entriesToClean.push(url)
        cleaned++
      }
    })

    // Revoke after iteration to avoid modifying during iteration
    entriesToClean.forEach(url => this.revoke(url))

    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} ${type} blobs, freed ${Math.round(freedSize / 1024 / 1024)}MB`)
    }
  }

  /**
   * Emergency cleanup for export - frees all non-essential blobs
   */
  cleanupForExport(): void {
    let cleaned = 0
    let freedSize = 0

    const entriesToClean: string[] = []
    this.entries.forEach((entry, url) => {
      // Keep only high-priority videos that might be in use
      if (entry.type === 'video' && (entry.priority || 5) >= 8) {
        return // Keep this one
      }

      // Clean up everything else
      freedSize += entry.size
      entriesToClean.push(url)
      cleaned++
    })

    // Revoke all at once
    entriesToClean.forEach(url => this.revoke(url))

    if (cleaned > 0) {
      logger.info(`[Export Cleanup] Freed ${cleaned} blobs, ${Math.round(freedSize / 1024 / 1024)}MB recovered`)
    }

    // Force GC if available
    if (typeof global !== 'undefined' && (global as any).gc) {
      (global as any).gc()
      logger.info('[Export Cleanup] Forced garbage collection')
    }
  }

  /**
   * Soft cleanup: mark blobs for revocation and revoke after a short delay
   */
  softCleanupByType(type: BlobEntry['type']): void {
    this.entries.forEach((entry, url) => {
      if (entry.type === type) {
        this.revoke(url, { soft: true })
      }
    })
  }

  cleanup(): void {
    const count = this.entries.size
    const size = this.totalSize

    this.entries.forEach(entry => {
      try {
        URL.revokeObjectURL(entry.url)
      } catch (error) {
        logger.error('Error revoking URL during cleanup:', error)
      }
    })

    this.entries.clear()
    this.totalSize = 0

    if (count > 0) {
      logger.info(`Cleaned up ${count} blob URLs, freed ${Math.round(size / 1024 / 1024)}MB`)
    }
  }

  private performSmartCleanup(requiredSpace: number): void {
    // Smart cleanup based on priority and type
    const sortedEntries = Array.from(this.entries.values())
      .sort((a, b) => {
        // First sort by type (thumbnails first)
        if (a.type !== b.type) {
          const typeOrder = { thumbnail: 0, other: 1, export: 2, video: 3 }
          return (typeOrder[a.type || 'other'] || 1) - (typeOrder[b.type || 'other'] || 1)
        }
        // Then by priority (lower priority first)
        if (a.priority !== b.priority) {
          return (a.priority || 5) - (b.priority || 5)
        }
        // Finally by last accessed time
        return (a.lastAccessed || a.createdAt) - (b.lastAccessed || b.createdAt)
      })

    const targetSize = Math.max(this.maxSize * 0.7, this.totalSize - requiredSpace)
    let freedSize = 0

    for (const entry of sortedEntries) {
      if (this.totalSize <= targetSize) break

      // Don't remove high-priority active videos
      if (entry.type === 'video' && (entry.priority || 5) >= 8) {
        continue
      }

      this.revoke(entry.url)
      freedSize += entry.size
    }

    if (freedSize > 0) {
      logger.info(`Smart cleanup: freed ${Math.round(freedSize / 1024 / 1024)}MB`)
    }
  }

  private cleanupThumbnails(): void {
    // Clean up old thumbnails
    const thumbnails = Array.from(this.entries.values())
      .filter(e => e.type === 'thumbnail')
      .sort((a, b) => (a.lastAccessed || a.createdAt) - (b.lastAccessed || b.createdAt))

    const targetSize = this.thumbnailMaxSize * 0.5
    let currentThumbnailSize = this.thumbnailSize

    for (const entry of thumbnails) {
      if (currentThumbnailSize <= targetSize) break

      this.revoke(entry.url)
      currentThumbnailSize -= entry.size
    }
  }


  private scheduleCleanup(): void {
    if (this.cleanupTimer) return

    // Clean up entries older than 30 minutes (was 5 minutes - too aggressive for video editing)
    this.cleanupTimer = setTimeout(() => {
      const now = Date.now()
      const maxAge = 30 * 60 * 1000 // 30 minutes

      let cleaned = 0
      this.entries.forEach(entry => {
        // Don't clean up recording videos that are likely in use
        if (entry.description?.startsWith('recording-')) {
          // Check if this recording is still in storage (being used)
          const recordingId = entry.description.replace('recording-', '')
          const cachedUrl = RecordingStorage.getBlobUrl(recordingId)
          if (cachedUrl === entry.url) {
            // Still in use, skip cleanup
            return
          }
        }

        if (now - entry.createdAt > maxAge) {
          this.revoke(entry.url)
          cleaned++
        }
      })

      if (cleaned > 0) {
        logger.debug(`Auto-cleanup: removed ${cleaned} old blob URLs`)
      }

      this.cleanupTimer = null

      // Schedule next cleanup if there are still entries
      if (this.entries.size > 0) {
        this.scheduleCleanup()
      }
    }, 60000) // Check every minute
  }

  /**
   * Load a video file and return a video-stream:// URL
   * Handles caching and error handling automatically
   */
  async loadVideo(recordingId: string, filePath?: string, folderPath?: string): Promise<string | null> {
    // Check cache first
    const cached = RecordingStorage.getBlobUrl(recordingId)
    if (cached && this.entries.has(cached)) {
      logger.debug(`Using cached video for ${recordingId}`)
      this.markAccessed(cached)
      return cached
    } else if (cached) {
      // Clear invalid cached URL
      RecordingStorage.clearBlobUrl(recordingId)
    }

    // Check if already loading
    const existingPromise = this.loadingPromises.get(recordingId)
    if (existingPromise) {
      logger.debug(`Already loading ${recordingId}, waiting...`)
      return existingPromise
    }

    // Start loading
    const loadPromise = this._loadVideoInternal(recordingId, filePath, folderPath)
    this.loadingPromises.set(recordingId, loadPromise)

    try {
      const result = await loadPromise
      return result
    } finally {
      this.loadingPromises.delete(recordingId)
    }
  }


  private async _loadVideoInternal(recordingId: string, filePath?: string, folderPath?: string): Promise<string | null> {
    if (!filePath) {
      logger.error(`No file path for ${recordingId}`)
      return null
    }

    // Handle data URIs - return as-is without calling IPC
    // This prevents crash when plugin-generated snapshots (data URIs) are treated as file paths
    if (filePath.startsWith('data:')) {
      logger.debug(`Using data URI for ${recordingId}`)
      RecordingStorage.setBlobUrl(recordingId, filePath)
      return filePath
    }

    try {
      // Use IPC to resolve path and get video URL from main process
      if (!window.electronAPI?.resolveRecordingPath) {
        logger.error('Electron API not available for path resolution')
        return null
      }

      const videoUrl = await window.electronAPI.resolveRecordingPath(filePath, folderPath)
      logger.debug(`Video URL resolved: ${recordingId} -> ${videoUrl}`)

      // Cache the URL for future use
      RecordingStorage.setBlobUrl(recordingId, videoUrl)

      logger.info(`Video ready: ${recordingId}`)
      return videoUrl
    } catch (error) {
      logger.error(`Error resolving video path ${recordingId}:`, error)
      return null
    }
  }

  /**
   * Unified video loading - handles single or multiple videos
   * @param recordings - Single recording or array of recordings
   */
  async loadVideos(recording: { id: string; filePath?: string; folderPath?: string; metadata?: any; metadataChunks?: any }): Promise<string | null>
  async loadVideos(recordings: Array<{ id: string; filePath?: string; folderPath?: string; metadata?: any; metadataChunks?: any }>): Promise<void>
  async loadVideos(recordings: { id: string; filePath?: string; folderPath?: string; metadata?: any; metadataChunks?: any } | Array<{ id: string; filePath?: string; folderPath?: string; metadata?: any; metadataChunks?: any }>): Promise<string | null | void> {
    const recordingArray = Array.isArray(recordings) ? recordings : [recordings]
    const isSingle = !Array.isArray(recordings)

    const results = await Promise.all(
      recordingArray.map(async rec => {
        // Store metadata if provided
        if (rec.metadata) {
          RecordingStorage.setMetadata(rec.id, rec.metadata)
        }

        // Load video
        if (rec.filePath) {
          try {
            return await this.loadVideo(rec.id, rec.filePath, rec.folderPath)
          } catch (err) {
            logger.error(`Failed to load ${rec.id}:`, err)
            return null
          }
        }
        return null
      })
    )

    // For single recording, return the URL directly
    return isSingle ? results[0] : undefined
  }

  /**
   * Store metadata for a recording
   */
  storeMetadata(recordingId: string, metadata: any): void {
    RecordingStorage.setMetadata(recordingId, metadata)
  }

  /**
   * Get metadata for a recording
   */
  getMetadata(recordingId: string): any {
    return RecordingStorage.getMetadata(recordingId)
  }

  dispose(): void {
    if (!this.disposed) {
      if (this.cleanupTimer) {
        clearTimeout(this.cleanupTimer)
        this.cleanupTimer = null
      }
      this.cleanup()
      this.disposed = true
      this.loadingPromises.clear()
      logger.debug('BlobURLManager disposed')
    }
  }
}

// Global instance for the application
export const globalBlobManager = new BlobURLManager()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    globalBlobManager.dispose()
  })
}
