import { Command, CommandResult } from '../base/Command'
import type { CommandContext } from '../base/CommandContext'
import type { Clip, Effect, Recording } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import { addRecordingToProject } from '@/features/timeline/clips/clip-creation'
import { findClipById } from '@/features/timeline/clips/clip-reflow'
import { removeClipFromTrack } from '@/features/timeline/clips/clip-crud'
import { ProjectCleanupService } from '@/features/timeline/project-cleanup'

interface ImportRecordingPayload {
  recording: Recording
  trackType?: TrackType
  sourceClip?: Clip
  sourceEffects?: Effect[]
}

export class ImportRecordingCommand extends Command<{ clipId: string }> {
  private clipId?: string
  private recordingId?: string
  private addedEffectIds: string[] = []
  private previousSelection?: string[]

  constructor(
    private context: CommandContext,
    private payload: ImportRecordingPayload
  ) {
    super({
      name: 'ImportRecording',
      description: `Import recording ${payload.recording.id}`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    return !!this.context.getProject()
  }

  doExecute(): CommandResult<{ clipId: string }> {
    const project = this.context.getProject()
    if (!project) {
      return { success: false, error: 'No active project' }
    }

    this.previousSelection = [...this.context.getSelectedClips()]
    this.addedEffectIds = []

    let newClip: Clip | null = null
    this.context.getStore().updateProjectData((draft) => {
      if (draft.recordings.some(r => r.id === this.payload.recording.id)) {
        return draft
      }

      newClip = addRecordingToProject(
        draft,
        this.payload.recording,
        { trackType: this.payload.trackType }
      )

      if (!newClip) return draft

      const sourceClip = this.payload.sourceClip
      const sourceEffects = this.payload.sourceEffects ?? []

      if (sourceClip && sourceEffects.length > 0) {
        if (!draft.timeline.effects) {
          draft.timeline.effects = []
        }

        const offsetMs = newClip.startTime - sourceClip.startTime
        const clipEnd = sourceClip.startTime + sourceClip.duration

        sourceEffects.forEach(effect => {
          const isZoomOrScreen = effect.type === EffectType.Zoom || effect.type === EffectType.Screen
          const isCropForClip = effect.type === EffectType.Crop && effect.clipId === sourceClip.id
          if (!isZoomOrScreen && !isCropForClip) return
          if (effect.endTime <= sourceClip.startTime || effect.startTime >= clipEnd) return

          const clonedEffect: Effect = {
            ...structuredClone(effect),
            id: `imported-${effect.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            startTime: effect.startTime + offsetMs,
            endTime: effect.endTime + offsetMs
          }

          if (isCropForClip) {
            clonedEffect.clipId = newClip!.id
          }

          draft.timeline.effects?.push(clonedEffect)
          this.addedEffectIds.push(clonedEffect.id)
        })
      }

      return draft
    })

    if (!newClip) {
      return { success: false, error: 'Failed to create clip' }
    }

    const createdClip = newClip as Clip
    this.clipId = createdClip.id
    this.recordingId = this.payload.recording.id
    this.context.getStore().selectClip(createdClip.id)

    return { success: true, data: { clipId: createdClip.id } }
  }

  doUndo(): CommandResult<{ clipId: string }> {
    const project = this.context.getProject()
    if (!project || !this.clipId || !this.recordingId) {
      return { success: false, error: 'No clip to undo' }
    }

    const clipId = this.clipId
    const recordingId = this.recordingId
    const addedEffectIds = new Set(this.addedEffectIds)

    this.context.getStore().updateProjectData((draft) => {
      if (draft.timeline.effects && addedEffectIds.size > 0) {
        draft.timeline.effects = draft.timeline.effects.filter(effect => !addedEffectIds.has(effect.id))
      }

      const clipInfo = findClipById(draft, clipId)
      if (clipInfo) {
        removeClipFromTrack(draft, clipId, clipInfo.track)
      }

      draft.recordings = draft.recordings.filter(r => r.id !== recordingId)

      return draft
    })

    ProjectCleanupService.cleanupClipResources(clipId)
    ProjectCleanupService.cleanupUnusedRecordings(project, recordingId)

    const store = this.context.getStore()
    store.clearSelection()
    if (this.previousSelection && this.previousSelection.length > 0) {
      const [first, ...rest] = this.previousSelection
      if (first) {
        store.selectClip(first)
        rest.forEach(id => store.selectClip(id, true))
      }
    }

    return { success: true, data: { clipId } }
  }
}
