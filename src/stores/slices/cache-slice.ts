/**
 * Cache Slice
 *
 * Manages all application-level caches.
 * - Camera path cache
 * - Frame layout cache (to be added)
 * - Invalidation logic
 */

import type { CameraPathFrame } from '@/types/remotion'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'
import type { CreateCacheSlice } from './types'

export const createCacheSlice: CreateCacheSlice = (set) => ({
    // State
    cameraPathCache: null,
    frameLayoutCache: null,
    timelineMutationCounter: 0,

    // Actions
    setCameraPathCache: (cache: (CameraPathFrame & { path?: CameraPathFrame[] })[] | null) => {
        set((state) => {
            state.cameraPathCache = cache
        })
    },

    setFrameLayoutCache: (cache: FrameLayoutItem[] | null) => {
        set((state) => {
            state.frameLayoutCache = cache
        })
    },

    invalidateAllCaches: () => {
        set((state) => {
            state.cameraPathCache = null
            state.frameLayoutCache = null
            state.timelineMutationCounter += 1
        })
    }
})
