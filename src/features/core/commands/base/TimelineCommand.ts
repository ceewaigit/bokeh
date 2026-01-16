/**
 * TimelineCommand - Base class for clip timeline operations.
 *
 * Provides common helpers and automatic sync coordination:
 * - findClip(): Lookup clip by ID
 * - selectClip()/selectClips(): Update selection after operation
 * - clampPlayhead(): Keep playhead within valid bounds
 * - buildClipChange(): Build ClipChange for middleware sync
 */

import { WritableDraft } from 'immer'
import { PatchedCommand } from './PatchedCommand'
import { CommandContext } from './CommandContext'
import { CommandMetadata } from './Command'
import type { ProjectStore } from '@/features/core/stores/slices/types'
import type { Project, Clip, Track } from '@/types/project'
import type { ClipChange, ClipState } from '@/features/effects/sync/types'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { playbackService } from '@/features/playback/services/playback-service'

export interface ClipLookupResult {
  clip: Clip
  track: Track
  index: number
}

export abstract class TimelineCommand<TResult = any> extends PatchedCommand<TResult> {
  constructor(
    context: CommandContext,
    metadata: Partial<CommandMetadata> = {}
  ) {
    super(context, metadata)
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

  /** Build ClipState from a clip */
  protected buildClipState(clip: Clip): ClipState {
    return {
      startTime: clip.startTime,
      endTime: clip.startTime + clip.duration,
      playbackRate: clip.playbackRate ?? 1,
      sourceIn: clip.sourceIn ?? 0,
      sourceOut: clip.sourceOut ?? clip.duration
    }
  }

  /** Set pending clip change for middleware to process */
  protected setPendingChange(draft: WritableDraft<ProjectStore>, change: ClipChange): void {
    draft._pendingClipChange = change
  }

  /** Build ClipChange for add operation */
  protected buildAddChange(clip: Clip): ClipChange {
    return {
      type: 'add',
      clipId: clip.id,
      recordingId: clip.recordingId,
      before: null,
      after: this.buildClipState(clip),
      timelineDelta: clip.duration
    }
  }

  /** Build ClipChange for delete operation */
  protected buildDeleteChange(clip: Clip): ClipChange {
    return {
      type: 'delete',
      clipId: clip.id,
      recordingId: clip.recordingId,
      before: this.buildClipState(clip),
      after: null,
      timelineDelta: -clip.duration
    }
  }

  /** Build ClipChange for trim-start operation */
  protected buildTrimStartChange(
    clip: Clip,
    beforeState: ClipState,
    timelineDelta: number
  ): ClipChange {
    return {
      type: 'trim-start',
      clipId: clip.id,
      recordingId: clip.recordingId,
      before: beforeState,
      after: this.buildClipState(clip),
      timelineDelta
    }
  }

  /** Build ClipChange for trim-end operation */
  protected buildTrimEndChange(
    clip: Clip,
    beforeState: ClipState,
    timelineDelta: number
  ): ClipChange {
    return {
      type: 'trim-end',
      clipId: clip.id,
      recordingId: clip.recordingId,
      before: beforeState,
      after: this.buildClipState(clip),
      timelineDelta
    }
  }

  /** Build ClipChange for split operation */
  protected buildSplitChange(
    originalClip: Clip,
    beforeState: ClipState,
    firstClip: Clip,
    secondClip: Clip
  ): ClipChange {
    return {
      type: 'split',
      clipId: originalClip.id,
      recordingId: originalClip.recordingId,
      before: beforeState,
      after: this.buildClipState(firstClip),
      timelineDelta: 0,
      newClipIds: [firstClip.id, secondClip.id]
    }
  }

  /** Build ClipChange for update operation */
  protected buildUpdateChange(
    clip: Clip,
    beforeState: ClipState,
    timelineDelta: number = 0
  ): ClipChange {
    return {
      type: 'update',
      clipId: clip.id,
      recordingId: clip.recordingId,
      before: beforeState,
      after: this.buildClipState(clip),
      timelineDelta
    }
  }
}
