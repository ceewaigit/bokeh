/**
 * Full-resolution frame capture utility for extracting video frames as images.
 * Used for freeze frames (cursor return) and image clip generation.
 *
 * Based on ThumbnailGenerator but captures at full resolution.
 */

import { logger } from '@/shared/utils/logger'

export interface FrameCaptureOptions {
  /** Video file path (local filesystem path) */
  videoPath: string
  /** Timestamp in seconds to capture the frame */
  timestampSeconds: number
  /** Output format (default: 'jpeg') */
  format?: 'jpeg' | 'png'
  /** Quality for JPEG (0-1, default: 0.95) */
  quality?: number
}

export interface FrameCaptureResult {
  success: boolean
  /** Data URL of the captured frame (always returned on success) */
  dataUrl?: string
  /** Width of the captured frame */
  width: number
  /** Height of the captured frame */
  height: number
  /** Error message if capture failed */
  error?: string
}

// Pool item interface
interface PooledVideo {
  element: HTMLVideoElement
  inUse: boolean
  id: number
}

/**
 * Frame capture singleton with pooled video elements
 */
export class FrameCapture {
  // Video element pool - 2 concurrent decoders
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
      video.pause()

      this.videoPool.push({
        element: video,
        inUse: false,
        id: i
      })
    }
    this.poolInitialized = true
    logger.debug(`Initialized frame capture pool with ${this.POOL_SIZE} elements`)
  }

  /**
   * Acquire a video element from the pool
   */
  private static async acquireVideo(): Promise<PooledVideo> {
    this.initPool()

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

    // Process next pending request
    if (this.pendingRequests.length > 0) {
      const nextRequest = this.pendingRequests.shift()
      if (nextRequest) {
        setTimeout(nextRequest, 10)
      }
    }
  }

  /**
   * Capture a frame from a video at the specified timestamp.
   * Returns a data URL of the captured frame at full resolution.
   */
  static async captureFrame(options: FrameCaptureOptions): Promise<FrameCaptureResult> {
    const {
      videoPath,
      timestampSeconds,
      format = 'jpeg',
      quality = 0.95
    } = options

    // Safety check
    if (!videoPath) {
      return {
        success: false,
        width: 0,
        height: 0,
        error: 'No video path provided'
      }
    }

    // Acquire video element from pool
    const pooledVideo = await this.acquireVideo()
    const video = pooledVideo.element

    return new Promise(async (resolve) => {
      let resolved = false

      const finish = (result: FrameCaptureResult) => {
        if (resolved) return
        resolved = true
        this.releaseVideo(pooledVideo)
        resolve(result)
      }

      const handleError = (error: string) => {
        finish({
          success: false,
          width: 0,
          height: 0,
          error
        })
      }

      // Event handlers
      const onMetadata = () => {
        // Clamp timestamp to valid range
        const duration = video.duration
        let seekTime = Math.max(0, Math.min(timestampSeconds, duration))

        // Avoid seeking to exactly the end (can cause issues)
        if (seekTime >= duration) {
          seekTime = Math.max(0, duration - 0.001)
        }

        video.currentTime = seekTime
      }

      const onSeeked = () => {
        try {
          const sourceWidth = video.videoWidth
          const sourceHeight = video.videoHeight

          if (!sourceWidth || !sourceHeight) {
            handleError('Could not determine video dimensions')
            return
          }

          // Create canvas at full resolution
          const canvas = document.createElement('canvas')
          canvas.width = sourceWidth
          canvas.height = sourceHeight

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            handleError('Could not create canvas context')
            return
          }

          // Draw frame at full resolution
          ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight)

          // Convert to data URL
          const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
          const dataUrl = canvas.toDataURL(mimeType, quality)

          // Release canvas memory
          canvas.width = 0
          canvas.height = 0

          finish({
            success: true,
            dataUrl,
            width: sourceWidth,
            height: sourceHeight
          })
        } catch (error) {
          handleError(`Frame capture failed: ${error}`)
        }
      }

      const onError = () => {
        handleError('Video load error')
      }

      // Get video URL from Electron API
      try {
        if (!window.electronAPI?.getVideoUrl) {
          handleError('Electron API not available')
          return
        }

        const videoUrl = await window.electronAPI.getVideoUrl(videoPath)
        if (!videoUrl) {
          handleError('Could not get video URL')
          return
        }

        // Clear any existing src first
        video.removeAttribute('src')
        video.load()

        // Add listeners BEFORE setting src
        video.addEventListener('loadedmetadata', onMetadata, { once: true })
        video.addEventListener('seeked', onSeeked, { once: true })
        video.addEventListener('error', onError, { once: true })

        // Set src and trigger load
        video.src = videoUrl
        video.load()
      } catch (error) {
        handleError(`Failed to load video: ${error}`)
        return
      }

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!resolved) {
          video.removeEventListener('loadedmetadata', onMetadata)
          video.removeEventListener('seeked', onSeeked)
          video.removeEventListener('error', onError)
          handleError('Frame capture timeout')
        }
      }, 10000)
    })
  }

  /**
   * Capture the last frame of a video clip.
   * Convenience method for cursor return freeze frames.
   *
   * @param videoPath - Path to the video file
   * @param sourceOutMs - The sourceOut time in milliseconds (end of clip in source time)
   * @param format - Output format (default: 'jpeg')
   * @param quality - JPEG quality (default: 0.95)
   */
  static async captureLastFrame(
    videoPath: string,
    sourceOutMs: number,
    format: 'jpeg' | 'png' = 'jpeg',
    quality: number = 0.95
  ): Promise<FrameCaptureResult> {
    // Convert ms to seconds, subtract a tiny amount to avoid end-of-file issues
    const timestampSeconds = Math.max(0, (sourceOutMs / 1000) - 0.01)

    return this.captureFrame({
      videoPath,
      timestampSeconds,
      format,
      quality
    })
  }
}

/**
 * Convenience function to capture a video frame.
 */
export async function captureVideoFrame(options: FrameCaptureOptions): Promise<FrameCaptureResult> {
  return FrameCapture.captureFrame(options)
}

/**
 * Convenience function to capture the last frame of a clip.
 */
export async function captureLastFrame(
  videoPath: string,
  sourceOutMs: number,
  format?: 'jpeg' | 'png',
  quality?: number
): Promise<FrameCaptureResult> {
  return FrameCapture.captureLastFrame(videoPath, sourceOutMs, format, quality)
}
