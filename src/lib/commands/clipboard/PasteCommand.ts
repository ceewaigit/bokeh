import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { AddClipCommand } from '../timeline/AddClipCommand'
import { AddZoomBlockCommand } from '../effects/AddZoomBlockCommand'
import type { Clip, ZoomBlock, ZoomEffectData, Effect } from '@/types/project'
import { EffectType } from '@/types/project'
import { TimeConverter } from '@/lib/timeline/time-space-converter'

export interface PasteResult {
  type: 'clip' | 'effect'
  clipId?: string
  effectType?: EffectType.Zoom | EffectType.Cursor | EffectType.Background | EffectType.Keystroke | EffectType.Screen
  blockId?: string
}

export class PasteCommand extends Command<PasteResult> {
  private pastedCommand?: Command

  constructor(
    private context: CommandContext,
    private pasteTime?: number
  ) {
    super({
      name: 'Paste',
      description: 'Paste clipboard contents',
      category: 'clipboard'
    })
  }

  canExecute(): boolean {
    const clipboard = this.context.getClipboard()
    return !!(clipboard.clip || clipboard.effect)
  }

  async doExecute(): Promise<CommandResult<PasteResult>> {
    const clipboard = this.context.getClipboard()
    const project = this.context.getProject()

    // Paste effect if we have one
    if (clipboard.effect) {
      // Zoom effects are recording-scoped and playhead-based
      if (clipboard.effect.type === EffectType.Zoom) {
        console.log('[PasteCommand] Pasting zoom effect (timeline-based)')
        const zoomData = clipboard.effect.data as unknown as ZoomEffectData

        if (!project) {
          return { success: false, error: 'No project found' }
        }

        // Get current playhead position - this IS the timeline position for the new effect
        const currentTimelineTime = this.pasteTime ?? this.context.getCurrentTime()
        console.log('[PasteCommand] Playhead position (timeline-space):', currentTimelineTime)

        // Find clip at playhead for recording reference (optional, for mouse event access)
        const allClips = project.timeline.tracks.flatMap(t => t.clips)
        const clipAtPlayhead = TimeConverter.findClipAtTimelinePosition(currentTimelineTime, allClips)

        if (!clipAtPlayhead) {
          if (allClips.length === 0) {
            return { success: false, error: 'No clips in timeline. Create a clip first.' }
          }

          // Use first clip's recording as fallback, but paste at timeline position
          const firstClip = allClips.sort((a, b) => a.startTime - b.startTime)[0]
          console.log('[PasteCommand] Playhead not on clip, using first clip for recording:', firstClip.id)

          // Paste at timeline position directly (no source conversion)
          return this.createZoomBlock(zoomData, firstClip.recordingId, currentTimelineTime, project)
        }

        console.log('[PasteCommand] Clip at playhead:', clipAtPlayhead.id, 'recordingId:', clipAtPlayhead.recordingId)

        // Paste at timeline position directly (no source conversion)
        return this.createZoomBlock(zoomData, clipAtPlayhead.recordingId, currentTimelineTime, project)
      } else {
        // For other effect types (keystroke, screen, cursor, background)
        const currentTime = this.pasteTime ?? this.context.getCurrentTime()
        const effectType = clipboard.effect.type as EffectType
        const effectData = clipboard.effect.data
        const store = this.context.getStore()

        // Keystroke and Screen effects are timeline-based blocks with durations
        // Cursor and Background are global settings (no duration)
        const isBlockEffect = effectType === EffectType.Keystroke || effectType === EffectType.Screen

        if (isBlockEffect && project) {
          // Use appropriate default duration for block effects
          const defaultDuration = effectType === EffectType.Keystroke ? 5000 : 3000 // 5s for keystroke, 3s for screen

          // Find non-overlapping position
          const existingEffects: Effect[] = (project.timeline.effects || []).filter(
            (e: Effect) => e.type === effectType
          )
          existingEffects.sort((a, b) => a.startTime - b.startTime)

          let finalStartTime = Math.max(0, currentTime)

          // Check for overlaps
          for (const effect of existingEffects) {
            if (finalStartTime < effect.endTime && (finalStartTime + defaultDuration) > effect.startTime) {
              finalStartTime = effect.endTime + 100
            }
          }

          // Create new effect block
          store.addEffect({
            id: `${effectType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: effectType as EffectType,
            startTime: finalStartTime,
            endTime: finalStartTime + defaultDuration,
            data: effectData,
            enabled: true
          })

          return {
            success: true,
            data: { type: 'effect', effectType, blockId: `${effectType}-pasted` }
          }
        }

        // For global effects (cursor, background), update existing or create new
        const allClips = project?.timeline.tracks.flatMap(t => t.clips) || []
        const clipAtPlayhead = TimeConverter.findClipAtTimelinePosition(currentTime, allClips)

        if (!clipAtPlayhead) {
          return { success: false, error: 'Position playhead on a clip to paste the effect' }
        }

        const existingEffects = store.getEffectsAtTimeRange(clipAtPlayhead.id)
        const existingEffect = existingEffects.find(e => e.type === effectType)

        if (existingEffect) {
          store.updateEffect(existingEffect.id, { data: effectData })
        } else {
          store.addEffect({
            id: `${effectType}-global-${Date.now()}`,
            type: effectType as EffectType,
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER,
            data: effectData,
            enabled: true
          })
        }

        return {
          success: true,
          data: { type: 'effect', effectType: effectType as PasteResult['effectType'], clipId: clipAtPlayhead.id }
        }
      }
    }

    // Paste clip
    if (clipboard.clip) {
      const currentTime = this.pasteTime ?? this.context.getCurrentTime()

      const newClip: Clip = {
        ...clipboard.clip,
        id: `clip-${Date.now()}`,
        startTime: currentTime
      }

      this.pastedCommand = new AddClipCommand(this.context, newClip)
      const result = await this.pastedCommand.execute()

      if (result.success) {
        return {
          success: true,
          data: { type: 'clip', clipId: newClip.id }
        }
      }
      return result as CommandResult<PasteResult>
    }

    return { success: false, error: 'Nothing to paste' }
  }

  private async createZoomBlock(
    zoomData: ZoomEffectData,
    recordingId: string,
    pasteTimelinePosition: number,  // Now we use timeline position directly
    project: any
  ): Promise<CommandResult<PasteResult>> {
    // Default duration in TIMELINE space
    const blockDuration = 5000 // 5 seconds

    // Find non-overlapping position - check ALL zoom effects in timeline.effects
    const existingZoomEffects: Effect[] = (project.timeline.effects || []).filter(
      (e: Effect) => e.type === EffectType.Zoom
    )
    existingZoomEffects.sort((a, b) => a.startTime - b.startTime)

    let finalStartTime = Math.max(0, pasteTimelinePosition)

    // Check for overlaps in TIMELINE space
    for (const effect of existingZoomEffects) {
      if (finalStartTime < effect.endTime && (finalStartTime + blockDuration) > effect.startTime) {
        finalStartTime = effect.endTime + 100
      }
    }

    // Create block in TIMELINE space (not source space)
    const newBlock: ZoomBlock = {
      ...zoomData,
      id: `zoom-timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: finalStartTime,  // Timeline position
      endTime: finalStartTime + blockDuration,  // Timeline position
      scale: zoomData.scale || 2
    }

    this.pastedCommand = new AddZoomBlockCommand(this.context, newBlock)
    const result = await this.pastedCommand.execute()

    if (result.success) {
      return {
        success: true,
        data: {
          type: 'effect',
          effectType: EffectType.Zoom,
          blockId: newBlock.id
        }
      }
    }
    return result as CommandResult<PasteResult>
  }

  async doUndo(): Promise<CommandResult<PasteResult>> {
    if (!this.pastedCommand) {
      return { success: false, error: 'No paste operation to undo' }
    }
    return await this.pastedCommand.undo() as CommandResult<PasteResult>
  }

  async doRedo(): Promise<CommandResult<PasteResult>> {
    if (!this.pastedCommand) {
      return { success: false, error: 'No paste operation to redo' }
    }
    return await this.pastedCommand.redo() as CommandResult<PasteResult>
  }
}
