import type { Project, Clip, Track, Recording } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import type { ProjectStore, ClipboardEffect } from '@/types/stores'

export interface CommandContext {
  getProject(): Project | null
  getCurrentTime(): number
  getSelectedClips(): string[]
  getSelectedEffectLayer(): SelectedEffectLayer
  getClipboard(): {
    clip?: Clip
    effect?: ClipboardEffect
  }

  findClip(clipId: string): { clip: Clip; track: Track } | null
  findRecording(recordingId: string): Recording | null

  getStore(): ProjectStore
}

type ProjectStoreAccessor = { getState: () => ProjectStore }

export class DefaultCommandContext implements CommandContext {
  constructor(private storeOrAccessor: ProjectStore | ProjectStoreAccessor) { }

  private getState(): ProjectStore {
    if (typeof (this.storeOrAccessor as ProjectStoreAccessor).getState === 'function') {
      return (this.storeOrAccessor as ProjectStoreAccessor).getState()
    }
    return this.storeOrAccessor as ProjectStore
  }

  getProject(): Project | null {
    return this.getState().currentProject
  }

  getCurrentTime(): number {
    return this.getState().currentTime
  }

  getSelectedClips(): string[] {
    return this.getState().selectedClips
  }

  getSelectedEffectLayer() {
    return this.getState().selectedEffectLayer
  }

  getClipboard() {
    return this.getState().clipboard
  }

  findClip(clipId: string): { clip: Clip; track: Track } | null {
    const project = this.getProject()
    if (!project) return null

    for (const track of project.timeline.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) return { clip, track }
    }
    return null
  }

  findRecording(recordingId: string): Recording | null {
    const project = this.getProject()
    if (!project) return null

    return project.recordings.find(r => r.id === recordingId) || null
  }

  getStore(): ProjectStore {
    return this.getState()
  }
}

export function hasClipOverlap(
  track: Track,
  clipId: string,
  startTime: number,
  duration: number
): boolean {
  return track.clips.some(clip => {
    if (clip.id === clipId) return false
    const clipEnd = clip.startTime + clip.duration
    return startTime < clipEnd && (startTime + duration) > clip.startTime
  })
}

export function findNextValidPosition(
  track: Track,
  clipId: string,
  desiredStart: number,
  duration: number
): number {
  const GAP_BETWEEN_CLIPS = 0 // enforce contiguous layout by default
  const otherClips = track.clips
    .filter(c => c.id !== clipId)
    .sort((a, b) => a.startTime - b.startTime)

  let proposedStart = desiredStart
  for (const other of otherClips) {
    const otherEnd = other.startTime + other.duration
    // If overlap, move proposed start to after the other clip with no gap
    if (proposedStart < otherEnd && (proposedStart + duration) > other.startTime) {
      proposedStart = otherEnd + GAP_BETWEEN_CLIPS
    }
  }

  // Ensure start is not negative
  return Math.max(0, proposedStart)
}

// Re-export calculateTimelineDuration from timeline-operations for backward compatibility
export { calculateTimelineDuration } from '@/lib/timeline/timeline-operations'
