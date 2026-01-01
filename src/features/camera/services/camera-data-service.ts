/**
 * CameraDataService
 * 
 * Centralized cache management for camera and cursor-related data.
 * Consolidates orphaned caches from:
 * - cursor-calculator.ts (smoothingCache)
 * 
 * Design: Static methods with manual invalidation.
 * Call invalidateCache() when switching projects/recordings.
 */

type SmoothedPosition = { x: number; y: number }


const MAX_SMOOTHING_CACHE_SIZE = 300

/**
 * CameraDataService - Centralized cache for camera/cursor data.
 */
export class CameraDataService {


    // Cursor smoothing cache (from cursor-calculator.ts)
    private static smoothingCache = new Map<string, SmoothedPosition>()

    /**
     * Invalidate all camera-related caches.
     * Call when switching projects or recordings.
     */
    static invalidateCache(): void {

        this.smoothingCache.clear()
    }



    // ==========================================================================
    // CURSOR SMOOTHING CACHE
    // ==========================================================================

    static getSmoothingCacheKey(
        timestamp: number,
        smoothness: number,
        speed: number,
        glide: number,
        jumpThreshold: number
    ): string {
        return `${timestamp.toFixed(2)}-${smoothness.toFixed(2)}-${speed.toFixed(2)}-${glide.toFixed(2)}-${jumpThreshold.toFixed(2)}`
    }

    static getSmoothingPosition(key: string): SmoothedPosition | undefined {
        return this.smoothingCache.get(key)
    }

    static setSmoothingPosition(key: string, position: SmoothedPosition): void {
        // LRU eviction
        if (this.smoothingCache.size >= MAX_SMOOTHING_CACHE_SIZE) {
            const firstKey = this.smoothingCache.keys().next().value
            if (firstKey) this.smoothingCache.delete(firstKey)
        }
        this.smoothingCache.set(key, position)
    }
}
