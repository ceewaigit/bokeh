/**
 * TimelineDataService
 *
 * Single source of truth for timeline-derived data.
 *
 * Design: Static methods with optional caching for expensive operations.
 */

import type { Project, Clip, Recording, Effect, SourceTimeRange } from '@/types/project'
import { TrackType } from '@/types/project'
import type { GlobalSkipRange } from '@/types/skip-ranges'
export type { GlobalSkipRange } from '@/types/skip-ranges'
import { sourceToTimeline } from '@/features/ui/timeline/time/time-space-converter'
import { buildFrameLayout, type FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { EffectStore } from '@/features/effects/core/effects-store'

/**
 * Cached timeline data structure.
 * Used to avoid recomputing expensive derived data.
 */
export interface TimelineData {
  // Clips
  videoClips: Clip[]
  audioClips: Clip[]
  webcamClips: Clip[]
  sortedVideoClips: Clip[]
  sortedAudioClips: Clip[]

  // Recordings
  recordingsMap: Map<string, Recording>

  // Frame layout (requires fps)
  frameLayout: FrameLayoutItem[]

  // Effects
  effects: Effect[]

  // Computed values
  duration: number
  fps: number
}

/**
 * TimelineDataService - centralized timeline data computation.
 *
 * All methods are static and pure (no side effects).
 * Caching is handled via WeakMap keyed by project reference.
 */
export class TimelineDataService {
  // Cache for recordings map (cheap to cache, frequently accessed)
  private static recordingsMapCache = new WeakMap<Project, Map<string, Recording>>()

  // Cache for sorted clips (cheap, frequently accessed)
  private static sortedClipsCache = new WeakMap<Project, { video: Clip[]; audio: Clip[] }>()

  // Cache for active effects at clip positions (was orphaned in get-active-clip-data-at-frame.ts)
  // Key: `{clipId}-{startTime}`, Value: effects array for that clip position
  private static activeEffectsCache = new Map<string, Effect[]>()

  /**
   * Get all video clips from the project.
   */
  static getVideoClips(project: Project): Clip[] {
    return ClipLookup.videoClips(project)
  }

  /**
   * Get all audio clips from the project.
   */
  static getAudioClips(project: Project): Clip[] {
    return ClipLookup.audioClips(project)
  }

  /**
   * Get all webcam clips from the project.
   */
  static getWebcamClips(project: Project): Clip[] {
    return ClipLookup.byTrackType(project, TrackType.Webcam)
  }

  /**
   * Get video clips sorted by start time.
   * Cached per project reference.
   */
  static getSortedVideoClips(project: Project): Clip[] {
    const cached = this.sortedClipsCache.get(project)
    if (cached) return cached.video

    const sorted = ClipLookup.sortedVideoClips(project)
    const audioSorted = ClipLookup.sortedAudioClips(project)
    this.sortedClipsCache.set(project, { video: sorted, audio: audioSorted })
    return sorted
  }

  /**
   * Get audio clips sorted by start time.
   * Cached per project reference.
   */
  static getSortedAudioClips(project: Project): Clip[] {
    const cached = this.sortedClipsCache.get(project)
    if (cached) return cached.audio

    const videoSorted = ClipLookup.sortedVideoClips(project)
    const sorted = ClipLookup.sortedAudioClips(project)
    this.sortedClipsCache.set(project, { video: videoSorted, audio: sorted })
    return sorted
  }

  /**
   * Get recordings as a Map for O(1) lookup.
   * Cached per project reference.
   */
  static getRecordingsMap(project: Project): Map<string, Recording> {
    const cached = this.recordingsMapCache.get(project)
    if (cached) return cached

    const map = new Map(project.recordings.map(r => [r.id, r]))
    this.recordingsMapCache.set(project, map)
    return map
  }

  /**
   * Get a recording by ID.
   * Returns undefined if not found.
   */
  static getRecording(project: Project, recordingId: string): Recording | undefined {
    return this.getRecordingsMap(project).get(recordingId)
  }

  /**
   * Get the timeline range (start/end) spanned by all clips for a recording.
   */
  static getRecordingTimelineRange(
    project: Project,
    recordingId: string
  ): { start: number; end: number } | null {
    const clips = project.timeline.tracks.flatMap(track => track.clips)
      .filter(clip => clip.recordingId === recordingId)

    if (clips.length === 0) return null

    const start = Math.min(...clips.map(clip => clip.startTime))
    const end = Math.max(...clips.map(clip => clip.startTime + clip.duration))
    return { start, end }
  }

  /**
   * Build the frame layout for video playback.
   * This is NOT cached because fps can vary and layout depends on sorted clips.
   */
  static getFrameLayout(project: Project, fps: number, clipsOverride?: Clip[]): FrameLayoutItem[] {
    const sortedClips = clipsOverride
      ? [...clipsOverride].sort((a, b) => a.startTime - b.startTime)
      : this.getSortedVideoClips(project)
    const recordingsMap = this.getRecordingsMap(project)
    return buildFrameLayout(sortedClips, fps, recordingsMap)
  }

  /**
   * Get all effects from the project.
   * Uses EffectStore as the single source of truth.
   */
  static getEffects(project: Project): Effect[] {
    return EffectStore.getAll(project)
  }

  /**
   * Get the timeline duration in milliseconds.
   */
  static getDuration(project: Project): number {
    return project.timeline?.duration ?? 0
  }

  /**
   * Get the project's frame rate.
   */
  static getFps(project: Project): number {
    return project.settings.frameRate
  }

  /**
   * Get complete timeline data bundle.
   * Useful when multiple pieces of data are needed together.
   */
  static getTimelineData(project: Project): TimelineData {
    const fps = this.getFps(project)
    return {
      videoClips: this.getVideoClips(project),
      audioClips: this.getAudioClips(project),
      webcamClips: this.getWebcamClips(project),
      sortedVideoClips: this.getSortedVideoClips(project),
      sortedAudioClips: this.getSortedAudioClips(project),
      recordingsMap: this.getRecordingsMap(project),
      frameLayout: this.getFrameLayout(project, fps),
      effects: this.getEffects(project),
      duration: this.getDuration(project),
      fps
    }
  }

  /**
   * Invalidate caches for a project.
   * Call this when project data changes (clips added/removed, recordings change, split, trim).
   */
  static invalidateCache(project: Project): void {
    this.recordingsMapCache.delete(project)
    this.sortedClipsCache.delete(project)
    // Clear global caches that depend on clip structure
    this.activeEffectsCache.clear()
  }

  /**
   * Get cached active effects for a clip position.
   * Used by get-active-clip-data-at-frame.ts for render optimization.
   * Updates LRU order on access.
   */
  static getActiveEffectsFromCache(key: string): Effect[] | undefined {
    const cached = this.activeEffectsCache.get(key)
    if (cached !== undefined) {
      // LRU: Move to end (most recently used) by re-inserting
      this.activeEffectsCache.delete(key)
      this.activeEffectsCache.set(key, cached)
    }
    return cached
  }

  /**
   * Set cached active effects for a clip position.
   * Uses LRU eviction - removes least recently used entries when at capacity.
   */
  static setActiveEffectsCache(key: string, effects: Effect[]): void {
    // If key exists, delete first to update LRU order
    if (this.activeEffectsCache.has(key)) {
      this.activeEffectsCache.delete(key)
    }
    this.activeEffectsCache.set(key, effects)
    // Prune cache using LRU - first key is least recently used
    if (this.activeEffectsCache.size > 100) {
      const keyToDelete = this.activeEffectsCache.keys().next().value
      if (keyToDelete) this.activeEffectsCache.delete(keyToDelete)
    }
  }

  /**
   * Get source dimensions from the first recording.
   * Logs warning if falling back to default dimensions.
   */
  static getSourceDimensions(project: Project): { width: number; height: number } {
    const firstRecording = project.recordings[0]
    if (firstRecording?.width && firstRecording?.height) {
      return {
        width: firstRecording.width,
        height: firstRecording.height
      }
    }
    // Fallback with visibility - helps identify data issues
    console.warn('[TimelineDataService] No recording with valid dimensions, using 1920x1080 default')
    return { width: 1920, height: 1080 }
  }

  /**
   * Check if project has any video content.
   */
  static hasVideoContent(project: Project): boolean {
    return this.getVideoClips(project).length > 0
  }

  /**
   * Check if project has any audio content.
   */
  static hasAudioContent(project: Project): boolean {
    return this.getAudioClips(project).length > 0
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Global Timeline Skips - "Global Mask" Architecture
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cache for global skip ranges.
   * Key: Project reference (relies on Immer immutability)
   * Value: computed skip ranges
   */
  private static skipRangesCache = new WeakMap<Project, GlobalSkipRange[]>()

  /**
   * Get global timeline skip ranges for the entire project.
   * 
   * This is the core of the "Timeline-Centric" architecture:
   * - Hidden regions are stored in SOURCE SPACE (per recording)
   * - We dynamically PROJECT them to TIMELINE SPACE based on each clip's position
   * - The result is a "Global Mask" that the player uses to skip during playback
   * 
   * @param project - The project to compute skip ranges for
   * @returns Array of skip ranges in timeline space, sorted by start time
   */
  static getGlobalTimelineSkips(project: Project): GlobalSkipRange[] {
    // Check cache first (relying on Immer producing new references for changes)
    const cached = this.skipRangesCache.get(project)
    if (cached) {
      return cached
    }

    // Compute fresh skip ranges
    const ranges = this.computeGlobalTimelineSkips(project)

    // Cache the result
    this.skipRangesCache.set(project, ranges)

    return ranges
  }

  /**
   * Core computation of global skip ranges.
   * Projects source-space hidden regions to timeline-space.
   */
  private static computeGlobalTimelineSkips(project: Project): GlobalSkipRange[] {
    const transcriptEdits = project.timeline.transcriptEdits
    if (!transcriptEdits || Object.keys(transcriptEdits).length === 0) {
      return []
    }

    const projectedRanges: GlobalSkipRange[] = []

    // Collect all clips from all tracks
    const allClips = project.timeline.tracks.flatMap(track => track.clips)

    for (const clip of allClips) {
      // Only process edits for active clips
      // This implicitly handles "orphaned" edits because we iterate over CLIPS, not EDITS.
      // If a recording has edits but no clips, it won't be processed here.
      const hiddenRegions = this.getHiddenRegionsForRecording(project, clip.recordingId)
      if (hiddenRegions.length === 0) continue

      for (const region of hiddenRegions) {
        const projected = this.projectSourceRangeToTimeline(region, clip)
        if (projected) {
          projectedRanges.push({
            ...projected,
            clipId: clip.id,
            recordingId: clip.recordingId
          })
        }
      }
    }

    // Merge overlapping ranges and sort
    return this.mergeAndSortSkipRanges(projectedRanges)
  }

  /**
   * Project a source-space range to timeline-space for a given clip.
   * Returns null if the range doesn't overlap with the clip's source window.
   * 
   * FORMULA:
   *   offset = Clip.startTime - Clip.sourceIn
   *   timelineStart = max(Clip.startTime, Range.start + offset)
   *   timelineEnd = min(Clip.endTime, Range.end + offset)
   */
  public static projectSourceRangeToTimeline(
    sourceRange: SourceTimeRange,
    clip: Clip
  ): { start: number; end: number } | null {
    const clipSourceIn = clip.sourceIn ?? 0
    const clipSourceOut = clip.sourceOut ?? (clipSourceIn + (clip.duration * (clip.playbackRate ?? 1)))

    // Check if range overlaps with clip's source window
    if (sourceRange.endTime <= clipSourceIn || sourceRange.startTime >= clipSourceOut) {
      return null // No overlap
    }

    // Clamp range to clip's source window
    const clampedSourceStart = Math.max(sourceRange.startTime, clipSourceIn)
    const clampedSourceEnd = Math.min(sourceRange.endTime, clipSourceOut)

    if (clampedSourceEnd <= clampedSourceStart) {
      return null
    }

    // Project to timeline using sourceToTimeline (accounts for playback rate)
    const timelineStart = sourceToTimeline(clampedSourceStart, clip)
    const timelineEnd = sourceToTimeline(clampedSourceEnd, clip)

    // Clamp to clip bounds on timeline
    const clipEnd = clip.startTime + clip.duration
    const finalStart = Math.max(clip.startTime, Math.min(timelineStart, timelineEnd))
    const finalEnd = Math.min(clipEnd, Math.max(timelineStart, timelineEnd))

    if (finalEnd <= finalStart) {
      return null
    }

    return { start: finalStart, end: finalEnd }
  }

  /**
   * Get hidden regions from edit state object.
   * Useful for components that select editState directly to avoid selector loops.
   */
  static getHiddenRegionsFromEditState(
    editState: any,
    recording?: Recording
  ): SourceTimeRange[] {
    if (!editState) return []

    if (editState.hiddenRegions?.length) {
      return this.normalizeRanges(editState.hiddenRegions)
    }

    // Legacy migration: keptRegions → hiddenRegions
    if (editState.keptRegions?.length) {
      const duration = recording?.duration ?? 0
      return this.subtractFromFullRange(duration, editState.keptRegions)
    }

    return []
  }

  /**
   * Get hidden regions for a recording from transcriptEdits.
   * This duplicates logic from hidden-regions.ts for now, will be the single source of truth later.
   */
  static getHiddenRegionsForRecording(
    project: Project,
    recordingId: string
  ): SourceTimeRange[] {
    const editState = project.timeline.transcriptEdits?.[recordingId]
    const recording = project.recordings.find(r => r.id === recordingId)
    return this.getHiddenRegionsFromEditState(editState, recording)
  }

  /**
   * Normalize and merge overlapping ranges.
   */
  private static normalizeRanges(ranges: SourceTimeRange[]): SourceTimeRange[] {
    const MIN_RANGE_MS = 1

    const sanitized = ranges
      .filter(r => Number.isFinite(r.startTime) && Number.isFinite(r.endTime))
      .map(r => ({
        startTime: Math.max(0, r.startTime),
        endTime: Math.max(0, r.endTime)
      }))
      .filter(r => r.endTime - r.startTime >= MIN_RANGE_MS)

    if (sanitized.length === 0) return []

    const sorted = [...sanitized].sort((a, b) => a.startTime - b.startTime)
    const merged: SourceTimeRange[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const last = merged[merged.length - 1]
      if (current.startTime <= last.endTime) {
        last.endTime = Math.max(last.endTime, current.endTime)
      } else {
        merged.push({ ...current })
      }
    }

    return merged
  }

  /**
   * Legacy: convert keptRegions to hiddenRegions by subtracting from full duration.
   */
  private static subtractFromFullRange(
    duration: number,
    keptRegions: SourceTimeRange[]
  ): SourceTimeRange[] {
    if (duration <= 0) return []

    const kept = this.normalizeRanges(keptRegions)
    if (kept.length === 0) return [{ startTime: 0, endTime: duration }]

    const hidden: SourceTimeRange[] = []
    let cursor = 0

    for (const region of kept) {
      if (cursor < region.startTime) {
        hidden.push({ startTime: cursor, endTime: region.startTime })
      }
      cursor = Math.max(cursor, region.endTime)
    }

    if (cursor < duration) {
      hidden.push({ startTime: cursor, endTime: duration })
    }

    return hidden
  }

  /**
   * Merge overlapping skip ranges and sort by start time.
   */
  private static mergeAndSortSkipRanges(ranges: GlobalSkipRange[]): GlobalSkipRange[] {
    if (ranges.length === 0) return []

    // Sort by start time
    const sorted = [...ranges].sort((a, b) => a.start - b.start)

    const merged: GlobalSkipRange[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const last = merged[merged.length - 1]

      // Merge if overlapping or adjacent (within 1ms)
      if (current.start <= last.end + 1) {
        last.end = Math.max(last.end, current.end)
        // Keep metadata from longer range
        if (current.end > last.end) {
          last.clipId = current.clipId
          last.recordingId = current.recordingId
        }
      } else {
        merged.push({ ...current })
      }
    }

    return merged
  }

  /**
   * Binary search to find if a time falls within a skip range.
   * O(log K) where K is the number of skip ranges.
   * 
   * @param timeMs - Timeline time to check
   * @param skipRanges - Sorted array of skip ranges
   * @returns The skip range containing the time, or null if not in a skip
   */
  static findSkipRangeAtTime(
    timeMs: number,
    skipRanges: GlobalSkipRange[]
  ): GlobalSkipRange | null {
    if (skipRanges.length === 0) return null

    let left = 0
    let right = skipRanges.length - 1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const range = skipRanges[mid]

      if (timeMs >= range.start && timeMs < range.end) {
        return range
      } else if (timeMs < range.start) {
        right = mid - 1
      } else {
        left = mid + 1
      }
    }

    return null
  }

  /**
   * Check if a timeline time is within a skip range.
   * Convenience wrapper around findSkipRangeAtTime.
   */
  static isTimeInSkipRange(timeMs: number, skipRanges: GlobalSkipRange[]): boolean {
    return this.findSkipRangeAtTime(timeMs, skipRanges) !== null
  }

  /**
   * Find the next skip range after a given time.
   * Useful for knowing when to start skipping during playback.
   */
  static findNextSkipRange(
    timeMs: number,
    skipRanges: GlobalSkipRange[]
  ): GlobalSkipRange | null {
    if (skipRanges.length === 0) return null

    // Binary search for first range that starts after timeMs
    let left = 0
    let right = skipRanges.length

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      if (skipRanges[mid].start <= timeMs) {
        left = mid + 1
      } else {
        right = mid
      }
    }

    return left < skipRanges.length ? skipRanges[left] : null
  }
}
