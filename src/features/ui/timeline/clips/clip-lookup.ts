/**
 * ClipLookup Utility
 *
 * Single source of truth for clip finding operations.
 * Replaces duplicated findClipById implementations in:
 * - timeline-operations.ts
 * - playhead-service.ts
 * - time-space-converter.ts
 *
 * Design: Fail-fast - returns null for not found, callers must handle.
 */

import type { Project, Track, Clip, Recording } from '@/types/project'
import { TrackType } from '@/types/project'
import { TimeRange } from '../time/time-range'

export interface ClipResult {
  clip: Clip
  track: Track
  trackIndex: number
}

export interface ClipWithRecording extends ClipResult {
  recording: Recording | undefined
}

/**
 * ClipLookup - centralized clip finding operations.
 */
export const ClipLookup = {
  /**
   * Find a clip by ID across all tracks.
   * Returns null if not found - caller must handle.
   */
  byId(project: Project, clipId: string): ClipResult | null {
    const tracks = project.timeline.tracks
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        return { clip, track, trackIndex: i }
      }
    }
    return null
  },

  /**
   * Find a clip by ID and assert it exists.
   * Throws if not found - use when clip MUST exist.
   */
  byIdOrThrow(project: Project, clipId: string): ClipResult {
    const result = ClipLookup.byId(project, clipId)
    if (!result) {
      throw new Error(`[ClipLookup] Clip "${clipId}" not found - this is a bug`)
    }
    return result
  },

  /**
   * Find the first clip that contains a specific timeline time.
   * Uses TimeRange.contains semantics (inclusive start, exclusive end).
   */
  atTime(project: Project, timeMs: number): ClipResult | null {
    const tracks = project.timeline.tracks
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      for (const clip of track.clips) {
        const range = TimeRange.fromClip(clip)
        if (TimeRange.contains(range, timeMs)) {
          return { clip, track, trackIndex: i }
        }
      }
    }
    return null
  },

  /**
   * Find clip at time in a specific track type.
   */
  atTimeInTrack(project: Project, timeMs: number, trackType: TrackType): ClipResult | null {
    const tracks = project.timeline.tracks
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      if (track.type !== trackType) continue
      for (const clip of track.clips) {
        const range = TimeRange.fromClip(clip)
        if (TimeRange.contains(range, timeMs)) {
          return { clip, track, trackIndex: i }
        }
      }
    }
    return null
  },

  /**
   * Get all clips of a specific track type.
   */
  byTrackType(project: Project, type: TrackType): Clip[] {
    return project.timeline.tracks
      .filter(t => t.type === type)
      .flatMap(t => t.clips)
  },

  /**
   * Get all video clips (convenience method).
   */
  videoClips(project: Project): Clip[] {
    return ClipLookup.byTrackType(project, TrackType.Video)
  },

  /**
   * Get all audio clips (convenience method).
   */
  audioClips(project: Project): Clip[] {
    return ClipLookup.byTrackType(project, TrackType.Audio)
  },

  /**
   * Get video clips sorted by start time.
   * Used for frame layout building.
   */
  sortedVideoClips(project: Project): Clip[] {
    return [...ClipLookup.videoClips(project)].sort((a, b) => a.startTime - b.startTime)
  },

  /**
   * Get audio clips sorted by start time.
   */
  sortedAudioClips(project: Project): Clip[] {
    return [...ClipLookup.audioClips(project)].sort((a, b) => a.startTime - b.startTime)
  },

  /**
   * Find clip by ID with its associated recording.
   */
  withRecording(project: Project, clipId: string): ClipWithRecording | null {
    const result = ClipLookup.byId(project, clipId)
    if (!result) return null
    const recording = project.recordings.find(r => r.id === result.clip.recordingId)
    return { ...result, recording }
  },

  /**
   * Get all clips that overlap with a time range.
   */
  inTimeRange(project: Project, startTime: number, endTime: number): ClipResult[] {
    const range = TimeRange.create(startTime, endTime)
    const results: ClipResult[] = []
    const tracks = project.timeline.tracks

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      for (const clip of track.clips) {
        const clipRange = TimeRange.fromClip(clip)
        if (TimeRange.overlaps(range, clipRange)) {
          results.push({ clip, track, trackIndex: i })
        }
      }
    }
    return results
  },

  /**
   * Get the track that contains the specified clip.
   */
  trackForClip(project: Project, clipId: string): Track | null {
    const result = ClipLookup.byId(project, clipId)
    return result?.track ?? null
  },

  /**
   * Check if a clip exists.
   */
  exists(project: Project, clipId: string): boolean {
    return ClipLookup.byId(project, clipId) !== null
  }
}
