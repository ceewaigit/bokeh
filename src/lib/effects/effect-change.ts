import type { Clip, Effect, Project, Recording, ZoomEffectData } from '@/types/project'
import { EffectType, TrackType } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType } from '@/types/effects'
import { resolveEffectIdForType } from '@/lib/effects/effect-selection'

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
  }

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

  const { EffectGenerationService } = await import('@/lib/effects/effect-generation-service')
  const allClips = project.timeline.tracks.flatMap(t => t.clips)
  const clipForRecording = allClips.find(c => c.recordingId === recording.id)

  if (!clipForRecording) return

  const { zoomEffects, screenEffects } = EffectGenerationService.generateZoomEffects(recording, clipForRecording)
  for (const effect of [...zoomEffects, ...screenEffects]) {
    context.executeCommand('AddEffect', effect)
  }
}

function updateKeystrokeEffects(
  context: EffectChangeContext,
  data: Record<string, unknown>,
  enabled?: boolean
): void {
  const keystrokeEffects = context.effects.filter(e => e.type === EffectType.Keystroke)
  if (keystrokeEffects.length > 0) {
    keystrokeEffects.forEach(effect => {
      updateEffectData(context.executeCommand, effect.id, data, enabled ?? effect.enabled)
    })
    return
  }

  const newEffect: Effect = {
    id: `keystroke-global-${Date.now()}`,
    type: EffectType.Keystroke,
    startTime: 0,
    endTime: Number.MAX_SAFE_INTEGER,
    data,
    enabled: enabled ?? true
  }

  context.executeCommand('AddEffect', newEffect)
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

export async function applyEffectChange(
  type: EffectType,
  data: any,
  context: EffectChangeContext
): Promise<void> {
  if (type === EffectType.Zoom && (data?.enabled !== undefined || data?.regenerate)) {
    if (data?.enabled !== undefined) {
      if (data.enabled) {
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

  if (type === EffectType.Webcam) {
    const { enabled, ...effectData } = data ?? {}
    const selectedId = resolveEffectIdForType(context.effects, context.selectedEffectLayer, EffectType.Webcam)
    if (!selectedId) {
      const project = context.currentProject
      if (!project) {
        console.error('[EffectChange] Webcam updates require an active project')
        return
      }
      const webcamTrack = project.timeline.tracks.find(track => track.type === TrackType.Webcam)
      const webcamClips = webcamTrack?.clips ?? []
      if (webcamClips.length === 0) {
        console.error('[EffectChange] Webcam updates require a webcam clip on the timeline')
        return
      }

      const maxEndTime = webcamClips.reduce(
        (max, clip) => Math.max(max, clip.startTime + clip.duration),
        0
      )

      const newEffect: Effect = {
        id: `webcam-global-${Date.now()}`,
        type: EffectType.Webcam,
        startTime: 0,
        endTime: maxEndTime > 0 ? maxEndTime : Number.MAX_SAFE_INTEGER,
        data: effectData,
        enabled: enabled ?? true
      }

      context.executeCommand('AddEffect', newEffect)
      return
    }

    updateEffectData(context.executeCommand, selectedId, effectData, enabled)
    return
  }

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
