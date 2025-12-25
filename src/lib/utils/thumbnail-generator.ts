/**
 * Lightweight thumbnail generator that efficiently extracts frames without loading full videos
 * Uses a pool of video elements to prevent memory churn
 */

import { logger } from '@/lib/utils/logger'

interface ThumbnailOptions {
  width?: number
  height?: number
  quality?: number
  timestamp?: number // Percentage (0-1) or seconds
}

// Pool item interface
interface PooledVideo {
  element: HTMLVideoElement
  inUse: boolean
  id: number
}

export class ThumbnailGenerator {
  private static cache = new Map<string, string>()
  private static generating = new Set<string>()
  // Keep thumbnails cached for fast navigation - they're small (~25KB each)
  // PERF: Reduced from 50 to 20 (~500KB max) - matches typical project size
  private static readonly MAX_CACHE_SIZE = 20

  // Video element pool - 2 concurrent decoders (reduced from 4 to save memory)
  private static readonly POOL_SIZE = 2
  private static videoPool: PooledVideo[] = []
  private static poolInitialized = false
  private static pendingRequests: Array<() => void> = []

  /**
   * Initialize the video pool
   */
  private static initPool() {
    if (this.poolInitialized) return

    for (let i = 0; i < this.POOL_SIZE; i++) {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.crossOrigin = 'anonymous'
      video.muted = true
      // Important: keep it paused
      video.pause()

      this.videoPool.push({
        element: video,
        inUse: false,
        id: i
      })
    }
    this.poolInitialized = true
    logger.debug(`Initialized thumbnail generator pool with ${this.POOL_SIZE} elements`)
  }

  /**
   * Acquire a video element from the pool
   */
  private static async acquireVideo(): Promise<PooledVideo> {
    this.initPool()

    // Minimal cooldown only when pool is exhausted
    // Skip cooldown when slots are available for maximum throughput

    // Try to find a free element
    const freeVideo = this.videoPool.find(v => !v.inUse)
    if (freeVideo) {
      freeVideo.inUse = true
      return freeVideo
    }

    // If no free element, wait for one
    return new Promise<PooledVideo>((resolve) => {
      this.pendingRequests.push(() => {
        const nextFree = this.videoPool.find(v => !v.inUse)
        if (nextFree) {
          nextFree.inUse = true
          resolve(nextFree)
        }
      })
    })
  }

  /**
   * Release a video element back to the pool
   */
  private static releaseVideo(video: PooledVideo) {
    video.inUse = false

    // Clean up the element state but keep it alive
    video.element.pause()
    video.element.removeAttribute('src')
    video.element.load() // Force unload of media resource

    // Process next pending request immediately
    if (this.pendingRequests.length > 0) {
      const nextRequest = this.pendingRequests.shift()
      if (nextRequest) {
        // Minimal delay - just yield to event loop
        setTimeout(nextRequest, 10)
      }
    }
  }

  /**
   * Generate thumbnail from video file without loading entire video into memory
   * Uses streaming approach with minimal memory footprint
   */
  static async generateThumbnail(
    videoPath: string,
    cacheKey: string,
    options: ThumbnailOptions = {}
  ): Promise<string | null> {
    const {
      width,
      height,
      quality = 0.6,
      timestamp = 0.1 // 10% into video by default
    } = options

    // Safety check: Don't attempt to generate thumbnails for empty paths (e.g. generated clips)
    if (!videoPath) {
      return null
    }

    // Check cache first
    if (this.cache.has(cacheKey)) {
      // Refresh LRU order
      const data = this.cache.get(cacheKey)!
      this.cache.delete(cacheKey)
      this.cache.set(cacheKey, data)
      return data
    }

    // Prevent duplicate generation
    if (this.generating.has(cacheKey)) {
      // Wait for existing generation with timeout to prevent infinite polling
      // Added max retries to prevent interval running forever
      return new Promise((resolve) => {
        let retryCount = 0
        const MAX_RETRIES = 50 // 5 seconds max wait (50 * 100ms)
        const checkInterval = setInterval(() => {
          retryCount++
          if (!this.generating.has(cacheKey)) {
            clearInterval(checkInterval)
            resolve(this.cache.get(cacheKey) || null)
          } else if (retryCount >= MAX_RETRIES) {
            // Timeout after max retries to prevent infinite polling
            clearInterval(checkInterval)
            logger.warn(`Thumbnail generation timeout for ${cacheKey}, giving up after ${MAX_RETRIES * 100}ms`)
            resolve(null)
          }
        }, 100)
      })
    }

    this.generating.add(cacheKey)

    try {
      // Direct thumbnail generation using pooled video element
      const thumbnail = await this.extractVideoFrame(
        videoPath,
        { width, height, quality, timestamp }
      )

      if (thumbnail) {
        // Enforce cache limit
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
          // Remove oldest entry (first in Map)
          const firstKey = this.cache.keys().next().value
          if (firstKey) this.cache.delete(firstKey)
        }
        this.cache.set(cacheKey, thumbnail)
      }

      return thumbnail
    } catch (error) {
      logger.error('Thumbnail generation failed:', error)
      return null
    } finally {
      this.generating.delete(cacheKey)
    }
  }

  /**
   * Extract video frame efficiently using pooled video element
   */
  private static async extractVideoFrame(
    videoPath: string,
    options: ThumbnailOptions
  ): Promise<string | null> {
    const { width, height, quality = 0.6, timestamp = 0.1 } = options

    // Acquire video element from pool
    const pooledVideo = await this.acquireVideo()
    const video = pooledVideo.element

    return new Promise(async (resolve) => {
      let resolved = false

      const finish = (result: string | null) => {
        if (resolved) return
        resolved = true
        this.releaseVideo(pooledVideo)
        resolve(result)
      }

      const handleError = () => {
        finish(null)
      }

      // One-time event listeners - MUST be added before loading
      const onMetadata = () => {
        const seekTime = this.resolveSeekTime(video.duration, timestamp)
        video.currentTime = seekTime
      }

      const onSeeked = () => {
        try {
          const sourceWidth = video.videoWidth
          const sourceHeight = video.videoHeight
          if (!sourceWidth || !sourceHeight) {
            handleError()
            return
          }

          const { targetWidth, targetHeight } = this.resolveTargetDimensions(
            sourceWidth,
            sourceHeight,
            width,
            height
          )

          const canvas = document.createElement('canvas')
          canvas.width = targetWidth
          canvas.height = targetHeight

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            handleError()
            return
          }

          ctx.drawImage(video, 0, 0, targetWidth, targetHeight)
          const dataUrl = canvas.toDataURL('image/jpeg', quality)

          // Release canvas memory immediately
          canvas.width = 0
          canvas.height = 0

          finish(dataUrl)
        } catch (error) {
          handleError()
        }
      }

      const onError = () => {
        handleError()
      }

      // Get video URL from Electron API
      try {
        if (!window.electronAPI?.getVideoUrl) {
          handleError()
          return
        }

        const videoUrl = await window.electronAPI.getVideoUrl(videoPath)
        if (!videoUrl) {
          handleError()
          return
        }

        // CRITICAL: Clear any existing src first
        video.removeAttribute('src')
        video.load() // Force decoder release

        // Add listeners BEFORE setting src to avoid race condition
        video.addEventListener('loadedmetadata', onMetadata, { once: true })
        video.addEventListener('seeked', onSeeked, { once: true })
        video.addEventListener('error', onError, { once: true })

        // Now set src and trigger load
        video.src = videoUrl
        video.load()
      } catch (error) {
        handleError()
        return
      }

      // Timeout after 5 seconds to prevent hanging the pool
      setTimeout(() => {
        if (!resolved) {
          // Remove listeners to prevent late firing
          video.removeEventListener('loadedmetadata', onMetadata)
          video.removeEventListener('seeked', onSeeked)
          video.removeEventListener('error', onError)
          handleError()
        }
      }, 5000)
    })
  }

  private static resolveSeekTime(duration: number, timestamp: number): number {
    if (!Number.isFinite(duration) || duration <= 0) {
      return 0
    }

    if (!Number.isFinite(timestamp)) {
      return Math.min(duration * 0.1, duration - 0.001)
    }

    let seekTime = timestamp <= 1
      ? duration * Math.max(0, Math.min(1, timestamp))
      : Math.max(0, Math.min(duration, timestamp))

    if (seekTime >= duration) {
      seekTime = Math.max(0, duration - 0.001)
    }

    return seekTime
  }

  private static resolveTargetDimensions(
    sourceWidth: number,
    sourceHeight: number,
    requestedWidth?: number,
    requestedHeight?: number
  ) {
    const safeWidth = requestedWidth && requestedWidth > 0 ? requestedWidth : undefined
    const safeHeight = requestedHeight && requestedHeight > 0 ? requestedHeight : undefined

    let targetWidth = sourceWidth
    let targetHeight = sourceHeight

    if (safeWidth && safeHeight) {
      const scale = Math.min(safeWidth / sourceWidth, safeHeight / sourceHeight, 1)
      targetWidth = Math.max(1, Math.round(sourceWidth * scale))
      targetHeight = Math.max(1, Math.round(sourceHeight * scale))
    } else if (safeWidth) {
      const scale = Math.min(safeWidth / sourceWidth, 1)
      targetWidth = Math.max(1, Math.round(sourceWidth * scale))
      targetHeight = Math.max(1, Math.round(sourceHeight * scale))
    } else if (safeHeight) {
      const scale = Math.min(safeHeight / sourceHeight, 1)
      targetWidth = Math.max(1, Math.round(sourceWidth * scale))
      targetHeight = Math.max(1, Math.round(sourceHeight * scale))
    }

    return { targetWidth, targetHeight }
  }

  /**
   * Clear thumbnail cache for memory management
   */
  static clearCache(pattern?: string): void {
    if (!pattern) {
      const size = this.cache.size
      this.cache.clear()
      logger.info(`Cleared ${size} thumbnails from cache`)
      return
    }

    // Clear specific pattern
    let cleared = 0
    const keysToDelete: string[] = []
    this.cache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key)
        cleared++
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))

    if (cleared > 0) {
      logger.info(`Cleared ${cleared} thumbnails matching pattern: ${pattern}`)
    }
  }

  /**
   * Clear all thumbnail cache
   * Used when closing a project to free memory
   */
  static clearAllCache(): void {
    const size = this.cache.size
    this.cache.clear()
    this.generating.clear()
    if (size > 0) {
      logger.info(`Cleared all ${size} thumbnails from cache`)
    }
  }

  /**
   * Clear cached thumbnails for a specific recording
   * @param recordingId - The recording ID to clear thumbnails for
   */
  static clearCacheForRecording(recordingId: string): void {
    this.clearCache(recordingId)
  }

  /**
   * Read from cache without generating (for fast UI hydration).
   */
  static getCachedThumbnail(cacheKey: string): string | null {
    const data = this.cache.get(cacheKey) ?? null
    if (!data) return null

    // Refresh LRU order
    this.cache.delete(cacheKey)
    this.cache.set(cacheKey, data)
    return data
  }

  /**
   * Get cache statistics
   */
  static getCacheStats() {
    return {
      count: this.cache.size,
      generating: this.generating.size,
      poolSize: this.videoPool.length,
      poolInUse: this.videoPool.filter(v => v.inUse).length,
      // Estimate memory usage (rough calculation)
      estimatedMemory: this.cache.size * 50 * 1024 // ~50KB per thumbnail
    }
  }

  /**
   * Preload thumbnails for a list of videos
   */
  static async preloadThumbnails(
    videos: Array<{ path: string; key: string }>,
    options?: ThumbnailOptions
  ): Promise<void> {
    // Process in batches to avoid overwhelming the system
    const batchSize = 3
    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize)
      await Promise.all(
        batch.map(video =>
          this.generateThumbnail(video.path, video.key, options)
            .catch(err => {
              logger.error(`Failed to preload thumbnail for ${video.key}:`, err)
              return null
            })
        )
      )
    }
  }
}
