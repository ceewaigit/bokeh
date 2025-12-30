/**
 * CameraDataService
 * 
 * Centralized cache management for camera and cursor-related data.
 * Consolidates orphaned caches from:
 * - camera/smoothing.ts (motionClusterCache)
 * - cursor-calculator.ts (smoothingCache)
 * 
 * Design: Static methods with manual invalidation.
 * Call invalidateCache() when switching projects/recordings.
 */

import type { MouseEvent } from '@/types/project'

export interface Cluster {
    startTime: number
    endTime: number
    centroidX: number
    centroidY: number
}

type MotionClusterCacheEntry = {
    clusters: Cluster[]
}

type SmoothedPosition = { x: number; y: number }

const MAX_MOTION_CLUSTER_ENTRIES = 50
const MAX_SMOOTHING_CACHE_SIZE = 300

/**
 * CameraDataService - Centralized cache for camera/cursor data.
 */
export class CameraDataService {
    // Motion cluster cache (from camera/smoothing.ts)
    private static motionClusterCache = new Map<string, MotionClusterCacheEntry>()

    // Cursor smoothing cache (from cursor-calculator.ts)
    private static smoothingCache = new Map<string, SmoothedPosition>()

    /**
     * Invalidate all camera-related caches.
     * Call when switching projects or recordings.
     */
    static invalidateCache(): void {
        this.motionClusterCache.clear()
        this.smoothingCache.clear()
    }

    // ==========================================================================
    // MOTION CLUSTER CACHE
    // ==========================================================================

    static getMotionClusterCacheKey(
        mouseEvents: MouseEvent[],
        videoWidth: number,
        videoHeight: number
    ): string {
        const firstTs = mouseEvents[0]?.timestamp ?? 0
        const lastTs = mouseEvents[mouseEvents.length - 1]?.timestamp ?? 0
        return `${firstTs}-${mouseEvents.length}-${lastTs}-${videoWidth}-${videoHeight}`
    }

    static getMotionClusters(key: string): Cluster[] | undefined {
        return this.motionClusterCache.get(key)?.clusters
    }

    static setMotionClusters(key: string, clusters: Cluster[]): void {
        // LRU eviction
        if (this.motionClusterCache.size >= MAX_MOTION_CLUSTER_ENTRIES) {
            const firstKey = this.motionClusterCache.keys().next().value
            if (firstKey) this.motionClusterCache.delete(firstKey)
        }
        this.motionClusterCache.set(key, { clusters })
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
