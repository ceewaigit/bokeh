import type { Clip, Effect, Project, Recording } from '@/types/project'
import { EffectType } from '@/types/project'
import type { SelectedEffectLayer } from '@/features/effects/types'
import { EffectLayerType } from '@/features/effects/types'
import { resolveEffectIdForType } from '@/features/effects/core/selection'
import { DEFAULT_KEYSTROKE_DATA, KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'

type ExecuteCommand = (commandName: string, ...args: any[]) => void

interface EffectChangeContext {
  effects: Effect[]
  selectedEffectLayer?: SelectedEffectLayer
  currentProject?: Project | null
  selectedClip?: Clip | null
  playheadRecording?: Recording | null
  currentTime: number
  executeCommand: ExecuteCommand
}

function updateEffectData(
  executeCommand: ExecuteCommand,
  effectId: string,
  data: Record<string, unknown>,
  enabled?: boolean
): void {
  executeCommand('UpdateEffect', effectId, {
    ...(enabled !== undefined ? { enabled } : {}),
    data
  })
}

function updateEffectEnabled(
  executeCommand: ExecuteCommand,
  effectId: string,
  enabled: boolean
): void {
  executeCommand('UpdateEffect', effectId, { enabled })
}

function ensureGlobalEffect(
  context: EffectChangeContext,
  type: EffectType,
  data: Record<string, unknown>,
  enabled?: boolean
): void {
  const existing = context.effects.find(effect => effect.type === type)
  if (existing) {
    updateEffectData(context.executeCommand, existing.id, data, enabled ?? existing.enabled)
    return
  }

  const newEffect: Effect = {
    id: `${type}-global-${Date.now()}`,
    type,
    startTime: 0,
    endTime: Number.MAX_SAFE_INTEGER,
    data,
    enabled: enabled ?? true
  } as Effect

  context.executeCommand('AddEffect', newEffect)
}

function updateSelectedBlock(
  context: EffectChangeContext,
  type: EffectType,
  data: Record<string, unknown>
): boolean {
  const selectedId = resolveEffectIdForType(context.effects, context.selectedEffectLayer, type)
  if (!selectedId) return false

  updateEffectData(context.executeCommand, selectedId, data)
  return true
}

async function maybeGenerateZoomEffects(
  context: EffectChangeContext,
  enabled?: boolean
): Promise<void> {
  if (!enabled) return

  const existingZoomEffects = context.effects.filter(e => e.type === EffectType.Zoom)
  if (existingZoomEffects.length > 0) return

  const project = context.currentProject
  if (!project) return

  const recording = context.playheadRecording || project.recordings?.[0]
  if (!recording) return

  const { detectZoomEffects } = await import('@/features/effects/logic/effect-detector')
  const allClips = project.timeline.tracks.flatMap(t => t.clips)
  const clipForRecording = allClips.find(c => c.recordingId === recording.id)

  if (!clipForRecording) return

  const { zoomEffects, screenEffects } = detectZoomEffects(recording, clipForRecording)
  for (const effect of [...zoomEffects, ...screenEffects]) {
    context.executeCommand('AddEffect', effect)
  }
}

function updateKeystrokeEffects(
  context: EffectChangeContext,
  data: Record<string, unknown>,
  enabled?: boolean
): void {
  const styleEffect = context.effects.find(e => e.type === EffectType.Keystroke && e.id === KEYSTROKE_STYLE_EFFECT_ID)
  if (styleEffect) {
    const merged = { ...(styleEffect.data as Record<string, unknown>), ...data }
    updateEffectData(context.executeCommand, styleEffect.id, merged, enabled ?? styleEffect.enabled)

    // If the caller is toggling enabled state without bulk support, apply it to blocks too.
    if (enabled !== undefined) {
      context.effects.forEach(effect => {
        if (effect.type !== EffectType.Keystroke) return
        if (effect.id === KEYSTROKE_STYLE_EFFECT_ID) return
        updateEffectEnabled(context.executeCommand, effect.id, enabled)
      })
    }
    return
  }

  const newEffect: Effect = {
    id: KEYSTROKE_STYLE_EFFECT_ID,
    type: EffectType.Keystroke,
    startTime: 0,
    endTime: Number.MAX_SAFE_INTEGER,
    data: { ...DEFAULT_KEYSTROKE_DATA, ...data },
    enabled: enabled ?? true
  }

  context.executeCommand('AddEffect', newEffect)

  if (enabled !== undefined) {
    context.effects.forEach(effect => {
      if (effect.type !== EffectType.Keystroke) return
      if (effect.id === KEYSTROKE_STYLE_EFFECT_ID) return
      updateEffectEnabled(context.executeCommand, effect.id, enabled)
    })
  }
}

function updateAnnotationEffect(context: EffectChangeContext, data: any): void {
  const kind = data?.kind
  if (!kind) return

  const existing = context.effects.find(
    effect => effect.type === EffectType.Annotation && (effect as any).data?.kind === kind
  )

  if (existing) {
    const enabled = data.enabled !== undefined ? data.enabled : existing.enabled
    const mergedData = { ...(existing as any).data, ...(data.data || {}), kind }
    updateEffectData(context.executeCommand, existing.id, mergedData, enabled)
    return
  }

  const clip = context.selectedClip
  const startTime = clip ? clip.startTime : 0
  const endTime = clip
    ? clip.startTime + clip.duration
    : (context.currentProject?.timeline.duration || Number.MAX_SAFE_INTEGER)

  const newEffect: Effect = {
    id: `anno-${kind}-${Date.now()}`,
    type: EffectType.Annotation,
    startTime,
    endTime,
    enabled: data.enabled !== undefined ? data.enabled : true,
    data: { kind, ...(data.data || {}) }
  }

  context.executeCommand('AddEffect', newEffect)
}

/**
 * Apply changes to an effect based on its type.
 * 
 * Handles different strategies for different effect types:
 * - Zoom: Toggles generation or updates selected zoom block.
 * - Screen: Updates selected screen effect.
 * - Webcam: Updates selected webcam overlay.
 * - Annotation/Keystroke/Cursor/Background: Handles global or singleton effect updates.
 * 
 * @param type - The type of effect to change.
 * @param data - The new data to apply (can include 'enabled').
 * @param context - Context containing current project, effects, and command executor.
 */
export async function applyEffectChange(
  type: EffectType,
  data: any,
  context: EffectChangeContext
): Promise<void> {
  if (type === EffectType.Zoom && (data?.enabled !== undefined || data?.regenerate)) {
    if (data?.enabled !== undefined) {
      if (data.enabled) {
        const existingZoomEffects = context.effects.filter(effect => effect.type === EffectType.Zoom)
        if (existingZoomEffects.length > 0) {
          existingZoomEffects.forEach(effect => {
            updateEffectEnabled(context.executeCommand, effect.id, true)
          })
          return
        }
        await maybeGenerateZoomEffects(context, data.enabled)
      } else {
        context.effects.forEach(effect => {
          if (effect.type === EffectType.Zoom) {
            updateEffectEnabled(context.executeCommand, effect.id, false)
          }
        })
      }
    }
    return
  }

  if (type === EffectType.Zoom && context.selectedEffectLayer?.type === EffectLayerType.Zoom) {
    updateSelectedBlock(context, EffectType.Zoom, data ?? {})
    return
  }

  if (type === EffectType.Screen && context.selectedEffectLayer?.type === EffectLayerType.Screen) {
    updateSelectedBlock(context, EffectType.Screen, data ?? {})
    return
  }

  // NOTE: EffectType.Webcam is no longer handled here.
  // Webcam styling lives on clip.layout and is updated via WebcamTab -> UpdateClipLayout command

  if (type === EffectType.Annotation) {
    updateAnnotationEffect(context, data)
    return
  }

  if (type === EffectType.Keystroke) {
    const { enabled, ...effectData } = data ?? {}
    updateKeystrokeEffects(context, effectData, enabled)
    return
  }

  if (type === EffectType.Cursor || type === EffectType.Background) {
    const { enabled, ...effectData } = data ?? {}
    ensureGlobalEffect(context, type, effectData, enabled)
  }
}
