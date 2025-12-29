import type { FrameLayoutItem } from '@/features/timeline/utils/frame-layout'
import type { CameraPathFrame } from '@/types'
import type { Effect, Recording, RecordingMetadata } from '@/types/project'
import { useMemo } from 'react'

type UseCameraPathArgs = {
    enabled: boolean
    isRendering: boolean
    currentFrame: number
    frameLayout: FrameLayoutItem[]
    fps: number
    videoWidth: number
    videoHeight: number
    sourceVideoWidth?: number
    sourceVideoHeight?: number
    effects: Effect[]
    getRecording: (recordingId: string) => Recording | null | undefined
    loadedMetadata?: Map<string, RecordingMetadata>
    cachedPath?: (CameraPathFrame & { path?: CameraPathFrame[] })[] | null
}

const DEFAULT_RESULT: CameraPathFrame & { path?: CameraPathFrame[] } = {
    activeZoomBlock: undefined,
    zoomCenter: { x: 0.5, y: 0.5 },
    velocity: { x: 0, y: 0 }
}

/**
 * Unified hook for accessing camera path data.
 * 
 * DESIGN PRINCIPLE:
 * The `cameraPathCache` (computed on project load) is the Single Source of Truth (SSOT).
 * 
 * - If cache exists: Return frame from cache (Preview & Render).
 * - If no cache: Return default center (static).
 * 
 * We no longer fallback to expensive realtime physics because the cache
 * should always be populated when a project is loaded.
 */
// Utility for safe frame lookup (SSOT)
export function getCameraFrameForTime(
    cache: (CameraPathFrame & { path?: CameraPathFrame[] })[],
    currentFrame: number
): CameraPathFrame & { path?: CameraPathFrame[] } {
    const safeFrame = Math.max(0, Math.floor(currentFrame))
    if (safeFrame < cache.length) {
        return cache[safeFrame]
    }
    return cache[cache.length - 1] || DEFAULT_RESULT
}

export function useCameraPath(args: UseCameraPathArgs): (CameraPathFrame & { path?: CameraPathFrame[] }) | null {
    const {
        enabled,
        currentFrame,
        cachedPath,
    } = args

    return useMemo(() => {
        if (!enabled) return null

        // 1. Use Cache if available (This is the happy path for 99% of cases)
        if (cachedPath) {
            return getCameraFrameForTime(cachedPath, currentFrame);
        }

        // 2. Fallback: No cache means we treat camera as static centered.
        // In the future, if we need realtime editing of path without re-caching,
        // we can re-introduce a LIGHTWEIGHT calculator here.
        return DEFAULT_RESULT

    }, [enabled, currentFrame, cachedPath])
}
