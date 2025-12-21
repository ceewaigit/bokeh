/**
 * Generic command to apply speed-up suggestions to clips
 * Works with any SpeedUpPeriod type (typing, idle, etc.)
 */

import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'

export class ApplySpeedUpCommand extends Command<{
  applied: number // number of clips affected
}> {
  private originalClips: Clip[] = []
  private affectedClips: string[] = []
  private trackId: string = ''

  constructor(
    private context: CommandContext,
    private sourceClipId: string,
    private periods: SpeedUpPeriod[],
    private speedUpTypes: SpeedUpType[] = [] // Which types are being applied
  ) {
    // Determine types from periods if not provided
    if (speedUpTypes.length === 0) {
      const types = new Set(periods.map(p => p.type))
      speedUpTypes = Array.from(types)
    }

    const typeNames = speedUpTypes.map(t => t === SpeedUpType.Typing ? 'typing' : 'idle').join(' & ')

    super({
      name: 'ApplySpeedUp',
      description: `Apply ${typeNames} speed-up`,
      category: 'timeline'
    })

    this.speedUpTypes = speedUpTypes
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.sourceClipId)
    return !!result && this.periods.length > 0
  }

  doExecute(): CommandResult<{ applied: number }> {
    const store = this.context.getStore()

    // Find and save track ID for undo
    const sourceResult = this.context.findClip(this.sourceClipId)
    if (!sourceResult) {
      return { success: false, error: `Clip ${this.sourceClipId} not found` }
    }
    this.trackId = sourceResult.track.id

    try {
      // Use the store method - it accepts any period with startTime, endTime, suggestedSpeedMultiplier
      const result = (store as any).applySpeedUpToClip(
        this.sourceClipId,
        this.periods,
        this.speedUpTypes
      )

      // Save state for undo
      this.originalClips = result.originalClips
      this.affectedClips = result.affectedClips

      return {
        success: true,
        data: { applied: this.affectedClips.length }
      }
    } catch (error) {
      console.error('[ApplySpeedUpCommand] Failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply speed-up'
      }
    }
  }

  doUndo(): CommandResult<{ applied: number }> {
    const store = this.context.getStore()
    const project = store.currentProject
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    if (this.originalClips.length === 0 || !this.trackId) {
      return { success: false, error: 'Cannot undo: missing original state or trackId' }
    }

    // Use atomic restore to avoid intermediate reflow issues
    store.restoreClipsFromUndo(
      this.trackId,
      this.affectedClips,
      this.originalClips
    )

    return {
      success: true,
      data: { applied: 0 }
    }
  }

  doRedo(): CommandResult<{ applied: number }> {
    // Re-execute with the same parameters
    return this.doExecute()
  }

  getAffectedClips(): string[] {
    return this.affectedClips
  }

  getSpeedUpTypes(): SpeedUpType[] {
    return this.speedUpTypes
  }
}
