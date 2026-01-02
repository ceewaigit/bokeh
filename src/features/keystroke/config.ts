import type { KeystrokeEffectData } from '@/types/project'
import { KeystrokePosition } from '@/types/project'
import { EffectLayerType } from '@/types/effects'

// Default keystroke effect data
export const DEFAULT_KEYSTROKE_DATA: KeystrokeEffectData = {
    fontSize: 18,
    fontFamily: 'SF Pro Display, system-ui, -apple-system, sans-serif',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    textColor: '#ffffff',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 15,
    padding: 8,
    fadeOutDuration: 400,
    displayDuration: 2000,
    position: KeystrokePosition.BottomCenter,
    maxWidth: 400,
    stylePreset: 'glass',
    showModifierSymbols: true,
    scale: 1
}

// Effect Track Configuration
export const keystrokeTrackConfig = {
    label: 'Keys',
    order: 2,
    colorKey: 'keystrokeBlock' as const,
    layerType: EffectLayerType.Keystroke,
    getBlockLabel: () => 'Type'
}
