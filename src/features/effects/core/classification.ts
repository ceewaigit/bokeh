import { EffectType } from '@/types/project'

const BLOCK_EFFECT_DEFAULT_DURATION: Partial<Record<EffectType, number>> = {
  [EffectType.Keystroke]: 5000,
  [EffectType.Screen]: 3000,
  // NOTE: Webcam removed - now handled via clip.layout
}

export function isGlobalEffectType(type: EffectType): boolean {
  return type === EffectType.Cursor || type === EffectType.Background
}

export function getBlockEffectDuration(type: EffectType, clipboardDuration?: number): number {
  if (typeof clipboardDuration === 'number' && clipboardDuration > 0) {
    return clipboardDuration
  }
  return BLOCK_EFFECT_DEFAULT_DURATION[type] ?? 3000
}

