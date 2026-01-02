/**
 * Effect Initialization Service
 *
 * Handles initializing effects for projects and recordings.
 */

import type { Project } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import { EffectStore } from './store'
import { EffectCreation } from './creation'
import { syncKeystrokeEffects } from '../services/keystroke-sync-service'

export const EffectInitialization = {
  createInitialEffectsForRecording(): void {
    // NOTE: All effects now live in timeline.effects (the SSOT)
    // This method is kept for API compatibility but does nothing
  },

  ensureGlobalEffects(project: Project): void {
    EffectStore.ensureArray(project)

    const effects = EffectStore.getAll(project)
    if (!effects.some(e => e.type === EffectType.Background)) {
      EffectStore.add(project, EffectCreation.createDefaultBackgroundEffect())
    }

    if (!effects.some(e => e.type === EffectType.Cursor)) {
      EffectStore.add(project, EffectCreation.createDefaultCursorEffect())
    }

    if (!effects.some(e => e.type === EffectType.Keystroke)) {
      syncKeystrokeEffects(project)
    }

    const hasWebcamEffect = effects.some(e => e.type === EffectType.Webcam)
    const webcamTrack = project.timeline.tracks.find(track => track.type === TrackType.Webcam)
    const hasWebcamClips = webcamTrack && webcamTrack.clips.length > 0
    if (!hasWebcamEffect && hasWebcamClips) {
      const maxEndTime = webcamTrack.clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0)
      const webcamEffect = EffectCreation.createDefaultWebcamEffect()
      webcamEffect.endTime = maxEndTime > 0 ? maxEndTime : Number.MAX_SAFE_INTEGER
      EffectStore.add(project, webcamEffect)
    }
  },

  syncKeystrokeEffects(
    project: Project,
    metadataByRecordingId?: Map<string, import('@/types/project').RecordingMetadata>
  ): void {
    syncKeystrokeEffects(project, metadataByRecordingId)
  },
}

