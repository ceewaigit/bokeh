import { Command, CommandResult } from '../base/Command'
import { CommandContext, hasClipOverlap, findNextValidPosition, calculateTimelineDuration } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import { TrackType } from '@/types/project'

export class AddClipCommand extends Command<{ clipId: string }> {
  private clip?: Clip
  private previousSelection?: string[]
  private actualStartTime?: number

  constructor(
    private context: CommandContext,
    private clipOrRecordingId: Clip | string,
    private startTime?: number
  ) {
    super({
      name: 'AddClip',
      description: typeof clipOrRecordingId === 'string' 
        ? `Add clip from recording ${clipOrRecordingId}`
        : `Add clip ${clipOrRecordingId.id}`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    if (!project) return false

    // If it's a recording ID, check if recording exists
    if (typeof this.clipOrRecordingId === 'string') {
      const recording = this.context.findRecording(this.clipOrRecordingId)
      return recording !== null
    }

    return true
  }

  doExecute(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    const project = this.context.getProject()
    if (!project) {
      return {
        success: false,
        error: 'No active project'
      }
    }

    // Store previous selection
    this.previousSelection = [...this.context.getSelectedClips()]

    // Create or use provided clip
    if (typeof this.clipOrRecordingId === 'object') {
      this.clip = this.clipOrRecordingId
    } else {
      const recording = this.context.findRecording(this.clipOrRecordingId)
      if (!recording) {
        return {
          success: false,
          error: `Recording ${this.clipOrRecordingId} not found`
        }
      }

      this.clip = {
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
      return {
        success: false,
        error: 'No video track found'
      }
    }

    if (!this.clip) {
      return {
        success: false,
        error: 'Failed to create clip'
      }
    }

    // Don't auto-adjust positions - let the store handle overlap detection
    this.actualStartTime = this.clip.startTime

    // Add clip using store method
    store.addClip(this.clip, this.clip.startTime)

    return {
      success: true,
      data: { clipId: this.clip.id }
    }
  }

  doUndo(): CommandResult<{ clipId: string }> {
    if (!this.clip) {
      return {
        success: false,
        error: 'No clip to undo'
      }
    }

    const store = this.context.getStore()
    
    // Remove the clip
    store.removeClip(this.clip.id)

    // Restore previous selection
    if (this.previousSelection) {
      this.previousSelection.forEach(clipId => {
        store.selectClip(clipId, true)
      })
    }

    return {
      success: true,
      data: { clipId: this.clip.id }
    }
  }

  doRedo(): CommandResult<{ clipId: string }> {
    if (!this.clip) {
      return {
        success: false,
        error: 'No clip to redo'
      }
    }

    const store = this.context.getStore()
    
    // Re-add the clip with the previously calculated position
    if (this.actualStartTime !== undefined) {
      this.clip.startTime = this.actualStartTime
    }
    
    store.addClip(this.clip, this.clip.startTime)

    return {
      success: true,
      data: { clipId: this.clip.id }
    }
  }
}