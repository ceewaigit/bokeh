import type { CameraPathFrame } from '@/types'
import { useMemo } from 'react'

// Import DEFAULT_RESULT from calculator or define locally if not exported
// Using the same default as before to be safe
const DEFAULT_RESULT: CameraPathFrame & { path?: CameraPathFrame[] } = {
    activeZoomBlock: undefined,
    zoomCenter: { x: 0.5, y: 0.5 },
    velocity: { x: 0, y: 0 },
    motionBlurMix: 0,
    zoomTransform: { scale: 1, panX: 0, panY: 0, scaleCompensationX: 0, scaleCompensationY: 0, refocusBlur: 0 },
    zoomTransformStr: 'translate3d(0px, 0px, 0) scale3d(1, 1, 1)'
}

type UseCameraPathArgs = {
    enabled: boolean
    currentFrame: number
    cachedPath?: (CameraPathFrame & { path?: CameraPathFrame[] })[] | null
}

/**
 * Unified hook for accessing camera path data.
 * 
 * DESIGN PRINCIPLE:
 * The `cameraPathCache` (computed on project load) is the Single Source of Truth (SSOT).
 * 
 * - If cache exists: Return frame from cache (Preview & Render).
 * - If no cache (Export/Headless): Return default center (static).
 * 
 * NOTE: For export, the parent component (TimelineComposition) MUST ensure `cachedPath` 
 * is populated via calculation before rendering. This hook is purely for access.
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

        // 1. Use Cache if available (Only path - SSOT)
        if (cachedPath) {
            return getCameraFrameForTime(cachedPath, currentFrame);
        }

        // 2. No cache? Static center.
        // It is the responsibility of the caller to provide the path if dynamic camera is needed.
        return DEFAULT_RESULT

    }, [enabled, currentFrame, cachedPath])
}
