import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import { timelineToClipRelative } from '@/lib/timeline/time-space-converter'

export interface SplitClipResult {
  originalClipId: string
  leftClipId: string
  rightClipId: string
}

export class SplitClipCommand extends Command<SplitClipResult> {
  private originalClip?: Clip
  private leftClip?: Clip
  private rightClip?: Clip
  private leftClipSnapshot?: Clip
  private rightClipSnapshot?: Clip
  private trackId?: string
  private originalIndex?: number

  constructor(
    private context: CommandContext,
    private clipId: string,
    private splitTime: number
  ) {
    super({
      name: 'SplitClip',
      description: `Split clip ${clipId} at ${splitTime}ms`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false

    const { clip } = result
    // Convert timeline position to clip-relative time properly
    const relativeTime = timelineToClipRelative(this.splitTime, clip)

    // Can only split within clip bounds
    return relativeTime > 0 && relativeTime < clip.duration
  }

  doExecute(): CommandResult<SplitClipResult> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)

    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    const { clip, track } = result
    this.trackId = track.id
    this.originalIndex = track.clips.findIndex(c => c.id === this.clipId)

    // Store original clip
    this.originalClip = JSON.parse(JSON.stringify(clip))

    // Execute split using store method
    store.splitClip(this.clipId, this.splitTime)

    // IMPORTANT: Re-read project after store mutation; references captured before `set()` can be stale.
    const updatedProject = this.context.getProject()
    if (updatedProject && this.trackId && this.originalIndex !== undefined) {
      const updatedTrack = updatedProject.timeline.tracks.find(t => t.id === this.trackId)

      if (updatedTrack) {
        const candidateLeft = updatedTrack.clips[this.originalIndex]
        const candidateRight = updatedTrack.clips[this.originalIndex + 1]

        // Most common case: split inserts two clips at original index.
        if (candidateLeft && candidateRight) {
          this.leftClip = candidateLeft
          this.rightClip = candidateRight
        } else if (this.originalClip) {
          // Fallback: locate by expected timeline positions.
          const left = updatedTrack.clips.find(c =>
            c.recordingId === this.originalClip!.recordingId &&
            c.startTime === this.originalClip!.startTime
          )
          const right = updatedTrack.clips.find(c =>
            c.recordingId === this.originalClip!.recordingId &&
            c.startTime === this.splitTime
          )
          if (left) this.leftClip = left
          if (right) this.rightClip = right
        }
      }
    }

    if (this.leftClip) this.leftClipSnapshot = JSON.parse(JSON.stringify(this.leftClip))
    if (this.rightClip) this.rightClipSnapshot = JSON.parse(JSON.stringify(this.rightClip))

    return {
      success: true,
      data: {
        originalClipId: this.clipId,
        leftClipId: this.leftClip?.id || '',
        rightClipId: this.rightClip?.id || ''
      }
    }
  }

  doUndo(): CommandResult<SplitClipResult> {
    if (!this.originalClip || !this.trackId) {
      return {
        success: false,
        error: 'Cannot undo: missing original clip data'
      }
    }

    const store = this.context.getStore()
    const project = this.context.getProject()
    
    if (!project) {
      return {
        success: false,
        error: 'No active project'
      }
    }

    const track = project.timeline.tracks.find(t => t.id === this.trackId)
    if (!track) {
      return {
        success: false,
        error: 'Track no longer exists'
      }
    }

    // Note: Effects are stored on Recording in source space, no effect restoration needed

    // Determine the insertion index based on current left split clip position
    let insertIndex = this.originalIndex ?? 0
    if (this.leftClip) {
      const leftIndex = track.clips.findIndex(c => c.id === this.leftClip!.id)
      if (leftIndex !== -1) insertIndex = leftIndex
    }

    // Remove split clips via store to ensure state updates (guard against missing/stale references)
    if (this.leftClip?.id && this.context.findClip(this.leftClip.id)) {
      store.removeClip(this.leftClip.id)
    }
    if (this.rightClip?.id && this.context.findClip(this.rightClip.id)) {
      store.removeClip(this.rightClip.id)
    }

    // Restore original clip at the original index via store API
    store.restoreClip(this.trackId, this.originalClip, insertIndex)

    // Restore selection
    store.selectClip(this.originalClip.id)

    return {
      success: true,
      data: {
        originalClipId: this.originalClip.id,
        leftClipId: this.leftClip?.id || '',
        rightClipId: this.rightClip?.id || ''
      }
    }
  }

  doRedo(): CommandResult<SplitClipResult> {
    if (!this.leftClipSnapshot || !this.rightClipSnapshot || !this.trackId) {
      return {
        success: false,
        error: 'Cannot redo: missing split clip data'
      }
    }

    const project = this.context.getProject()
    if (!project) {
      return {
        success: false,
        error: 'No active project'
      }
    }

    const track = project.timeline.tracks.find(t => t.id === this.trackId)
    if (!track) {
      return {
        success: false,
        error: 'Track no longer exists'
      }
    }

    const store = this.context.getStore()

    // Note: Effects are stored on Recording in source space, no effect restoration needed

    // Find where the original clip currently is and remove it
    const originalIndex = track.clips.findIndex(c => c.id === this.clipId)
    if (originalIndex !== -1) {
      store.removeClip(this.clipId)
    }

    // Re-insert split clips at the original position via store API
    const insertIndex = originalIndex === -1 ? (this.originalIndex ?? 0) : originalIndex
    store.restoreClip(this.trackId, JSON.parse(JSON.stringify(this.leftClipSnapshot)), insertIndex)
    store.restoreClip(this.trackId, JSON.parse(JSON.stringify(this.rightClipSnapshot)), insertIndex + 1)

    // Select the left clip
    store.selectClip(this.leftClipSnapshot.id)

    return {
      success: true,
      data: {
        originalClipId: this.clipId,
        leftClipId: this.leftClipSnapshot.id,
        rightClipId: this.rightClipSnapshot.id
      }
    }
  }
}
