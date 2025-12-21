import type { Project, Clip, Recording, Track } from '@/types/project'
import { findClipAtTimelinePosition } from '@/lib/timeline/time-space-converter'

export interface PlayheadState {
  playheadClip: Clip | null
  playheadRecording: Recording | null
  nextClip: Clip | null
  nextRecording: Recording | null
}

export class PlayheadService {
  private static readonly BOUNDARY_TOLERANCE_MS = 1
  private static readonly LOOKAHEAD_WINDOW_MS = 200
  static updatePlayheadState(
    project: Project | null,
    currentTime: number,
    prevState?: PlayheadState
  ): PlayheadState {
    const state: PlayheadState = {
      playheadClip: null,
      playheadRecording: null,
      nextClip: null,
      nextRecording: null
    }

    if (!project || currentTime === undefined) {
      return state
    }
    const currentClipResult = this.findClipAtTime(project, currentTime)
    if (currentClipResult) {
      state.playheadClip = currentClipResult.clip
      state.playheadRecording = project.recordings.find(
        r => r.id === currentClipResult.clip.recordingId
      ) || null
    }
    if (!state.playheadClip && prevState?.playheadClip) {
      const nearBoundary = this.isNearClipBoundary(
        project,
        currentTime,
        this.BOUNDARY_TOLERANCE_MS
      )
      if (nearBoundary) {
        // We're at a boundary - keep showing previous clip momentarily
        state.playheadClip = prevState.playheadClip
        state.playheadRecording = prevState.playheadRecording
      }
    }
    const nextClipResult = this.findNextClip(
      project,
      currentTime,
      this.LOOKAHEAD_WINDOW_MS
    )
    if (nextClipResult) {
      state.nextClip = nextClipResult.clip
      state.nextRecording = project.recordings.find(
        r => r.id === nextClipResult.clip.recordingId
      ) || null
    }

    return state
  }
  static findClipAtTime(project: Project, time: number): { clip: Clip; track: Track } | null {
    for (const track of project.timeline.tracks) {
      const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
      const clip = findClipAtTimelinePosition(time, sortedClips)

      if (clip) {
        return { clip, track }
      }
    }
    return null
  }
  static findNextClip(
    project: Project,
    currentTime: number,
    lookaheadMs: number
  ): { clip: Clip; track: Track } | null {
    let nearestClip: Clip | null = null
    let nearestTrack: Track | null = null
    let nearestStartTime = Number.MAX_SAFE_INTEGER

    for (const track of project.timeline.tracks) {
      const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
      for (const clip of sortedClips) {
        if (clip.startTime > currentTime &&
          clip.startTime <= currentTime + lookaheadMs) {
          if (clip.startTime < nearestStartTime) {
            nearestClip = clip
            nearestTrack = track
            nearestStartTime = clip.startTime
          }
        }
      }
    }

    if (nearestClip && nearestTrack) {
      return { clip: nearestClip, track: nearestTrack }
    }
    return null
  }
  static isNearClipBoundary(project: Project, time: number, tolerance: number): boolean {
    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        const distanceToStart = Math.abs(time - clip.startTime)
        const distanceToEnd = Math.abs(time - (clip.startTime + clip.duration))
        if (distanceToStart < tolerance || distanceToEnd < tolerance) {
          return true
        }
      }
    }
    return false
  }
  static calculateSourceTime(clip: Clip, timelineTime: number): number {
    const relativeTime = timelineTime - clip.startTime
    const playbackRate = clip.playbackRate || 1
    const sourceTime = (clip.sourceIn || 0) + (relativeTime * playbackRate)
    const sourceOut = clip.sourceOut || (clip.sourceIn + clip.duration * playbackRate)
    return Math.max(clip.sourceIn || 0, Math.min(sourceOut, sourceTime))
  }
  static trackPlayheadDuringClipEdit(
    currentTime: number,
    clip: Clip,
    updatedClip: Clip
  ): number | null {
    const prevStartTime = clip.startTime
    const prevDuration = clip.duration
    const wasPlayheadInside = currentTime >= prevStartTime && currentTime < prevStartTime + prevDuration

    if (!wasPlayheadInside) {
      return null
    }
    const prevProgress = prevDuration > 0 ? (currentTime - prevStartTime) / prevDuration : 0
    const newTime = updatedClip.startTime + prevProgress * updatedClip.duration
    return Math.max(
      updatedClip.startTime,
      Math.min(updatedClip.startTime + updatedClip.duration - 1, newTime)
    )
  }
  static clampToTimelineBounds(currentTime: number, duration: number): number {
    if (currentTime >= duration && duration > 0) {
      return Math.max(0, duration - 1)
    }
    return Math.max(0, currentTime)
  }
}
