import { logger } from '@/shared/utils/logger'

const BLOB_PREFIX = 'recording-blob-'

// In-memory blob URL cache with LRU eviction to prevent memory leaks
const MAX_BLOB_CACHE_SIZE = 50
let blobUrlCacheOrder: string[] = []
const blobUrlCache = new Map<string, string>()

export const recordingBlobUrlCache = {
  set(recordingId: string, url: string): void {
    try {
      if (blobUrlCache.has(recordingId)) {
        blobUrlCacheOrder = blobUrlCacheOrder.filter(id => id !== recordingId)
      } else if (blobUrlCacheOrder.length >= MAX_BLOB_CACHE_SIZE) {
        const oldest = blobUrlCacheOrder.shift()
        if (oldest) {
          blobUrlCache.delete(oldest)
          logger.debug(`Evicted blob URL for recording ${oldest} (LRU)`)
        }
      }
      blobUrlCacheOrder.push(recordingId)
      blobUrlCache.set(recordingId, url)
      localStorage.setItem(`${BLOB_PREFIX}${recordingId}`, url)
      logger.debug(`Stored blob URL for recording ${recordingId}`)
    } catch (error) {
      logger.error(`Failed to store blob URL for recording ${recordingId}:`, error)
    }
  },

  get(recordingId: string): string | null {
    if (blobUrlCache.has(recordingId)) {
      blobUrlCacheOrder = blobUrlCacheOrder.filter(id => id !== recordingId)
      blobUrlCacheOrder.push(recordingId)
      return blobUrlCache.get(recordingId)!
    }
    const url = localStorage.getItem(`${BLOB_PREFIX}${recordingId}`)
    if (url) {
      if (blobUrlCacheOrder.length >= MAX_BLOB_CACHE_SIZE) {
        const oldest = blobUrlCacheOrder.shift()
        if (oldest) blobUrlCache.delete(oldest)
      }
      blobUrlCacheOrder.push(recordingId)
      blobUrlCache.set(recordingId, url)
    }
    return url
  },

  clear(recordingId: string): void {
    blobUrlCache.delete(recordingId)
    blobUrlCacheOrder = blobUrlCacheOrder.filter(id => id !== recordingId)
    localStorage.removeItem(`${BLOB_PREFIX}${recordingId}`)
    logger.debug(`Cleared blob URL for recording ${recordingId}`)
  },

  clearAll(): void {
    blobUrlCache.clear()
    blobUrlCacheOrder = []
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(BLOB_PREFIX)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    if (keysToRemove.length > 0) {
      logger.info(`Cleared ${keysToRemove.length} cached blob URLs on startup`)
    }
  }
}

