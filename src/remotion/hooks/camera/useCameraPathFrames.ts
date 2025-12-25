import { useMemo, useRef } from 'react'
import type { CameraPathFrame } from '@/types'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'
import type { Effect, Recording, RecordingMetadata } from '@/types/project'
import { calculateFullCameraPath } from '@/lib/effects/utils/camera-path-calculator'
import { EffectType } from '@/types/project'
import type { BackgroundEffectData } from '@/types/project'

type UseCameraPathFramesArgs = {
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

export function useCameraPathFrames(args: UseCameraPathFramesArgs) {
    const {
        enabled,
        isRendering,
        currentFrame,
        frameLayout,
        fps,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        effects,
        getRecording,
        loadedMetadata,
        cachedPath,
    } = args

    // Check if there are any enabled zoom effects - skip heavy computation if not
    const hasZoomEffects = useMemo(() => {
        return effects.some(e => e.type === EffectType.Zoom && e.enabled)
    }, [effects])

    const hasMockupEffects = useMemo(() => {
        return effects.some(e => {
            if (e.type !== EffectType.Background || !e.enabled) return false
            const data = e.data as BackgroundEffectData | undefined
            return Boolean(data?.mockup?.enabled)
        })
    }, [effects])

    const hasCameraTracking = hasZoomEffects || hasMockupEffects

    const frames = useMemo(() => {
        // 1. Use Cache if available (fastest)
        if (cachedPath) return cachedPath

        // 2. Otherwise only compute if needed (render mode)
        if (!enabled || !isRendering || !hasCameraTracking) return null

        return calculateFullCameraPath({
            frameLayout,
            fps,
            videoWidth,
            videoHeight,
            sourceVideoWidth,
            sourceVideoHeight,
            effects,
            getRecording,
            loadedMetadata
        })
    }, [
        cachedPath,
        enabled,
        isRendering,
        hasCameraTracking,
        frameLayout,
        fps,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        effects,
        getRecording,
        loadedMetadata,
    ])

    // OPTIMIZATION: Cache the lookup result to avoid creating new objects every frame.
    // We use a ref to store the last frame's result and only create a new one if frame changed.
    const cachedResultRef = useRef<{ frame: number; result: (CameraPathFrame & { path?: CameraPathFrame[] }) | null }>({ frame: -1, result: null })

    const currentFrameResult = useMemo(() => {
        if (!frames) return null

        // Optimization: Return cached result if same frame
        if (cachedResultRef.current.frame === currentFrame && cachedResultRef.current.result) {
            return cachedResultRef.current.result
        }

        const frameData = frames[currentFrame]
        if (frameData) {
            const result = { ...frameData, path: frames }
            cachedResultRef.current = { frame: currentFrame, result }
            return result
        }

        // Fallback logic
        return { activeZoomBlock: undefined, zoomCenter: { x: 0.5, y: 0.5 }, path: frames }
    }, [frames, currentFrame])

    return {
        frames,
        currentFrameResult,
        hasCameraTracking
    }
}
