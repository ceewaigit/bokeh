/**
 * TimelineCommand - Base class for clip timeline operations.
 *
 * Provides common helpers and automatic sync coordination:
 * - findClip(): Lookup clip by ID
 * - selectClip()/selectClips(): Update selection after operation
 * - clampPlayhead(): Keep playhead within valid bounds
 * - deferClipChange(): Queue a ClipChange for inline sync processing
 *
 * IMPORTANT: Sync happens INLINE within the same transaction (not via middleware).
 * This ensures sync changes are captured in Immer patches for proper undo/redo.
 */

import { WritableDraft } from 'immer'
import { PatchedCommand } from './PatchedCommand'
import { CommandContext } from './CommandContext'
import { CommandMetadata } from './Command'
import type { ProjectStore } from '@/features/core/stores/slices/types'
import type { Project, Clip, Track, TrackType } from '@/types/project'
import type { ClipChange, ClipState, SegmentMapping } from '@/features/effects/sync/types'
import { ClipChangeBuilder } from '@/features/effects/sync/clip-change-builder'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { ClipUtils } from '@/features/ui/timeline/time/clip-utils'
import { playbackService } from '@/features/playback/services/playback-service'
import { TimelineSyncOrchestrator } from '@/features/effects/sync'

export interface ClipLookupResult {
  clip: Clip
  track: Track
  index: number
}

export abstract class TimelineCommand<TResult = any> extends PatchedCommand<TResult> {
  /** Deferred clip change to be processed after doMutate() */
  private _deferredClipChange: ClipChange | null = null

  constructor(
    context: CommandContext,
    metadata: Partial<CommandMetadata> = {}
  ) {
    super(context, metadata)
  }

  /**
   * Subclasses must implement doMutate() to perform state changes.
   * After doMutate() returns, any deferred clip change is processed inline.
   */
  protected abstract doMutate(draft: WritableDraft<ProjectStore>): void

  /**
   * Template method: calls doMutate() then processes sync inline.
   * This ensures sync changes are captured in the same Immer transaction.
   */
  protected mutate(draft: WritableDraft<ProjectStore>): void {
    // Reset deferred change before each execution
    this._deferredClipChange = null

    // Execute subclass mutation logic
    this.doMutate(draft)

    // Process sync inline (same transaction = patches captured for undo/redo)
    if (this._deferredClipChange && draft.currentProject) {
      TimelineSyncOrchestrator.commit(draft.currentProject, this._deferredClipChange)
    }
  }

  /** Find a clip by ID in the project */
  protected findClip(project: Project, clipId: string): ClipLookupResult | null {
    const result = ClipLookup.byId(project, clipId)
    if (!result) return null
    const { clip, track } = result
    const index = track.clips.findIndex(c => c.id === clipId)
    return { clip, track, index }
  }

  /** Update selection to a single clip */
  protected selectClip(draft: WritableDraft<ProjectStore>, clipId: string): void {
    draft.selectedClips = [clipId]
  }

  /** Update selection to multiple clips */
  protected selectClips(draft: WritableDraft<ProjectStore>, clipIds: string[]): void {
    draft.selectedClips = clipIds
  }

  /** Clear clip selection */
  protected clearSelection(draft: WritableDraft<ProjectStore>): void {
    draft.selectedClips = []
  }

  /** Clamp playhead to valid timeline bounds */
  protected clampPlayhead(draft: WritableDraft<ProjectStore>): void {
    const project = draft.currentProject
    if (!project) return
    draft.currentTime = playbackService.seek(
      draft.currentTime,
      project.timeline.duration
    )
  }

  /** Build ClipState from a clip (delegates to ClipUtils) */
  protected buildClipState(clip: Clip): ClipState {
    return ClipUtils.buildState(clip)
  }

  /** Check if a clip exists in the current project (convenience for canExecute) */
  protected clipExists(clipId: string): boolean {
    return this.context.findClip(clipId) !== null
  }

  /**
   * Queue a clip change for inline sync processing.
   * The change is processed after doMutate() returns, within the same transaction.
   */
  protected deferClipChange(change: ClipChange): void {
    this._deferredClipChange = change
  }

  /** Build ClipChange for add operation. Delegates to ClipChangeBuilder. */
  protected buildAddChange(clip: Clip): ClipChange {
    return ClipChangeBuilder.buildAddChange(clip)
  }

  /** Build ClipChange for delete operation. Delegates to ClipChangeBuilder. */
  protected buildDeleteChange(clip: Clip): ClipChange {
    return ClipChangeBuilder.buildDeleteChange(clip)
  }

  /** Build ClipChange for trim-start operation. Delegates to ClipChangeBuilder. */
  protected buildTrimStartChange(
    clip: Clip,
    beforeState: ClipState,
    timelineDelta: number
  ): ClipChange {
    return ClipChangeBuilder.buildTrimStartChange(clip, beforeState, timelineDelta)
  }

  /** Build ClipChange for trim-end operation. Delegates to ClipChangeBuilder. */
  protected buildTrimEndChange(
    clip: Clip,
    beforeState: ClipState,
    timelineDelta: number
  ): ClipChange {
    return ClipChangeBuilder.buildTrimEndChange(clip, beforeState, timelineDelta)
  }

  /** Build ClipChange for split operation. Delegates to ClipChangeBuilder. */
  protected buildSplitChange(
    originalClip: Clip,
    beforeState: ClipState,
    firstClip: Clip,
    secondClip: Clip
  ): ClipChange {
    return ClipChangeBuilder.buildSplitChangeFromState(originalClip, beforeState, firstClip, secondClip)
  }

  /** Build ClipChange for update operation. Delegates to ClipChangeBuilder. */
  protected buildUpdateChange(
    clip: Clip,
    beforeState: ClipState,
    timelineDelta: number = 0
  ): ClipChange {
    return ClipChangeBuilder.buildUpdateChangeFromState(clip, beforeState, timelineDelta)
  }

  /** Build ClipChange for speed-up operation. Delegates to ClipChangeBuilder. */
  protected buildSpeedUpChange(
    clipId: string,
    recordingId: string,
    beforeState: ClipState,
    segmentMapping: SegmentMapping | null,
    sourceTrackType?: TrackType
  ): ClipChange {
    return ClipChangeBuilder.buildSpeedUpChange(clipId, recordingId, beforeState, segmentMapping, sourceTrackType)
  }
}
