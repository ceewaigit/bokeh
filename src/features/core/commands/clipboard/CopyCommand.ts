import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { EffectType, TimelineItemType } from '@/types'
import { resolveClipboardEffect } from './clipboard-routing'

export interface CopyResult {
  type: TimelineItemType
  clipId?: string
  effectType?: EffectType
  blockId?: string
}

export class CopyCommand extends Command<CopyResult> {
  constructor(
    private context: CommandContext,
    private clipId?: string
  ) {
    super({
      name: 'Copy',
      description: 'Copy selected clip or effect',
      category: 'clipboard'
    })
  }

  canExecute(): boolean {
    const selectedEffectLayer = this.context.getSelectedEffectLayer()

    // If any effect layer with an ID is selected, we can copy it
    if (selectedEffectLayer?.id) {
      return true
    }

    // Otherwise, check for clip selection
    const clipId = this.clipId || this.context.getSelectedClips()[0]
    if (!clipId) return false

    const result = this.context.findClip(clipId)
    return result !== null
  }

  doExecute(): CommandResult<CopyResult> {
    const store = this.context.getStore()
    const selectedEffectLayer = this.context.getSelectedEffectLayer()
    const project = this.context.getProject()
    const clipId = this.clipId || this.context.getSelectedClips()[0]

    const resolvedEffect = resolveClipboardEffect(
      project,
      selectedEffectLayer,
      clipId,
      store.getEffectsAtTimeRange
    )

    if (selectedEffectLayer && !resolvedEffect) {
      return {
        success: false,
        error: 'Selected effect not found'
      }
    }

    if (resolvedEffect) {
      const effectType = resolvedEffect.type
      store.copyEffect(effectType as any, resolvedEffect.data as any, resolvedEffect.clipId ?? '', {
        startTime: resolvedEffect.startTime,
        endTime: resolvedEffect.endTime
      })

      return {
        success: true,
        data: {
          type: TimelineItemType.Effect,
          effectType: effectType as any,
          blockId: resolvedEffect.id,
          clipId: resolvedEffect.clipId ?? ''
        }
      }
    }

    if (!clipId) {
      return {
        success: false,
        error: 'No clip or effect selected'
      }
    }

    const result = this.context.findClip(clipId)
    if (!result) {
      return {
        success: false,
        error: `Clip ${clipId} not found`
      }
    }

    const { clip, track } = result

    // Copy entire clip, preserving track type for correct paste targeting
    store.copyClip(clip, track.type)

    return {
      success: true,
      data: {
        type: TimelineItemType.Clip,
        clipId
      }
    }
  }

  doUndo(): CommandResult<CopyResult> {
    // Copy is non-destructive, so undo just clears clipboard
    const store = this.context.getStore()
    store.clearClipboard()

    return {
      success: true,
      data: {
        type: TimelineItemType.Clip
      }
    }
  }

  doRedo(): CommandResult<CopyResult> {
    // Re-execute the copy
    return this.doExecute()
  }
}
