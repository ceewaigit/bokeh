/**
 * Cache Slice
 *
 * Manages all application-level caches.
 * - Camera path cache
 * - Frame layout cache (to be added)
 * - Invalidation logic
 */

import type { CameraPathFrame } from '@/types/remotion'
import type { FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout'
import type { CreateCacheSlice } from './types'

/**
 * Ephemeral proxy URL storage
 * Keys: recordingId, Values: { previewProxyUrl?, glowProxyUrl?, scrubProxyUrl? }
 * 
 * IMPORTANT: This is stored separately from project data to avoid triggering
 * cache invalidation when proxies complete. Proxy URLs are temporary (/tmp)
 * and don't need to be persisted with the project.
 */
export interface ProxyUrlEntry {
    previewProxyUrl?: string
    glowProxyUrl?: string
    scrubProxyUrl?: string
}

export const createCacheSlice: CreateCacheSlice = (set, get) => ({
    // State
    cameraPathCache: null,
    cameraPathCacheDimensions: null,
    frameLayoutCache: null,
    timelineMutationCounter: 0,
    previewReady: false,
    proxyUrls: {} as Record<string, ProxyUrlEntry>,

    // Actions
    setCameraPathCache: (
        cache: (CameraPathFrame & { path?: CameraPathFrame[] })[] | null,
        dimensions?: { width: number; height: number } | null
    ) => {
        set((state) => {
            state.cameraPathCache = cache
            state.cameraPathCacheDimensions = cache ? (dimensions ?? null) : null
        })
    },

    setFrameLayoutCache: (cache: FrameLayoutItem[] | null) => {
        set((state) => {
            state.frameLayoutCache = cache
        })
    },

    setPreviewReady: (ready: boolean) => {
        set((state) => {
            state.previewReady = ready
        })
    },

    invalidateAllCaches: () => {
        set((state) => {
            state.cameraPathCache = null
            state.cameraPathCacheDimensions = null
            state.frameLayoutCache = null
            state.timelineMutationCounter += 1
            // Note: proxyUrls are NOT invalidated - they are ephemeral but stable
        })
    },

    /**
     * Set proxy URL for a recording without triggering cache invalidation.
     * This is the key fix for the "video disappears after proxy" bug.
     */
    setProxyUrl: (recordingId: string, proxyType: 'preview' | 'glow' | 'scrub', url: string) => {
        set((state) => {
            if (!state.proxyUrls[recordingId]) {
                state.proxyUrls[recordingId] = {}
            }
            if (proxyType === 'preview') {
                state.proxyUrls[recordingId].previewProxyUrl = url
            } else if (proxyType === 'glow') {
                state.proxyUrls[recordingId].glowProxyUrl = url
            } else {
                state.proxyUrls[recordingId].scrubProxyUrl = url
            }
        })
    },

    /**
     * Get proxy URL for a recording.
     */
    getProxyUrl: (recordingId: string, proxyType: 'preview' | 'glow' | 'scrub') => {
        const entry = get().proxyUrls[recordingId]
        if (!entry) return undefined
        if (proxyType === 'preview') return entry.previewProxyUrl
        if (proxyType === 'glow') return entry.glowProxyUrl
        return entry.scrubProxyUrl
    },

    /**
     * Clear all proxy URLs (called on project close).
     */
    clearProxyUrls: () => {
        set((state) => {
            state.proxyUrls = {}
        })
    }
})
