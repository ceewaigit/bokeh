import { logger } from '@/shared/utils/logger'
import { current, isDraft } from 'immer'

// In-memory metadata cache with LRU eviction
// PERF: Limit to 20 recordings to cover typical timeline usage
// Each metadata object can be 1-10MB (mouse/keyboard events), but 20 is safe for modern RAM
const MAX_METADATA_CACHE_SIZE = 20

let metadataCacheOrder: string[] = []
const metadataCache = new Map<string, any>()

const toCacheSafeValue = (metadata: any): any => {
  if (!metadata || typeof metadata !== 'object') return metadata
  const resolved = isDraft(metadata) ? current(metadata) : metadata
  if (!resolved || typeof resolved !== 'object') return resolved
  if (Object.isExtensible(resolved)) return resolved
  if (Array.isArray(resolved)) return [...resolved]
  return { ...(resolved as Record<string, unknown>) }
}

export const recordingMetadataCache = {
  set(recordingId: string, metadata: any): void {
    try {
      const safeMetadata = toCacheSafeValue(metadata)

      // LRU management
      if (metadataCache.has(recordingId)) {
        metadataCacheOrder = metadataCacheOrder.filter(id => id !== recordingId)
      } else if (metadataCacheOrder.length >= MAX_METADATA_CACHE_SIZE) {
        const oldest = metadataCacheOrder.shift()
        if (oldest) {
          metadataCache.delete(oldest)
          logger.debug(`Evicted metadata for recording ${oldest} (LRU)`)
        }
      }
      metadataCacheOrder.push(recordingId)
      metadataCache.set(recordingId, safeMetadata)
      logger.debug(`Cached metadata for recording ${recordingId} (${metadataCacheOrder.length}/${MAX_METADATA_CACHE_SIZE})`)
    } catch (error) {
      logger.error(`Failed to cache metadata for recording ${recordingId}:`, error)
    }
  },

  get(recordingId: string): any | null {
    try {
      const metadata = metadataCache.get(recordingId)
      if (metadata) {
        metadataCacheOrder = metadataCacheOrder.filter(id => id !== recordingId)
        metadataCacheOrder.push(recordingId)
      }
      return metadata || null
    } catch (error) {
      logger.error(`Failed to get cached metadata for recording ${recordingId}:`, error)
      return null
    }
  },

  clear(): void {
    const size = metadataCache.size
    metadataCache.clear()
    metadataCacheOrder = []
    logger.info(`Cleared ${size} items from metadata cache`)
  },

  clearForRecording(recordingId: string): void {
    if (metadataCache.has(recordingId)) {
      metadataCache.delete(recordingId)
      metadataCacheOrder = metadataCacheOrder.filter(id => id !== recordingId)
      logger.debug(`Cleared metadata for recording ${recordingId}`)
    }
  }
}

