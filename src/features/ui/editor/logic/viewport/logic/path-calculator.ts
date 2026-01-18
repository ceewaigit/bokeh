
import { computeCameraState, type CameraPhysicsState } from './orchestrator'
import { calculateVideoPosition, calculateMockupPosition } from '@/features/rendering/renderer/engine/layout-engine'
import { EffectType } from '@/types/project'
import type { BackgroundEffect, Effect, Recording, RecordingMetadata } from '@/types/project'
import type { CameraPathFrame } from '@/types'
import { getActiveClipDataAtFrame } from '@/features/rendering/renderer/utils/get-active-clip-data-at-frame'
import type { FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout'
import { getActiveBackgroundEffect } from '@/features/effects/core/filters'
import { calculateZoomTransform, getZoomTransformString, getMotionBlurConfig } from '@/features/rendering/canvas/math/transforms/zoom-transform'
import type { MotionBlurConfig } from '@/types'
import { clamp01 } from '@/features/rendering/canvas/math'
import { DEFAULT_BACKGROUND_DATA } from '@/features/effects/background/config'

/**
 * Determines if the camera should be allowed to reveal padding (overscan) area.
 * This is true when the user has configured background padding.
 */
function shouldAllowOverscanReveal(padding: number): boolean {
    return padding > 0
}

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
    /** True when background has padding - allows camera to reveal padding area */
    allowOverscanReveal: boolean
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
        allowOverscanReveal: shouldAllowOverscanReveal(padding),
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
    cameraSettings?: {
        cameraSmoothness?: number
        cameraDynamics?: any
        motionBlurEnabled?: boolean
        motionBlurIntensity?: number
        motionBlurThreshold?: number
    }
}

/**
 * Calculate motion blur mix from velocity (deterministic per frame).
 * Returns 0-1 value indicating blur intensity.
 */
function calculateMotionBlurMix(
    velocity: { x: number; y: number },
    blurConfig: MotionBlurConfig,
    drawWidth: number,
    drawHeight: number
): number {
    if (!blurConfig.enabled) return 0

    // Convert normalized velocity to pixels
    const velocityPxX = velocity.x * drawWidth
    const velocityPxY = velocity.y * drawHeight
    const speed = Math.sqrt(velocityPxX * velocityPxX + velocityPxY * velocityPxY)

    // Threshold in pixels (matches getMotionBlurConfig calculation)
    const threshold = blurConfig.velocityThreshold * 15

    if (speed <= threshold) return 0

    // Smooth ramp from threshold to full intensity
    const normalizedSpeed = (speed - threshold) / 100
    return clamp01(normalizedSpeed)
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

    // Get motion blur config for precomputing blur mix
    const motionBlurConfig = getMotionBlurConfig(cameraSettings as any)

    // OPTIMIZATION: If no camera tracking, skip heavy camera path computation
    // Just return default center coordinates for all frames
    if (!hasCameraTracking) {
        const defaultResult = {
            activeZoomBlock: undefined,
            zoomCenter: { x: 0.5, y: 0.5 },
            velocity: { x: 0, y: 0 },
            motionBlurMix: 0,
            zoomTransform: { scale: 1, panX: 0, panY: 0, scaleCompensationX: 0, scaleCompensationY: 0, refocusBlur: 0 },
            zoomTransformStr: 'translate3d(0px, 0px, 0) scale3d(1, 1, 1)'
        }
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

    const out: (CameraPathFrame & { path?: CameraPathFrame[] })[] = new Array(totalFrames)

    for (let f = 0; f < totalFrames; f++) {
        const tMs = (f / fps) * 1000
        const clipData = getActiveClipDataAtFrame({ frame: f, frameLayout, fps, effects, getRecording })
        if (!clipData) {
            out[f] = {
                activeZoomBlock: undefined,
                zoomCenter: { x: 0.5, y: 0.5 },
                velocity: { x: 0, y: 0 },
                motionBlurMix: 0,
                zoomTransform: { scale: 1, panX: 0, panY: 0, scaleCompensationX: 0, scaleCompensationY: 0, refocusBlur: 0 },
                zoomTransformStr: 'translate3d(0px, 0px, 0) scale3d(1, 1, 1)'
            }
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

        // Use raw padding directly - no reference resolution scaling
        // Padding should be a simple percentage of output dimensions
        const rawPadding = backgroundData?.padding ?? DEFAULT_BACKGROUND_DATA.padding ?? 0
        const paddingScaled = rawPadding

        // Use stable videoWidth/videoHeight for camera calculation
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
                paddingScaled
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
                    paddingScaled
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
            // Use deterministic mode to ensure same zoomCenter/velocity for same frame
            // regardless of scrub direction (forward vs backward)
            deterministic: true,
            cameraSmoothness: cameraSettings?.cameraSmoothness,
            cameraDynamics: cameraSettings?.cameraDynamics,
            // Allow camera to reveal background padding when zoomed
            allowOverscanReveal: shouldAllowOverscanReveal(rawPadding),
        })

        Object.assign(physics, computed.physics)

        // Calculate velocity from previous frame's zoom center (deterministic)
        const prevCenter = f > 0 && out[f - 1] ? out[f - 1].zoomCenter : computed.zoomCenter

        // Scale velocity by (scale - 1) to match actual visual motion
        // At scale=1, there's no visual pan so velocity should be 0
        // This matches zoom-transform.ts: pan = (0.5 - center) * size * (scale - 1)
        const currentScale = computed.physics.scale ?? 1
        const visualMotionFactor = Math.max(0, currentScale - 1)

        const velocity = {
            x: (computed.zoomCenter.x - prevCenter.x) * visualMotionFactor,
            y: (computed.zoomCenter.y - prevCenter.y) * visualMotionFactor,
        }

        // PRECOMPUTE TRANSFORMS (SSOT)
        // This eliminates redundant calculation in SharedVideoController
        const fillScale = videoArea.drawWidth > 0 && videoArea.drawHeight > 0
            ? Math.max(videoWidth / videoArea.drawWidth, videoHeight / videoArea.drawHeight)
            : 1
        const zoomOverrideScale = computed.activeZoomBlock?.autoScale === 'fill' ? fillScale : undefined

        // Adjust zoom center for mockup coordinate space if needed
        const zoomCenter = mockupEnabled && mockupPosition
            ? {
                x: (mockupPosition.videoX + computed.zoomCenter.x * mockupPosition.videoWidth - mockupPosition.mockupX) / mockupPosition.mockupWidth,
                y: (mockupPosition.videoY + computed.zoomCenter.y * mockupPosition.videoHeight - mockupPosition.mockupY) / mockupPosition.mockupHeight,
            }
            : computed.zoomCenter

        // Target dimensions
        // MATCH LEGACY BEHAVIOR: Always use the video draw area for zoom calculations.
        // Using mockupWidth/Height here was incorrect and caused camera drift because
        // the pan calculations became relative to the device size, not the video content.
        const zoomDrawWidth = videoArea.drawWidth
        const zoomDrawHeight = videoArea.drawHeight

        const zoomTransform = calculateZoomTransform(
            computed.activeZoomBlock,
            tMs,
            zoomDrawWidth,
            zoomDrawHeight,
            zoomCenter,
            zoomOverrideScale,
            paddingScaled,
            computed.activeZoomBlock?.autoScale === 'fill',
            Boolean(mockupEnabled),
            computed.physics.scale // Explicitly use physics scale as source of truth
        )

        const zoomTransformStr = getZoomTransformString(zoomTransform)

        // Precompute motion blur mix (deterministic per frame)
        const motionBlurMix = calculateMotionBlurMix(
            velocity,
            motionBlurConfig,
            zoomDrawWidth,
            zoomDrawHeight
        )

        out[f] = {
            activeZoomBlock: computed.activeZoomBlock,
            zoomCenter: computed.zoomCenter,
            velocity,
            motionBlurMix,
            zoomTransform,
            zoomTransformStr
        }
    }

    return out
}
