/**
 * Command to dismiss an activity suggestion bar
 * Supports undo/redo via Immer patches
 */

import { PatchedCommand } from '../base/PatchedCommand'
import { CommandContext } from '../base/CommandContext'
import type { WritableDraft } from 'immer'
import type { ProjectStore } from '@/features/core/stores/project-store'
import { SpeedUpType, type SpeedUpPeriod } from '@/types/speed-up'
import { markProjectModified } from '@/features/core/stores/store-utils'

/**
 * Generate a unique key for a suggestion period.
 * Uses recordingId (not clipId) because clip IDs change during split/speed-up operations,
 * but recording IDs and source timestamps remain stable.
 */
export function getSuggestionKey(recordingId: string, period: SpeedUpPeriod): string {
  // Normalize TrimStart/TrimEnd to 'idle' - these are derived from idle periods
  // and their edge type can change when clips are split/manipulated
  const normalizedType = (period.type === SpeedUpType.TrimStart || period.type === SpeedUpType.TrimEnd)
    ? SpeedUpType.Idle
    : period.type
  return `${recordingId}-${normalizedType}-${period.startTime}-${period.endTime}`
}

export class DismissSuggestionCommand extends PatchedCommand<{ dismissed: boolean }> {
  private recordingId: string
  private period: SpeedUpPeriod
  private suggestionKey: string

  constructor(
    context: CommandContext,
    recordingId: string,
    period: SpeedUpPeriod
  ) {
    super(context, {
      name: 'DismissSuggestion',
      description: `Dismiss ${period.type} suggestion`,
      category: 'timeline'
    })

    this.recordingId = recordingId
    this.period = period
    this.suggestionKey = getSuggestionKey(recordingId, period)
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    if (!project) return false

    // Check if suggestion is not already dismissed
    const dismissed = project.timeline.dismissedSuggestions || []
    return !dismissed.includes(this.suggestionKey)
  }

  protected mutate(draft: WritableDraft<ProjectStore>): void {
    if (!draft.currentProject) {
      throw new Error('No project found')
    }

    // Initialize dismissedSuggestions array if needed
    if (!draft.currentProject.timeline.dismissedSuggestions) {
      draft.currentProject.timeline.dismissedSuggestions = []
    }

    // Add suggestion key to dismissed list
    draft.currentProject.timeline.dismissedSuggestions.push(this.suggestionKey)

    // Update modified timestamp
    markProjectModified(draft)

    this.setResult({
      success: true,
      data: { dismissed: true }
    })
  }

  getSuggestionKey(): string {
    return this.suggestionKey
  }
}
