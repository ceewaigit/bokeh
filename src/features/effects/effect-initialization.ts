/**
 * Effect Initialization Service
 * 
 * Handles initializing effects for projects and recordings.
 * Ensures default effects (background, cursor) and initial states are set up correctly.
 */

import type { Project } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import { EffectStore } from '@/lib/core/effects'
import { EffectCreation } from './effect-creation'
import { syncKeystrokeEffects } from './services/keystroke-sync-service'

export const EffectInitialization = {
    createInitialEffectsForRecording(): void {
        // NOTE: All effects now live in timeline.effects (the SSOT)
        // This method is kept for API compatibility but does nothing
    },

    ensureGlobalEffects(project: Project): void {
        EffectStore.ensureArray(project)

        const effects = EffectStore.getAll(project)
        const hasBackground = effects.some(e => e.type === EffectType.Background)
        if (!hasBackground) {
            EffectStore.add(project, EffectCreation.createDefaultBackgroundEffect())
        }

        const hasCursor = effects.some(e => e.type === EffectType.Cursor)
        if (!hasCursor) {
            EffectStore.add(project, EffectCreation.createDefaultCursorEffect())
        }

        const hasKeystrokes = effects.some(e => e.type === EffectType.Keystroke)
        if (!hasKeystrokes) {
            syncKeystrokeEffects(project)
        }

        const hasWebcamEffect = effects.some(e => e.type === EffectType.Webcam)
        const webcamTrack = project.timeline.tracks.find(
            (track) => track.type === TrackType.Webcam
        )
        const hasWebcamClips = webcamTrack && webcamTrack.clips.length > 0
        if (!hasWebcamEffect && hasWebcamClips) {
            // Calculate webcam effect duration from actual clip duration
            const webcamClips = webcamTrack.clips
            const maxEndTime = webcamClips.reduce((max, clip) => {
                const clipEnd = clip.startTime + clip.duration
                return clipEnd > max ? clipEnd : max
            }, 0)

            const webcamEffect = EffectCreation.createDefaultWebcamEffect()
            // Set the webcam effect to match actual clip duration
            webcamEffect.endTime = maxEndTime > 0 ? maxEndTime : Number.MAX_SAFE_INTEGER
            EffectStore.add(project, webcamEffect)
        }
    },

    syncKeystrokeEffects(
        project: Project,
        metadataByRecordingId?: Map<string, import('@/types/project').RecordingMetadata>
    ): void {
        syncKeystrokeEffects(project, metadataByRecordingId)
    }
}
