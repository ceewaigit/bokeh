/**
 * TimelineDataService
 *
 * Single source of truth for timeline-derived data.
 * Replaces duplicated computation in:
 * - TimelineComposition (lines 107-120)
 * - SharedVideoController (lines 94-120)
 * - workspace-manager.tsx (lines 77-82)
 * - toolbar.tsx (lines 445-452)
 * - useTimelineMetadata.ts
 *
 * Design: Static methods with optional caching for expensive operations.
 */

import type { Project, Clip, Recording, Effect } from '@/types/project'
import { TrackType } from '@/types/project'
import { buildFrameLayout, type FrameLayoutItem } from '@/features/timeline/utils/frame-layout'
import { ClipLookup } from '@/features/timeline/clips/clip-lookup'
import { EffectStore } from '@/lib/core/effects'

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
   * Build the frame layout for video playback.
   * This is NOT cached because fps can vary and layout depends on sorted clips.
   */
  static getFrameLayout(project: Project, fps: number): FrameLayoutItem[] {
    const sortedClips = this.getSortedVideoClips(project)
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
   */
  static getActiveEffectsFromCache(key: string): Effect[] | undefined {
    return this.activeEffectsCache.get(key)
  }

  /**
   * Set cached active effects for a clip position.
   */
  static setActiveEffectsCache(key: string, effects: Effect[]): void {
    this.activeEffectsCache.set(key, effects)
    // Prune cache to prevent unbounded growth
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
}
