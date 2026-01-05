import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { AddClipCommand } from '../timeline/AddClipCommand'
import { AddZoomBlockCommand } from '../effects/AddZoomBlockCommand'
import type { Clip, ZoomBlock, ZoomEffectData, Effect } from '@/types/project'
import { EffectType, TrackType, TimelineItemType } from '@/types/project'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { EffectStore } from '@/features/effects/core/store'
import { EffectCreation } from '@/features/effects/core/creation'
import { getBlockEffectDuration } from '@/features/effects/core/classification'
import { getClipboardEffectRoute, ClipboardRouteType } from './clipboard-routing'
import { TimelineConfig } from '@/features/ui/timeline/config'

export interface PasteResult {
  type: TimelineItemType
  clipId?: string
  effectType?: EffectType
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
      const clipboardStart = clipboard.effect.startTime
      const clipboardEnd = clipboard.effect.endTime
      const clipboardDuration = (typeof clipboardStart === 'number' && typeof clipboardEnd === 'number' && clipboardEnd > clipboardStart)
        ? clipboardEnd - clipboardStart
        : undefined

      const effectType = clipboard.effect.type as EffectType
      const effectData = clipboard.effect.data
      const store = this.context.getStore()
      const currentTime = this.pasteTime ?? this.context.getCurrentTime()

      if (!project) {
        return { success: false, error: 'No project found' }
      }

      const route = getClipboardEffectRoute(effectType)

      // Zoom effects are recording-scoped and playhead-based
      if (route === ClipboardRouteType.Zoom) {
        const zoomData = effectData as unknown as ZoomEffectData

        // Get current playhead position - this IS the timeline position for the new effect
        const currentTimelineTime = currentTime

        // Find clip at playhead for recording reference (optional, for mouse event access)
        const allClips = project.timeline.tracks.flatMap(t => t.clips)
        const clipAtPlayhead = TimeConverter.findClipAtTimelinePosition(currentTimelineTime, allClips)

        if (!clipAtPlayhead) {
          if (allClips.length === 0) {
            return { success: false, error: 'No clips in timeline. Create a clip first.' }
          }

          // Use first clip's recording as fallback, but paste at timeline position
          const firstClip = allClips.sort((a, b) => a.startTime - b.startTime)[0]

          // Paste at timeline position directly (no source conversion)
          return this.createZoomBlock(zoomData, firstClip.recordingId, currentTimelineTime, project, clipboardDuration)
        }

        if (!clipAtPlayhead) {
          return { success: false, error: 'No clip found at playhead to paste zoom effect.' }
        }

        // Paste at timeline position directly (no source conversion)
        return this.createZoomBlock(zoomData, clipAtPlayhead.recordingId, currentTimelineTime, project, clipboardDuration)
      }

      if (route === ClipboardRouteType.Block) {
        const blockDuration = Math.max(
          TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS,
          getBlockEffectDuration(effectType, clipboardDuration)
        )
        const startTime = Math.max(0, currentTime)

        const newEffectId = `${effectType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        store.addEffect({
          id: newEffectId,
          type: effectType as EffectType,
          startTime,
          endTime: startTime + blockDuration,
          data: effectData as any,
          enabled: true
        } as Effect)

        return {
          success: true,
          data: {
            type: TimelineItemType.Effect,
            effectType,
            blockId: newEffectId
          }
        }
      }

      const existingGlobal = EffectStore.getAll(project).find(e => e.type === effectType)
      if (existingGlobal) {
        store.updateEffect(existingGlobal.id, { data: effectData as any })
      } else {
        store.addEffect({
          id: `${effectType}-global-${Date.now()}`,
          type: effectType as EffectType,
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          data: effectData as any,
          enabled: true
        } as Effect)
      }

      return {
        success: true,
        data: {
          type: TimelineItemType.Effect,
          effectType
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

      // Robust fallback: If clip has layout data, it MUST be a webcam clip
      const targetTrackType = (clipboard.clipTrackType as TrackType) ??
        (clipboard.clip?.layout ? TrackType.Webcam : undefined)

      this.pastedCommand = new AddClipCommand(this.context, newClip, undefined, {
        trackType: targetTrackType
      })
      const result = await this.pastedCommand.execute()

      if (result.success && project) {
        // Copy crop effect from the original clip to the pasted clip
        const allEffects = EffectStore.getAll(project)
        // Look up crop effect by the original clipboard clip ID
        const originalCropEffect = allEffects.find(e =>
          e.type === EffectType.Crop &&
          e.clipId === clipboard.clip!.id
        )

        if (originalCropEffect && originalCropEffect.data) {
          const pastedClipData = this.context.findClip(newClip.id)
          if (pastedClipData) {
            const { clip: pastedClip } = pastedClipData
            // Create a new crop effect for the pasted clip with the actual timeline positions
            const newCropEffect = EffectCreation.createCropEffect({
              clipId: pastedClip.id,
              startTime: pastedClip.startTime,
              endTime: pastedClip.startTime + pastedClip.duration,
              cropData: originalCropEffect.data as any
            })
            const store = this.context.getStore()
            store.addEffect(newCropEffect)
          }
        }

        return {
          success: true,
          data: { type: TimelineItemType.Clip, clipId: newClip.id }
        }
      }
      return result as CommandResult<PasteResult>
    }

    return { success: false, error: 'Nothing to paste' }
  }

  private async createZoomBlock(
    zoomData: ZoomEffectData,
    _recordingId: string,
    pasteTimelinePosition: number,  // Now we use timeline position directly
    project: any,
    durationMs?: number
  ): Promise<CommandResult<PasteResult>> {
    const resolvedDuration = typeof durationMs === 'number' && durationMs > 0
      ? durationMs
      : 5000
    // Default duration in TIMELINE space
    const blockDuration = Math.max(
      TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS,
      resolvedDuration
    ) // 5 seconds

    // Find non-overlapping position - check ALL zoom effects in timeline.effects
    const existingZoomEffects = EffectStore.getAll(project).filter(e => e.type === EffectType.Zoom)
    existingZoomEffects.sort((a, b) => a.startTime - b.startTime)

    let finalStartTime = Math.max(0, pasteTimelinePosition)

    // Check for overlaps in TIMELINE space
    for (const effect of existingZoomEffects) {
      if (finalStartTime < effect.endTime && (finalStartTime + blockDuration) > effect.startTime) {
        finalStartTime = effect.endTime + 100
      }
    }

    // Create block in TIMELINE space (not source space)
    const newBlock: ZoomBlock = zoomData.origin === 'auto'
      ? {
        ...zoomData,
        origin: 'auto',
        id: `zoom-timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        startTime: finalStartTime,  // Timeline position
        endTime: finalStartTime + blockDuration,  // Timeline position
        scale: zoomData.scale || 2
      }
      : {
        ...zoomData,
        origin: 'manual',
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
          type: TimelineItemType.Effect,
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
