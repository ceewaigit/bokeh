import { useCameraPathFrames } from './useCameraPathFrames'
import { useRealtimeCameraPhysics } from './useRealtimeCameraPhysics'
import type { Effect, Recording, RecordingMetadata } from '@/types/project'
import type { CameraPathFrame } from '@/types'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'

export function usePrecomputedCameraPath(args: {
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
}): (CameraPathFrame & { path?: CameraPathFrame[] }) | null {
  const {
    enabled,
    isRendering,
    cachedPath,
  } = args

  const effectiveCachedPath = isRendering ? cachedPath : null

  // 1. Get Frames (Cached or Computed) + Tracking Status
  const { currentFrameResult, hasCameraTracking } = useCameraPathFrames({
    ...args,
    cachedPath: effectiveCachedPath,
  })

  // 2. Logic: Should we use precomputed path?
  // We use precomputed (frames) if rendering & tracking is on, OR if we have a cache provided.
  const shouldPrecompute = (enabled && isRendering && hasCameraTracking) || (effectiveCachedPath != null)

  // 3. Get Realtime Physics (only if not precomputing)
  const realtimeResult = useRealtimeCameraPhysics({
    ...args,
    hasCameraTracking,
    forceDisabled: shouldPrecompute
  })

  // 4. Return Priority: Frame Result (Precomputed) > Realtime Result
  // If precomputing, currentFrameResult will be populated (or fallback center).
  // If realtime, realtimeResult will be populated.

  if (shouldPrecompute) {
    return currentFrameResult
  }

  return realtimeResult ?? { activeZoomBlock: undefined, zoomCenter: { x: 0.5, y: 0.5 } }
}
