import { useMemo, useRef } from 'react'
import { computeCameraState, type CameraPhysicsState } from '@/lib/effects/utils/camera-calculator'
import { CAMERA_CONFIG } from '@/lib/effects/config/physics-config'
import { getCameraOutputContext } from '@/lib/effects/utils/camera-output-context'
import type { Effect, Recording, RecordingMetadata } from '@/types/project'
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'
import { getZoomBlockAtTime, parseZoomBlocks } from '@/lib/core/camera'

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
    const previewLastZoomSignatureRef = useRef<string | null>(null)

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
        const timelineMs = (currentFrame / fps) * 1000
        const metadata = recording ? loadedMetadata?.get(recording.id) : undefined
        // Use centralized lookup with consistent boundary semantics
        const {
            outputWidth,
            outputHeight,
            overscan,
            mockupScreenPosition,
            forceFollowCursor,
        } = getCameraOutputContext({
            clipEffects,
            timelineMs,
            compositionWidth: videoWidth,
            compositionHeight: videoHeight,
            recording,
            sourceVideoWidth,
            sourceVideoHeight,
        })

        const prevFrame = previewLastFrameRef.current
        const recordingId = recording?.id ?? null
        const activeZoomBlock = getZoomBlockAtTime(parseZoomBlocks(clipEffects), timelineMs)
        const zoomSignature = activeZoomBlock
            ? [
                activeZoomBlock.id,
                activeZoomBlock.followStrategy ?? 'mouse',
                activeZoomBlock.targetX ?? 'none',
                activeZoomBlock.targetY ?? 'none',
                activeZoomBlock.screenWidth ?? 'none',
                activeZoomBlock.screenHeight ?? 'none',
                activeZoomBlock.autoScale ?? 'none',
                activeZoomBlock.scale ?? 'none',
            ].join('|')
            : 'none'
        const zoomSignatureChanged = zoomSignature !== previewLastZoomSignatureRef.current

        const frameDelta = prevFrame == null ? 0 : currentFrame - prevFrame
        const backstepMs = frameDelta < 0 ? Math.abs((frameDelta / fps) * 1000) : 0
        const isMinorBackstep = frameDelta < 0 && backstepMs <= CAMERA_CONFIG.seekThresholdMs

        const shouldReset =
            previewPhysicsRef.current == null ||
            prevFrame == null ||
            recordingId !== previewLastRecordingIdRef.current ||
            zoomSignatureChanged ||
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
                forceFollowCursor,
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
            forceFollowCursor,
            physics: previewPhysicsRef.current!,
            deterministic: false,
        })

        previewPhysicsRef.current = computed.physics
        previewLastFrameRef.current = currentFrame
        previewLastRecordingIdRef.current = recordingId
        previewLastZoomSignatureRef.current = zoomSignature

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
