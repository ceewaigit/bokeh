/**
 * AddClipCommand - Add a clip to the timeline.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/stores/project-store'
import { addClipToTrack } from '@/features/timeline/clips/clip-crud'
import { EffectInitialization } from '@/features/effects/core/initialization'

export class AddClipCommand extends PatchedCommand<{ clipId: string }> {
  private clipOrRecordingId: Clip | string
  private startTime?: number
  private createdClipId?: string

  constructor(
    context: CommandContext,
    clipOrRecordingId: Clip | string,
    startTime?: number
  ) {
    super(context, {
      name: 'AddClip',
      description: typeof clipOrRecordingId === 'string'
        ? `Add clip from recording ${clipOrRecordingId}`
        : `Add clip ${clipOrRecordingId.id}`,
      category: 'timeline'
    })
    this.clipOrRecordingId = clipOrRecordingId
    this.startTime = startTime
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    if (!project) return false

    if (typeof this.clipOrRecordingId === 'string') {
      return this.context.findRecording(this.clipOrRecordingId) !== null
    }
    return true
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    const project = draft.currentProject
    if (!project) throw new Error('No active project')

    let clip: Clip

    if (typeof this.clipOrRecordingId === 'object') {
      clip = this.clipOrRecordingId
    } else {
      const recordingId = this.clipOrRecordingId as string
      const recording = project.recordings.find(r => r.id === recordingId)
      if (!recording) {
        throw new Error(`Recording ${recordingId} not found`)
      }

      clip = {
        id: `clip-${Date.now()}`,
        recordingId: recordingId,
        startTime: this.startTime ?? project.timeline.duration,
        duration: recording.duration,
        sourceIn: 0,
        sourceOut: recording.duration
      }
    }

    const addedClip = addClipToTrack(project, clip, clip.startTime)
    if (!addedClip) {
      throw new Error('Failed to add clip (no video track found)')
    }

    // Logic from timeline-slice.ts:
    // Determine if we need to sync keystrokes (only if recording has metadata)
    const recordingId = addedClip.recordingId
    const recording = project.recordings.find(r => r.id === recordingId)

    if (recording && (recording.metadata?.keyboardEvents?.length || 0) > 0) {
      EffectInitialization.syncKeystrokeEffects(project)
    }

    draft.selectedClips = [addedClip.id]

    // Enable waveforms by default if the recording has audio
    if (recording?.hasAudio) {
      draft.settings.editing.showWaveforms = true
    }

    this.createdClipId = addedClip.id
    this.result = { success: true, data: { clipId: addedClip.id } }
  }
}
