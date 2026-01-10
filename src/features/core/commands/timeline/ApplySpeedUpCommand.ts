/**
 * Generic command to apply speed-up suggestions to clips
 * Works with any SpeedUpPeriod type (typing, idle, etc.)
 * 
 * Uses PatchedCommand for automatic undo/redo via Immer patches.
 * This eliminates the need for manual state tracking and restoration.
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import { SpeedUpApplicationService } from '@/features/ui/timeline/speed-up-application'
import { syncKeystrokeEffects } from '@/features/effects/sync'
import { ClipLookup } from '@/features/ui/timeline/clips/clip-lookup'
import { calculateTimelineDuration } from '@/features/ui/timeline/clips/clip-reflow'
import { playbackService } from '@/features/ui/timeline/playback/playback-service'

export class ApplySpeedUpCommand extends PatchedCommand<{
  applied: number // number of clips affected
}> {
  private sourceClipId: string
  private periods: SpeedUpPeriod[]
  private speedUpTypes: SpeedUpType[]
  private affectedClipIds: string[] = []

  constructor(
    context: CommandContext,
    sourceClipId: string,
    periods: SpeedUpPeriod[],
    speedUpTypes: SpeedUpType[] = []
  ) {
    // Determine types from periods if not provided
    if (speedUpTypes.length === 0) {
      const types = new Set(periods.map(p => p.type))
      speedUpTypes = Array.from(types)
    }

    const typeNames = speedUpTypes.map(t => t === SpeedUpType.Typing ? 'typing' : 'idle').join(' & ')

    super(context, {
      name: 'ApplySpeedUp',
      description: `Apply ${typeNames} speed-up`,
      category: 'timeline'
    })

    this.sourceClipId = sourceClipId
    this.periods = periods
    this.speedUpTypes = speedUpTypes
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.sourceClipId)
    return !!result && this.periods.length > 0
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
      throw new Error('No project found')
    }

    // Verify clip exists
    const sourceResult = ClipLookup.byId(draft.currentProject, this.sourceClipId)
    if (!sourceResult) {
      throw new Error(`Clip ${this.sourceClipId} not found`)
    }

    // Convert SpeedUpType to legacy string format for the service
    const legacyTypes = this.speedUpTypes.map(t =>
      t === SpeedUpType.Typing ? 'typing' as const : 'idle' as const
    )

    // Apply speed-up using the unified service
    // SpeedUpApplicationService handles clip splitting and effect remapping
    const result = SpeedUpApplicationService.applySpeedUpToClip(
      draft.currentProject,
      this.sourceClipId,
      this.periods,
      legacyTypes
    )

    // Track affected clips for composite commands
    this.affectedClipIds = result.affectedClips

    // Speed-up can change durations/time-remaps; rebuild derived keystroke blocks
    syncKeystrokeEffects(draft.currentProject)

    // Update modified timestamp
    draft.currentProject.modifiedAt = new Date().toISOString()

    // Ensure playhead is within valid range after timeline changes
    const newTimelineDuration = calculateTimelineDuration(draft.currentProject)
    if (draft.currentTime >= newTimelineDuration) {
      draft.currentTime = playbackService.seek(
        Math.max(0, newTimelineDuration - 1),
        newTimelineDuration
      )
    }

    this.setResult({
      success: true,
      data: { applied: result.affectedClips.length }
    })
  }

  getSpeedUpTypes(): SpeedUpType[] {
    return this.speedUpTypes
  }

  getAffectedClips(): string[] {
    return this.affectedClipIds
  }
}
