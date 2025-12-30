
import { computeCameraState, ParsedZoomBlock, type CameraPhysicsState } from '@/features/effects/utils/camera-calculator'
import { calculateVideoPosition } from '@/remotion/compositions/utils/layout/video-position'
import { EffectType } from '@/types/project'
import type { BackgroundEffect, Effect, Recording, RecordingMetadata } from '@/types/project'
import type { CameraPathFrame } from '@/types'
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame'
import type { FrameLayoutItem } from '@/features/timeline/utils/frame-layout'
import { calculateMockupPosition } from '@/lib/mockups/mockup-transform'
import { getActiveBackgroundEffect } from '@/features/effects/effect-filters'

// Re-using types from hook or defining shared types locally if needed
type CameraVideoArea = {
    drawWidth: number
    drawHeight: number
    offsetX: number
    offsetY: number
}

export function getCameraOutputParams(args: {
    canvasWidth: number
    canvasHeight: number
    videoArea: CameraVideoArea
    mockupPosition: ReturnType<typeof calculateMockupPosition> | null
}): { outputWidth: number; outputHeight: number; overscan?: { left: number; right: number; top: number; bottom: number } } {
    const { canvasWidth, canvasHeight, videoArea, mockupPosition } = args
    const outputWidth = mockupPosition?.screenWidth ?? canvasWidth
    const outputHeight = mockupPosition?.screenHeight ?? canvasHeight
    const outputOffsetX = mockupPosition?.screenX ?? 0
    const outputOffsetY = mockupPosition?.screenY ?? 0

    if (
        outputWidth <= 0 ||
        outputHeight <= 0 ||
        videoArea.drawWidth <= 0 ||
        videoArea.drawHeight <= 0
    ) {
        return { outputWidth, outputHeight }
    }

    const relativeOffsetX = videoArea.offsetX - outputOffsetX
    const relativeOffsetY = videoArea.offsetY - outputOffsetY
    const leftPx = relativeOffsetX
    const rightPx = outputWidth - relativeOffsetX - videoArea.drawWidth
    const topPx = relativeOffsetY
    const bottomPx = outputHeight - relativeOffsetY - videoArea.drawHeight

    return {
        outputWidth,
        outputHeight,
        overscan: {
            left: Math.max(0, leftPx / videoArea.drawWidth),
            right: Math.max(0, rightPx / videoArea.drawWidth),
            top: Math.max(0, topPx / videoArea.drawHeight),
            bottom: Math.max(0, bottomPx / videoArea.drawHeight),
        },
    }
}

/**
 * Get camera output context for a given clip at a specific time.
 * This is the SSOT (Single Source of Truth) for camera output parameters.
 */
export function getCameraOutputContext(args: {
    clipEffects: Effect[]
    timelineMs: number
    compositionWidth: number
    compositionHeight: number
    recording: Recording | null | undefined
    sourceVideoWidth?: number
    sourceVideoHeight?: number
}): {
    outputWidth: number
    outputHeight: number
    overscan?: { left: number; right: number; top: number; bottom: number }
    mockupScreenPosition?: { x: number; y: number; width: number; height: number }
    forceFollowCursor: boolean
} {
    const {
        clipEffects,
        timelineMs,
        compositionWidth,
        compositionHeight,
        recording,
        sourceVideoWidth,
        sourceVideoHeight,
    } = args

    const backgroundEffect = getActiveBackgroundEffect(clipEffects, timelineMs) as BackgroundEffect | undefined
    const backgroundData = backgroundEffect?.data ?? null
    const padding = backgroundData?.padding || 0

    const activeSourceWidth = recording?.width || sourceVideoWidth || compositionWidth
    const activeSourceHeight = recording?.height || sourceVideoHeight || compositionHeight

    const mockupData = backgroundData?.mockup
    const mockupEnabled = mockupData?.enabled ?? false
    const mockupPosition = mockupEnabled && mockupData
        ? calculateMockupPosition(
            compositionWidth,
            compositionHeight,
            mockupData,
            activeSourceWidth,
            activeSourceHeight,
            padding
        )
        : null

    const videoArea: CameraVideoArea = mockupEnabled && mockupPosition
        ? {
            drawWidth: mockupPosition.videoWidth,
            drawHeight: mockupPosition.videoHeight,
            offsetX: mockupPosition.videoX,
            offsetY: mockupPosition.videoY,
        }
        : (() => {
            const position = calculateVideoPosition(
                compositionWidth,
                compositionHeight,
                activeSourceWidth,
                activeSourceHeight,
                padding
            )
            return {
                drawWidth: position.drawWidth,
                drawHeight: position.drawHeight,
                offsetX: position.offsetX,
                offsetY: position.offsetY,
            }
        })()

    const { outputWidth, outputHeight, overscan } = getCameraOutputParams({
        canvasWidth: compositionWidth,
        canvasHeight: compositionHeight,
        videoArea,
        mockupPosition,
    })

    const mockupScreenPosition = mockupEnabled && mockupPosition
        ? { x: 0, y: 0, width: outputWidth, height: outputHeight }
        : undefined

    return {
        outputWidth,
        outputHeight,
        overscan,
        mockupScreenPosition,
        forceFollowCursor: Boolean(mockupEnabled && mockupPosition),
    }
}


export interface CalculateCameraPathArgs {
    frameLayout: FrameLayoutItem[]
    fps: number
    videoWidth: number
    videoHeight: number
    sourceVideoWidth?: number
    sourceVideoHeight?: number
    effects: Effect[]
    getRecording: (recordingId: string) => Recording | null | undefined
    loadedMetadata?: Map<string, RecordingMetadata>
    cameraSettings?: { cameraSmoothness?: number; cameraDynamics?: any }
}

export function calculateFullCameraPath(args: CalculateCameraPathArgs): (CameraPathFrame & { path?: CameraPathFrame[] })[] | null {
    const {
        frameLayout,
        fps,
        videoWidth,
        videoHeight,
        sourceVideoWidth,
        sourceVideoHeight,
        effects,
        getRecording,
        loadedMetadata,
        cameraSettings
    } = args

    if (!frameLayout || frameLayout.length === 0) return null

    // Check if there are any enabled zoom effects - skip heavy computation if not
    const hasZoomEffects = effects.some(e => e.type === EffectType.Zoom && e.enabled)

    const hasMockupEffects = effects.some(e => {
        if (e.type !== EffectType.Background || !e.enabled) return false
        const data = e.data as any
        return Boolean(data?.mockup?.enabled)
    })

    const hasCameraTracking = hasZoomEffects || hasMockupEffects

    const totalFrames = frameLayout[frameLayout.length - 1].endFrame

    // OPTIMIZATION: If no camera tracking, skip heavy camera path computation
    // Just return default center coordinates for all frames
    if (!hasCameraTracking) {
        const defaultResult = { activeZoomBlock: undefined, zoomCenter: { x: 0.5, y: 0.5 }, velocity: { x: 0, y: 0 } }
        const out = new Array(totalFrames).fill(defaultResult)
        return out
    }

    const physics: CameraPhysicsState = {
        x: 0.5,
        y: 0.5,
        vx: 0,
        vy: 0,
        scale: 1,
        vScale: 0,
        lastTimeMs: 0,
        lastSourceTimeMs: 0,
    }

    const out: { activeZoomBlock: ParsedZoomBlock | undefined; zoomCenter: { x: number; y: number }; zoomScale: number; velocity: { x: number; y: number } }[] = new Array(totalFrames)

    for (let f = 0; f < totalFrames; f++) {
        const tMs = (f / fps) * 1000
        const clipData = getActiveClipDataAtFrame({ frame: f, frameLayout, fps, effects, getRecording })
        if (!clipData) {
            out[f] = { activeZoomBlock: undefined, zoomCenter: { x: 0.5, y: 0.5 }, zoomScale: 1, velocity: { x: 0, y: 0 } }
            continue
        }

        const { recording, sourceTimeMs, effects: clipEffects } = clipData
        const metadata = recording ? loadedMetadata?.get(recording.id) : undefined
        const backgroundEffect = clipEffects.find(e =>
            e.type === EffectType.Background &&
            e.enabled &&
            e.startTime <= sourceTimeMs &&
            e.endTime >= sourceTimeMs
        ) as BackgroundEffect | undefined
        const backgroundData = backgroundEffect?.data ?? null
        const padding = backgroundData?.padding || 0

        // Use stable videoWidth/videoHeight for camera calculation
        // This ensures preview and export compute identical camera positions
        const activeSourceWidth = recording?.width || sourceVideoWidth || videoWidth
        const activeSourceHeight = recording?.height || sourceVideoHeight || videoHeight
        const mockupData = backgroundData?.mockup
        const mockupEnabled = mockupData?.enabled ?? false
        const mockupPosition = mockupEnabled && mockupData
            ? calculateMockupPosition(
                videoWidth,
                videoHeight,
                mockupData,
                activeSourceWidth,
                activeSourceHeight,
                padding
            )
            : null

        const videoArea: CameraVideoArea = mockupEnabled && mockupPosition
            ? {
                drawWidth: mockupPosition.videoWidth,
                drawHeight: mockupPosition.videoHeight,
                offsetX: mockupPosition.videoX,
                offsetY: mockupPosition.videoY,
            }
            : (() => {
                const position = calculateVideoPosition(
                    videoWidth,
                    videoHeight,
                    activeSourceWidth,
                    activeSourceHeight,
                    padding
                )
                return {
                    drawWidth: position.drawWidth,
                    drawHeight: position.drawHeight,
                    offsetX: position.offsetX,
                    offsetY: position.offsetY,
                }
            })()

        const { outputWidth, outputHeight, overscan } = getCameraOutputParams({
            canvasWidth: videoWidth,
            canvasHeight: videoHeight,
            videoArea,
            mockupPosition,
        })
        const mockupScreenPosition = mockupEnabled && mockupPosition
            ? {
                x: 0,
                y: 0,
                width: outputWidth,
                height: outputHeight,
            }
            : undefined

        const computed = computeCameraState({
            effects: clipEffects,
            timelineMs: tMs,
            sourceTimeMs,
            recording,
            metadata,
            outputWidth,
            outputHeight,
            overscan,
            mockupScreenPosition,
            forceFollowCursor: Boolean(mockupEnabled && mockupPosition),
            physics,
            // We simulate sequentially into a lookup table, so stateful physics is safe here.
            deterministic: false,
            cameraSmoothness: cameraSettings?.cameraSmoothness,
            cameraDynamics: cameraSettings?.cameraDynamics
        })

        Object.assign(physics, computed.physics)

        // Calculate velocity from previous frame's zoom center (deterministic)
        const prevCenter = f > 0 && out[f - 1] ? out[f - 1].zoomCenter : computed.zoomCenter
        const velocity = {
            x: computed.zoomCenter.x - prevCenter.x,
            y: computed.zoomCenter.y - prevCenter.y,
        }
        out[f] = { activeZoomBlock: computed.activeZoomBlock, zoomCenter: computed.zoomCenter, zoomScale: computed.zoomScale, velocity }
    }

    return out
}
