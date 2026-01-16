/**
 * AddClipCommand - Add a clip to the timeline.
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { Clip, TrackType } from '@/types/project'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { addClipToTrack } from '@/features/ui/timeline/clips/clip-crud'

export class AddClipCommand extends TimelineCommand<{ clipId: string }> {
  private clipOrRecordingId: Clip | string
  private startTime?: number

  constructor(
    context: CommandContext,
    clipOrRecordingId: Clip | string,
    startTime?: number,
    private options?: { trackType?: TrackType }
  ) {
    super(context, {
      name: 'AddClip',
      description: 'Add clip to timeline',
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
      if (!recording) throw new Error(`Recording ${recordingId} not found`)

      clip = {
        id: `clip-${Date.now()}`,
        recordingId,
        startTime: this.startTime ?? project.timeline.duration,
        duration: recording.duration,
        sourceIn: 0,
        sourceOut: recording.duration
      }
    }

    const addedClip = addClipToTrack(project, clip, clip.startTime, { trackType: this.options?.trackType })
    if (!addedClip) throw new Error('Failed to add clip (no video track found)')

    // Set pending change for middleware
    this.setPendingChange(draft, this.buildAddChange(addedClip))

    this.selectClip(draft, addedClip.id)

    // Enable waveforms by default if the recording has audio
    const recording = project.recordings.find(r => r.id === addedClip.recordingId)
    if (recording?.hasAudio) {
      draft.settings.editing.showWaveforms = true
    }

    this.setResult({ success: true, data: { clipId: addedClip.id } })
  }
}
