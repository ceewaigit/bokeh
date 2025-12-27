// Cache for video durations to prevent repeated metadata loads
const durationCache = new Map<string, Promise<number>>()

// Global semaphore to limit concurrent video decoder operations
// This prevents VTDecoderXPCService from accumulating multiple decoder instances
const MAX_CONCURRENT_VIDEO_OPS = 1 // Only allow 1 at a time to prevent memory spike
let activeVideoOps = 0
const pendingVideoOps: Array<() => void> = []

async function acquireVideoSlot(): Promise<void> {
  if (activeVideoOps < MAX_CONCURRENT_VIDEO_OPS) {
    activeVideoOps++
    return
  }
  // Wait for a slot to become available
  return new Promise((resolve) => {
    pendingVideoOps.push(() => {
      activeVideoOps++
      resolve()
    })
  })
}

function releaseVideoSlot(): void {
  activeVideoOps--
  // Process next pending operation if any
  const next = pendingVideoOps.shift()
  if (next) {
    // Small delay to allow decoder to release memory
    setTimeout(next, 50)
  }
}

/** Clear cached video durations - call when leaving workspace to free memory */
export function clearDurationCache(): void {
  durationCache.clear()
}

export async function getVideoDuration(videoUrl: string): Promise<number> {
  // Check cache first - deduplicate concurrent and repeated requests
  const cached = durationCache.get(videoUrl)
  if (cached) {
    return cached
  }

  // Create promise and cache it immediately to deduplicate concurrent calls
  const promise = loadVideoDurationInternal(videoUrl)
  durationCache.set(videoUrl, promise)
  return promise
}

async function loadVideoDurationInternal(videoUrl: string): Promise<number> {
  // Acquire semaphore slot to limit concurrent decoder instances
  await acquireVideoSlot()

  try {
    return await new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      let timeoutId: number | null = null
      let cleanedUp = false

      const cleanup = () => {
        if (cleanedUp) return
        cleanedUp = true
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        video.removeEventListener('loadedmetadata', onMetadata)
        video.removeEventListener('error', onError)
        video.src = ''
        video.load() // Force decoder release
        releaseVideoSlot() // Release semaphore slot
      }

      const onMetadata = () => {
        const duration = video.duration
        cleanup()
        resolve(isNaN(duration) || !isFinite(duration) ? 0 : duration * 1000) // Return in milliseconds
      }

      const onError = () => {
        cleanup()
        resolve(0) // Return 0 on error instead of rejecting
      }

      video.addEventListener('loadedmetadata', onMetadata)
      video.addEventListener('error', onError)

      // Set a timeout to prevent hanging
      timeoutId = window.setTimeout(() => {
        cleanup()
        resolve(0)
      }, 5000)

      video.src = videoUrl
    })
  } catch (error) {
    releaseVideoSlot() // Ensure slot is released on error
    return 0
  }
}

/**
 * Full video metadata including dimensions
 * Used for imports and recording validation
 */
export interface VideoMetadata {
  duration: number      // in milliseconds
  width: number
  height: number
  frameRate: number     // default 30 if not detectable
  hasAudio: boolean
}

/**
 * Get full video metadata including dimensions
 * @param videoUrl - URL to the video (can be video-stream:// protocol or blob URL)
 * @returns VideoMetadata object with all properties
 */
export async function getVideoMetadata(videoUrl: string): Promise<VideoMetadata> {
  // Acquire semaphore slot to limit concurrent decoder instances
  await acquireVideoSlot()

  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      let timeoutId: number | null = null
      let cleanedUp = false

      const cleanup = () => {
        if (cleanedUp) return
        cleanedUp = true
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        video.removeEventListener('loadedmetadata', onMetadata)
        video.removeEventListener('error', onError)
        video.src = ''
        video.load() // Force decoder release
        releaseVideoSlot() // Release semaphore slot
      }

      const onMetadata = () => {
        const duration = video.duration * 1000 // Convert to ms
        const width = video.videoWidth
        const height = video.videoHeight
        // Estimate frame rate (default to 30 if can't detect)
        const frameRate = 30
        // Check if video has audio tracks (assume has audio if can't detect)
        const hasAudio = (video as any).audioTracks?.length > 0 || true

        cleanup()
        resolve({ duration, width, height, frameRate, hasAudio })
      }

      const onError = () => {
        cleanup()
        reject(new Error('Failed to load video metadata'))
      }

      video.addEventListener('loadedmetadata', onMetadata)
      video.addEventListener('error', onError)

      // Set a timeout to prevent hanging
      timeoutId = window.setTimeout(() => {
        cleanup()
        reject(new Error('Video metadata load timeout'))
      }, 10000)

      video.src = videoUrl
    })
  } catch (error) {
    releaseVideoSlot() // Ensure slot is released on error
    throw error
  }
}

/**
 * Get video metadata for a file path (uses video-stream:// protocol)
 * Convenience wrapper for Electron file paths
 */
export async function getVideoMetadataFromPath(filePath: string): Promise<VideoMetadata> {
  const videoUrl = `video-stream://local/${encodeURIComponent(filePath)}`
  return getVideoMetadata(videoUrl)
}
