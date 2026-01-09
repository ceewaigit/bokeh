/**
 * Command to apply ALL speed-ups (typing + idle) to ALL clips in the timeline
 * This is a composite command that groups multiple ApplySpeedUpCommand operations
 */

import { Command } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { SpeedUpPeriod } from '@/types/speed-up'
import { SpeedUpType } from '@/types/speed-up'
import { ActivityDetectionService } from '@/features/ui/timeline/activity-detection/detection-service'
import { ApplySpeedUpCommand } from './ApplySpeedUpCommand'

export interface ApplyAllOptions {
  applyTyping: boolean
  applyIdle: boolean
}

// Saved detection periods for undo/redo (recordingId -> original periods)
interface SavedPeriods {
  detectedTypingPeriods?: any[]
  detectedIdlePeriods?: any[]
}

export class ApplyAllSpeedUpsCommand extends Command<{ affectedClips: string[] }> {
  private subCommands: ApplySpeedUpCommand[] = []
  private clipsProcessed: number = 0
  // Store original detection periods before clearing (for undo)
  private savedPeriodsByRecording: Map<string, SavedPeriods> = new Map()

  constructor(
    private context: CommandContext,
    private options: ApplyAllOptions = { applyTyping: true, applyIdle: true },
    description: string = 'Apply all speed-ups'
  ) {
    super({
      name: 'ApplyAllSpeedUps',
      description,
      category: 'speed-up'
    })
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    if (!project) return false

    // Check if there are any clips that could have speed-up suggestions
    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        const recording = project.recordings.find(r => r.id === clip.recordingId)
        if (!recording) continue

        if (ActivityDetectionService.hasUnappliedSuggestions(recording, clip)) {
          return true
        }
      }
    }
    return false
  }

  async doExecute(): Promise<{ success: boolean; data?: { affectedClips: string[] }; error?: string }> {
    const project = this.context.getProject()
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    const allAffectedClips: string[] = []

    // Process each track
    for (const track of project.timeline.tracks) {
      // Process clips in reverse order to avoid index shifting issues
      const clipsToProcess = [...track.clips].reverse()

      for (const clip of clipsToProcess) {
        const recording = project.recordings.find(r => r.id === clip.recordingId)
        if (!recording?.metadata) continue

        const suggestions = ActivityDetectionService.getSuggestionsForClip(recording, clip)

        // Combine periods based on options
        const periodsToApply: SpeedUpPeriod[] = []
        const typesToApply: SpeedUpType[] = []

        if (this.options.applyTyping && suggestions.typing.length > 0) {
          periodsToApply.push(...suggestions.typing)
          typesToApply.push(SpeedUpType.Typing)
        }

        if (this.options.applyIdle && suggestions.idle.length > 0) {
          periodsToApply.push(...suggestions.idle)
          typesToApply.push(SpeedUpType.Idle)
        }

        if (periodsToApply.length === 0) continue

        // Resolve overlaps (prefer faster multiplier)
        const resolvedPeriods = ActivityDetectionService.resolveOverlaps(periodsToApply)

        // Cache detection results if not already cached
        this.cacheDetectionResults(recording, suggestions)

        // Create and execute a command for this clip
        const command = new ApplySpeedUpCommand(
          this.context,
          clip.id,
          resolvedPeriods,
          typesToApply
        )

        const result = await command.execute()
        if (result.success) {
          allAffectedClips.push(...command.getAffectedClips())
          this.subCommands.push(command)
          this.clipsProcessed++
        }
      }
    }

    // After applying all speed-ups, clear detection periods from recordings
    // This removes the speed-up bar space from the timeline UI
    this.saveDetectionPeriods(project)
    this.context.getStore().clearDetectionPeriods()

    return {
      success: true,
      data: { affectedClips: allAffectedClips }
    }
  }

  async doUndo(): Promise<{ success: boolean; error?: string }> {
    // Undo in reverse order (LIFO) for proper state restoration
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      const result = await this.subCommands[i].undo()
      if (!result.success) {
        return {
          success: false,
          error: `Failed to undo sub-command ${i}: ${result.error}`
        }
      }
    }

    // Restore detection periods so speed-up bar reappears
    this.restoreDetectionPeriods()

    return { success: true }
  }

  async doRedo(): Promise<{ success: boolean; error?: string }> {
    // Redo in original order
    for (let i = 0; i < this.subCommands.length; i++) {
      const result = await this.subCommands[i].redo()
      if (!result.success) {
        return {
          success: false,
          error: `Failed to redo sub-command ${i}: ${result.error}`
        }
      }
    }

    // Re-clear detection periods using store action for reactive updates
    this.context.getStore().clearDetectionPeriods()

    return { success: true }
  }

  getClipsProcessed(): number {
    return this.clipsProcessed
  }

  private cacheDetectionResults(
    recording: any,
    suggestions: { typing: SpeedUpPeriod[]; idle: SpeedUpPeriod[] }
  ): void {
    const store = this.context.getStore()

    // Cache typing periods if not already cached
    if (suggestions.typing.length > 0 && !recording.metadata?.detectedTypingPeriods) {
      store.cacheTypingPeriods(recording.id, suggestions.typing.map(p => ({
        startTime: p.startTime,
        endTime: p.endTime,
        keyCount: p.metadata?.keyCount || 0,
        averageWpm: p.metadata?.averageWpm || 0,
        suggestedSpeedMultiplier: p.suggestedSpeedMultiplier
      })))
    }

    // Cache idle periods if not already cached - use type assertion since store may not have updated interface yet
    if (suggestions.idle.length > 0 && !recording.metadata?.detectedIdlePeriods) {
      (store as any).cacheIdlePeriods(recording.id, suggestions.idle.map(p => ({
        startTime: p.startTime,
        endTime: p.endTime,
        suggestedSpeedMultiplier: p.suggestedSpeedMultiplier,
        confidence: p.confidence
      })))
    }
  }

  /** Save detection periods from recordings for undo support */
  private saveDetectionPeriods(project: any): void {
    for (const recording of project.recordings) {
      if (!recording.metadata) continue

      const saved: SavedPeriods = {}

      if (recording.metadata.detectedTypingPeriods?.length) {
        saved.detectedTypingPeriods = [...recording.metadata.detectedTypingPeriods]
      }
      if (recording.metadata.detectedIdlePeriods?.length) {
        saved.detectedIdlePeriods = [...recording.metadata.detectedIdlePeriods]
      }

      // Only save if there's something to save
      if (saved.detectedTypingPeriods || saved.detectedIdlePeriods) {
        this.savedPeriodsByRecording.set(recording.id, saved)
      }
    }
  }

  /** Restore saved detection periods to recordings (for undo) */
  private restoreDetectionPeriods(): void {
    if (this.savedPeriodsByRecording.size > 0) {
      this.context.getStore().restoreDetectionPeriods(this.savedPeriodsByRecording)
    }
  }
}
