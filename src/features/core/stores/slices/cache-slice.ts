/**
 * Cache Slice
 *
 * Manages all application-level caches:
 * - Camera path cache
 * - Frame layout cache
 * - Invalidation logic
 */

import type { CameraPathFrame } from '@/types/remotion'
import type { FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout'
import type { CreateCacheSlice } from './types'

export const createCacheSlice: CreateCacheSlice = (set) => ({
    // State
    cameraPathCache: null,
    cameraPathCacheDimensions: null,
    frameLayoutCache: null,
    timelineMutationCounter: 0,
    previewReady: false,

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
        })
    },
})
