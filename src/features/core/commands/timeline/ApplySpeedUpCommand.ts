/**
 * ApplySpeedUpCommand - Apply speed-up suggestions to clips.
 * Works with any SpeedUpPeriod type (typing, idle, etc.)
 */

import { TimelineCommand } from '../base/TimelineCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import { SpeedUpApplicationService } from '@/features/ui/timeline/speed-up-application'
import { syncKeystrokeEffects } from '@/features/effects/sync'
import { calculateTimelineDuration } from '@/features/ui/timeline/clips/clip-reflow'
import { playbackService } from '@/features/playback/services/playback-service'
import { markProjectModified } from '@/features/core/stores/store-utils'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'

export class ApplySpeedUpCommand extends TimelineCommand<{ applied: number }> {
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
    const project = draft.currentProject
    if (!project) throw new Error('No project found')

    const lookup = this.findClip(project, this.sourceClipId)
    if (!lookup) throw new Error(`Clip ${this.sourceClipId} not found`)

    // Convert SpeedUpType to legacy string format
    const legacyTypes = this.speedUpTypes.map(t =>
      t === SpeedUpType.Typing ? 'typing' as const : 'idle' as const
    )

    // Apply speed-up using the unified service
    const result = SpeedUpApplicationService.applySpeedUpToClip(
      project, this.sourceClipId, this.periods, legacyTypes
    )

    this.affectedClipIds = result.affectedClips

    // Sync keystroke effects and invalidate caches
    syncKeystrokeEffects(project)
    TimelineDataService.invalidateCache(project)
    markProjectModified(draft)

    // Ensure playhead is within valid range
    const newTimelineDuration = calculateTimelineDuration(project)
    if (draft.currentTime >= newTimelineDuration) {
      draft.currentTime = playbackService.seek(
        Math.max(0, newTimelineDuration - 1),
        newTimelineDuration
      )
    }

    this.setResult({ success: true, data: { applied: result.affectedClips.length } })
  }

  getSpeedUpTypes(): SpeedUpType[] {
    return this.speedUpTypes
  }

  getAffectedClips(): string[] {
    return this.affectedClipIds
  }
}
