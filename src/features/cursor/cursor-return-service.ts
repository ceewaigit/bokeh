import { Clip, Recording, Project, Effect, TrackType, EffectType } from '@/types/project'
import { PlayheadService } from '@/features/timeline/playback/playhead-service'
import { EffectStore } from '@/features/effects/core/store'
import { getCropEffectForClip, getActiveCropEffect } from '@/features/effects/core/filters'
import { captureLastFrame } from '@/shared/utils/frame-capture'
import { generateCursorReturnFromSource } from '@/features/cursor/synthetic-events'
import { resolveProjectRoot } from '@/features/storage/recording-storage'
import { findClipById } from '@/features/timeline/clips/clip-reflow'

export interface CursorReturnData {
    imagePath: string
    width: number
    height: number
    durationMs: number
    startTime: number
    syntheticEvents: any[] | undefined
    effectsToCopy: Effect[]
}

export interface FileSystemAPI {
    saveRecording?: (path: string, buffer: ArrayBuffer) => Promise<{ success: boolean }>
    fileExists?: (path: string) => Promise<boolean>
}

export class CursorReturnService {
    static async prepareCursorReturn(
        project: Project,
        currentTime: number,
        sourceClipId: string | undefined,
        fileSystem: FileSystemAPI,
        durationMs: number = 2000
    ): Promise<CursorReturnData | null> {
        const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
        if (!videoTrack) return null

        // Find source clip - either specified or current playhead clip
        let sourceClip: Clip | null = null
        let sourceRecording: Recording | null = null

        if (sourceClipId) {
            const result = findClipById(project, sourceClipId)
            if (result) {
                sourceClip = result.clip
                sourceRecording = project.recordings.find(r => r.id === sourceClip!.recordingId) ?? null
            }
        } else {
            // Compute playhead state on-demand (SSOT - no stored playhead state)
            const playheadState = PlayheadService.updatePlayheadState(project, currentTime)
            sourceClip = playheadState.playheadClip
            sourceRecording = playheadState.playheadRecording
        }

        if (!sourceClip || !sourceRecording) {
            console.warn('CursorReturnService: No source clip found')
            return null
        }

        // Only work with video clips (not generated or image)
        if (sourceRecording.sourceType !== 'video') {
            console.warn('CursorReturnService: Source must be a video clip')
            return null
        }

        // Capture freeze frame from last frame of source clip
        const captureResult = await captureLastFrame(
            sourceRecording.filePath,
            sourceClip.sourceOut
        )

        if (!captureResult.success || !captureResult.dataUrl) {
            console.error('CursorReturnService: Failed to capture freeze frame:', captureResult.error)
            return null
        }

        // Get mouse events from source recording
        const sourceEvents = sourceRecording.metadata?.mouseEvents ?? []

        // Generate synthetic cursor return events
        const syntheticEvents = generateCursorReturnFromSource(
            sourceEvents,
            sourceClip.sourceIn ?? 0,
            sourceClip.sourceOut,
            durationMs
        )

        if (!syntheticEvents) {
            console.warn('CursorReturnService: Could not generate cursor return events (no mouse data)')
        }

        // Collect effects to copy from both source recording and timeline
        const timelineEffects = EffectStore.getAll(project)
        const clipEnd = sourceClip.startTime + sourceClip.duration

        // Get crop effect using clipId-based matching first, then fall back to active-at-end
        const cropEffect = getCropEffectForClip(timelineEffects, sourceClip)
            ?? getActiveCropEffect(timelineEffects, Math.max(0, clipEnd - 1))

        // Get other effects (Background, Screen) using time-range filtering
        const activeTimelineEffects = timelineEffects.filter(e =>
            e.type !== EffectType.Crop &&
            e.startTime <= clipEnd && e.endTime >= clipEnd
        )

        const sourceOut = sourceClip.sourceOut
        const activeSourceEffects = (sourceRecording.effects ?? []).filter(e =>
            e.startTime <= sourceOut && e.endTime >= sourceOut
        )

        const effectsToCopy = [
            ...(cropEffect ? [cropEffect] : []),
            ...activeTimelineEffects.filter(e =>
                e.type === EffectType.Background || e.type === EffectType.Screen
            ),
            ...activeSourceEffects.filter(e =>
                e.type === EffectType.Background || e.type === EffectType.Screen
            )
        ]

        // Calculate insert time (right after source clip ends)
        const insertTime = sourceClip.startTime + sourceClip.duration

        // Save freeze frame to disk instead of using data URL directly
        let imagePath = captureResult.dataUrl

        if (fileSystem.saveRecording && project.filePath) {
            try {
                const projectFolder = await resolveProjectRoot(project.filePath, fileSystem.fileExists)
                const freezeFrameId = `freeze-${Date.now()}`
                const freezeFramePath = `${projectFolder}/${freezeFrameId}.jpg`

                const match = captureResult.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
                if (match) {
                    const base64 = match[2]
                    const binary = atob(base64)
                    const bytes = new Uint8Array(binary.length)
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i)
                    }

                    const saveResult = await fileSystem.saveRecording(freezeFramePath, bytes.buffer)
                    if (saveResult?.success) {
                        imagePath = freezeFramePath
                    } else {
                        console.warn('[CursorReturn] Failed to save freeze frame, using data URL fallback')
                    }
                }
            } catch (error) {
                console.warn('[CursorReturn] Error saving freeze frame to disk:', error)
            }
        }

        return {
            imagePath,
            width: captureResult.width,
            height: captureResult.height,
            durationMs,
            startTime: insertTime,
            syntheticEvents: syntheticEvents ?? undefined,
            effectsToCopy
        }
    }
}
