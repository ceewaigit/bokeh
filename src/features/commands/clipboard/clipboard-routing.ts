import { EffectStore } from '@/features/effects/core/store'
import { isGlobalEffectType } from '@/features/effects/core/classification'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType } from '@/types/effects'
import type { Effect, Project } from '@/types/project'
import { EffectType } from '@/types/project'

const LAYER_TO_EFFECT_TYPE: Partial<Record<EffectLayerType, EffectType>> = {
  [EffectLayerType.Zoom]: EffectType.Zoom,
  [EffectLayerType.Cursor]: EffectType.Cursor,
  [EffectLayerType.Background]: EffectType.Background,
  [EffectLayerType.Keystroke]: EffectType.Keystroke,
  [EffectLayerType.Screen]: EffectType.Screen,
  [EffectLayerType.Plugin]: EffectType.Plugin,
  [EffectLayerType.Crop]: EffectType.Crop,
  [EffectLayerType.Webcam]: EffectType.Webcam,
  [EffectLayerType.Annotation]: EffectType.Annotation,
}

export type ClipboardEffectRoute = 'zoom' | 'global' | 'block'

export function getEffectTypeFromLayer(layerType: EffectLayerType): EffectType | null {
  return LAYER_TO_EFFECT_TYPE[layerType] ?? null
}

export function getClipboardEffectRoute(effectType: EffectType): ClipboardEffectRoute {
  if (effectType === EffectType.Zoom) return 'zoom'
  if (isGlobalEffectType(effectType)) return 'global'
  return 'block'
}

export function resolveClipboardEffect(
  project: Project | null,
  selectedEffectLayer: SelectedEffectLayer | null,
  selectedClipId: string | undefined,
  getEffectsForClip?: (clipId: string) => Effect[]
): Effect | null {
  if (!project || !selectedEffectLayer) return null

  const effectType = getEffectTypeFromLayer(selectedEffectLayer.type)
  if (!effectType) return null

  if (selectedEffectLayer.id) {
    const effect = EffectStore.get(project, selectedEffectLayer.id)
    if (!effect || effect.type !== effectType) return null
    return effect
  }

  if (isGlobalEffectType(effectType)) {
    return EffectStore.getAll(project).find(effect => effect.type === effectType) ?? null
  }

  if (selectedClipId && getEffectsForClip) {
    const clipEffects = getEffectsForClip(selectedClipId)
    return clipEffects.find(effect => effect.type === effectType) ?? null
  }

  return null
}
