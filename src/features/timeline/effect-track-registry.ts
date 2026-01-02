/**
 * Effect Track Registry
 *
 * SINGLE SOURCE OF TRUTH for all effect-based timeline tracks.
 * To add a new effect track, simply add an entry here - no other files need updating.
 */

import { EffectType, EffectLayerType } from '@/types/effects'
import type { Effect, PluginEffectData } from '@/types/project'
import { PluginRegistry } from '@/features/effects/config/plugin-registry'
import { screenTrackConfig } from '@/features/screen/config'
import { zoomTrackConfig } from '@/features/editor/logic/viewport/zoom/config'

export interface EffectTrackConfig {
  /** Display label for the track */
  label: string
  /** Order in which tracks appear (lower = higher on timeline) */
  order: number
  /** Color key from useTimelineColors() */
  colorKey: 'zoomBlock' | 'screenBlock' | 'keystrokeBlock' | 'annotationBlock' | 'warning' | 'primary' | 'muted'
  /** Generate label for individual blocks */
  getBlockLabel: (effect: Effect) => string
  /** EffectLayerType for selection */
  layerType: EffectLayerType
}

import { keystrokeTrackConfig } from '@/features/keystroke/config'
import { annotationTrackConfig } from '@/features/annotation/config'

/**
 * Registry of all effect types that should have timeline tracks.
 * Add new effect tracks here - everything else is derived automatically.
 */
export const EFFECT_TRACK_REGISTRY: Partial<Record<EffectType, EffectTrackConfig>> = {
  [EffectType.Zoom]: zoomTrackConfig,
  [EffectType.Screen]: screenTrackConfig,
  [EffectType.Keystroke]: keystrokeTrackConfig,
  [EffectType.Plugin]: {
    label: 'Plugins',
    order: 3,
    colorKey: 'primary',
    layerType: EffectLayerType.Plugin,
    getBlockLabel: (effect) => {
      const data = effect.data as PluginEffectData
      const plugin = data?.pluginId ? PluginRegistry.get(data.pluginId) : null
      return plugin?.name?.slice(0, 8) ?? 'Plugin'
    }
  },
  [EffectType.Annotation]: annotationTrackConfig
}

/** Effect types that have timeline tracks */
export const EFFECT_TRACK_TYPES = Object.keys(EFFECT_TRACK_REGISTRY) as EffectType[]

/** Get config for an effect type, or undefined if it doesn't have a track */
export function getEffectTrackConfig(type: EffectType): EffectTrackConfig | undefined {
  return EFFECT_TRACK_REGISTRY[type]
}

/** Check if an effect type has a timeline track */
export function hasEffectTrack(type: EffectType): boolean {
  return type in EFFECT_TRACK_REGISTRY
}

/** Get all track configs sorted by order */
export function getSortedTrackConfigs(): Array<{ type: EffectType; config: EffectTrackConfig }> {
  return EFFECT_TRACK_TYPES
    .map(type => ({ type, config: EFFECT_TRACK_REGISTRY[type]! }))
    .sort((a, b) => a.config.order - b.config.order)
}
