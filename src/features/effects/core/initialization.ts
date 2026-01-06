/**
 * Effect Initialization Service
 *
 * Handles initializing effects for projects and recordings.
 */

import type { Project } from '@/types/project'
import { EffectType } from '@/types/project';
import { EffectStore } from './store'
import { EffectCreation } from './creation'
import { syncKeystrokeEffects } from '../services/keystroke-sync-service'

export const EffectInitialization = {
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
  },

  syncKeystrokeEffects(
    project: Project,
    metadataByRecordingId?: Map<string, import('@/types/project').RecordingMetadata>
  ): void {
    syncKeystrokeEffects(project, metadataByRecordingId)
  },
}
