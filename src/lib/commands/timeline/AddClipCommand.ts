/**
 * AddClipCommand - Add a clip to the timeline.
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import type { CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import { TrackType } from '@/types/project'

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

  doExecute(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    const project = this.context.getProject()
    if (!project) {
      return { success: false, error: 'No active project' }
    }

    let clip: Clip

    if (typeof this.clipOrRecordingId === 'object') {
      clip = this.clipOrRecordingId
    } else {
      const recording = this.context.findRecording(this.clipOrRecordingId)
      if (!recording) {
        return { success: false, error: `Recording ${this.clipOrRecordingId} not found` }
      }

      clip = {
        id: `clip-${Date.now()}`,
        recordingId: this.clipOrRecordingId,
        startTime: this.startTime ?? project.timeline.duration,
        duration: recording.duration,
        sourceIn: 0,
        sourceOut: recording.duration
      }
    }

    const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
    if (!videoTrack) {
      return { success: false, error: 'No video track found' }
    }

    store.addClip(clip, clip.startTime)
    this.createdClipId = clip.id

    return { success: true, data: { clipId: clip.id } }
  }
}
