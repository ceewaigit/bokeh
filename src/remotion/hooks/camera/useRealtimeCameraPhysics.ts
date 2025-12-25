import { useMemo, useRef } from 'react'
import { computeCameraState, type CameraPhysicsState } from '@/lib/effects/utils/camera-calculator'
import { CAMERA_CONFIG } from '@/lib/effects/config/physics-config'
import { calculateVideoPosition } from '@/remotion/compositions/utils/layout/video-position'
import { getActiveBackgroundEffect } from '@/lib/effects/effect-filters'
import type { BackgroundEffect, Effect, Recording, RecordingMetadata } from '@/types/project'
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'
import { calculateMockupPosition } from '@/lib/mockups/mockup-transform'

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

type UseRealtimeCameraPhysicsArgs = {
    enabled: boolean
    forceDisabled?: boolean
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
    hasCameraTracking: boolean
}

export function useRealtimeCameraPhysics(args: UseRealtimeCameraPhysicsArgs) {
    const {
        enabled,
        forceDisabled,
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
        hasCameraTracking,
    } = args

    const previewPhysicsRef = useRef<CameraPhysicsState | null>(null)
    const previewLastFrameRef = useRef<number | null>(null)
    const previewLastRecordingIdRef = useRef<string | null>(null)

    return useMemo(() => {
        if (forceDisabled) return null
        if (!enabled) return null
        if (!frameLayout || frameLayout.length === 0) return null

        if (!hasCameraTracking) {
            return { activeZoomBlock: undefined, zoomCenter: { x: 0.5, y: 0.5 } }
        }

        const clipData = getActiveClipDataAtFrame({ frame: currentFrame, frameLayout, fps, effects, getRecording })
        if (!clipData) {
            return { activeZoomBlock: undefined, zoomCenter: { x: 0.5, y: 0.5 } }
        }

        const { recording, sourceTimeMs, effects: clipEffects } = clipData
        const metadata = recording ? loadedMetadata?.get(recording.id) : undefined
        // Use centralized lookup with consistent boundary semantics
        const backgroundEffect = getActiveBackgroundEffect(clipEffects, sourceTimeMs) as BackgroundEffect | undefined
        const backgroundData = backgroundEffect?.data ?? null
        const padding = backgroundData?.padding || 0

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

        const timelineMs = (currentFrame / fps) * 1000
        const prevFrame = previewLastFrameRef.current
        const recordingId = recording?.id ?? null

        const frameDelta = prevFrame == null ? 0 : currentFrame - prevFrame
        const backstepMs = frameDelta < 0 ? Math.abs((frameDelta / fps) * 1000) : 0
        const isMinorBackstep = frameDelta < 0 && backstepMs <= CAMERA_CONFIG.seekThresholdMs

        const shouldReset =
            previewPhysicsRef.current == null ||
            prevFrame == null ||
            recordingId !== previewLastRecordingIdRef.current ||
            // Reset on backwards scrubs (true seek).
            // Allow tiny backwards drift (pause/resume rounding) without resetting physics.
            frameDelta < 0 && !isMinorBackstep

        if (shouldReset) {
            const seedPhysics: CameraPhysicsState = {
                x: 0.5,
                y: 0.5,
                vx: 0,
                vy: 0,
                lastTimeMs: timelineMs,
                lastSourceTimeMs: sourceTimeMs,
            }
            // Seed physics from deterministic center so seeks/pause don't replay a pan from center.
            const seed = computeCameraState({
                effects: clipEffects,
                timelineMs,
                sourceTimeMs,
                recording,
                metadata,
                outputWidth,
                outputHeight,
                overscan,
                mockupScreenPosition,
                forceFollowCursor: Boolean(mockupEnabled && mockupPosition),
                physics: seedPhysics,
                deterministic: true,
            })
            previewPhysicsRef.current = seed.physics
        } else if (isMinorBackstep && previewPhysicsRef.current) {
            // Avoid negative dt while preserving current camera state.
            previewPhysicsRef.current.lastTimeMs = timelineMs
            previewPhysicsRef.current.lastSourceTimeMs = sourceTimeMs
        }

        const computed = computeCameraState({
            effects: clipEffects,
            timelineMs,
            sourceTimeMs,
            recording,
            metadata,
            outputWidth,
            outputHeight,
            overscan,
            mockupScreenPosition,
            forceFollowCursor: Boolean(mockupEnabled && mockupPosition),
            physics: previewPhysicsRef.current!,
            deterministic: false,
        })

        previewPhysicsRef.current = computed.physics
        previewLastFrameRef.current = currentFrame
        previewLastRecordingIdRef.current = recordingId

        return { activeZoomBlock: computed.activeZoomBlock, zoomCenter: computed.zoomCenter }
    }, [
        forceDisabled,
        enabled,
        currentFrame,
        frameLayout,
        fps,
        effects,
        getRecording,
        videoHeight,
        videoWidth,
        sourceVideoHeight,
        sourceVideoWidth,
        loadedMetadata,
        hasCameraTracking,
    ])
}
