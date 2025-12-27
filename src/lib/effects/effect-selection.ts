import type { Effect } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectType } from '@/types/project'

export function resolveEffectIdForType(
  effects: Effect[],
  selectedEffectLayer: SelectedEffectLayer | undefined,
  effectType: EffectType
): string | null {
  if (selectedEffectLayer?.id && selectedEffectLayer.type === effectType) {
    return selectedEffectLayer.id
  }

  const matching = effects.filter(effect => effect.type === effectType)
  if (matching.length === 1) {
    return matching[0].id
  }

  return null
}
