
import { computeCameraState, ParsedZoomBlock, type CameraPhysicsState } from '@/lib/effects/utils/camera-calculator'
import { calculateVideoPosition } from '@/remotion/compositions/utils/video-position'
import { EffectType } from '@/types/project'
import type { BackgroundEffect, Effect, Recording, RecordingMetadata } from '@/types/project'
import type { CameraPathFrame } from '@/types'
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'
import { calculateMockupPosition } from '@/lib/mockups/mockup-transform'

// Re-using types from hook or defining shared types locally if needed
type CameraVideoArea = {
    drawWidth: number
    drawHeight: number
    offsetX: number
    offsetY: number
}

function getCameraOutputParams(args: {
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
        const defaultResult = { activeZoomBlock: undefined, zoomCenter: { x: 0.5, y: 0.5 } }
        const out = new Array(totalFrames).fill(defaultResult)
        return out
    }

    const physics: CameraPhysicsState = {
        x: 0.5,
        y: 0.5,
        vx: 0,
        vy: 0,
        lastTimeMs: 0,
        lastSourceTimeMs: 0,
    }

    const out: { activeZoomBlock: ParsedZoomBlock | undefined; zoomCenter: { x: number; y: number } }[] = new Array(totalFrames)

    for (let f = 0; f < totalFrames; f++) {
        const tMs = (f / fps) * 1000
        const clipData = getActiveClipDataAtFrame({ frame: f, frameLayout, fps, effects, getRecording })
        if (!clipData) {
            out[f] = { activeZoomBlock: undefined, zoomCenter: { x: 0.5, y: 0.5 } }
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
        })

        Object.assign(physics, computed.physics)
        out[f] = { activeZoomBlock: computed.activeZoomBlock, zoomCenter: computed.zoomCenter }
    }

    // @ts-ignore - mismatch in return type slightly but compatible in structure, we'll fix strict types if needed
    return out
}
