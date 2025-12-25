/**
 * Effect Filters
 *
 * Centralized filter methods for extracting effects by type.
 * Uses WeakMap cache for performance - cache auto-invalidates when effects array changes.
 */
import type {
  Effect,
  Clip,
  ZoomEffectData,
  CursorEffectData,
  BackgroundEffectData,
  KeystrokeEffectData,
  ScreenEffectData,
  CropEffectData,
  PluginEffectData
} from '@/types/project'
import { EffectType } from '@/types/project'

// Cache for filtered effects to avoid repeated filtering
// Uses WeakMap so cache entries are garbage collected when effects array is GC'd
type EffectsCacheEntry = {
  zoom: Effect[]
  screen: Effect[]
  keystroke: Effect[]
  plugin: Effect[]
  pluginAll: Effect[]
  crop: Effect[]
}

const effectsCache = new WeakMap<Effect[], EffectsCacheEntry>()

function getCacheEntry(effects: Effect[]): EffectsCacheEntry {
  let entry = effectsCache.get(effects)
  if (!entry) {
    entry = {
      zoom: [],
      screen: [],
      keystroke: [],
      plugin: [],
      pluginAll: [],
      crop: []
    }
    effectsCache.set(effects, entry)
  }
  return entry
}

// --- Zoom Effects ---

export function getZoomEffects(effects: Effect[]): Effect[] {
  if (effects.length === 0) return []
  const cache = getCacheEntry(effects)
  if (cache.zoom.length === 0 && effects.length > 0) {
    cache.zoom = effects.filter(e => e.type === EffectType.Zoom && e.enabled)
  }
  return cache.zoom
}

export function hasActiveZoomEffects(effects: Effect[]): boolean {
  return effects.some(e => e.type === EffectType.Zoom && e.enabled)
}

// --- Screen Effects ---

export function getScreenEffects(effects: Effect[]): Effect[] {
  if (effects.length === 0) return []
  const cache = getCacheEntry(effects)
  if (cache.screen.length === 0 && effects.length > 0) {
    cache.screen = effects.filter(e => e.type === EffectType.Screen && e.enabled)
  }
  return cache.screen
}

// --- Cursor Effects ---

export function getCursorEffect(effects: Effect[]): Effect | undefined {
  return effects.find(e => e.type === EffectType.Cursor)
}

// --- Keystroke Effects ---

export function getKeystrokeEffects(effects: Effect[]): Effect[] {
  if (effects.length === 0) return []
  const cache = getCacheEntry(effects)
  if (cache.keystroke.length === 0 && effects.length > 0) {
    cache.keystroke = effects.filter(e => e.type === EffectType.Keystroke)
  }
  return cache.keystroke
}

export function getKeystrokeEffect(effects: Effect[]): Effect | undefined {
  return effects.find(e => e.type === EffectType.Keystroke)
}

export function hasKeystrokeTrack(effects: Effect[]): boolean {
  return effects.some(e => e.type === EffectType.Keystroke)
}

export function hasEnabledKeystrokeEffects(effects: Effect[]): boolean {
  return effects.some(e => e.type === EffectType.Keystroke && e.enabled)
}

// --- Background Effects ---

export function getBackgroundEffect(effects: Effect[]): Effect | undefined {
  return effects.find(e => e.type === EffectType.Background && e.enabled)
}

// --- Crop Effects ---

export function getCropEffects(effects: Effect[]): Effect[] {
  if (effects.length === 0) return []
  const cache = getCacheEntry(effects)
  if (cache.crop.length === 0 && effects.length > 0) {
    cache.crop = effects.filter(e => e.type === EffectType.Crop && e.enabled)
  }
  return cache.crop
}

export function getCropEffect(effects: Effect[]): Effect | undefined {
  return effects.find(e => e.type === EffectType.Crop)
}

export function hasCropEffect(effects: Effect[]): boolean {
  return effects.some(e => e.type === EffectType.Crop && e.enabled)
}

// --- Plugin Effects ---

export function getPluginEffects(effects: Effect[]): Effect[] {
  if (effects.length === 0) return []
  const cache = getCacheEntry(effects)
  if (cache.plugin.length === 0 && effects.length > 0) {
    cache.plugin = effects.filter(e => e.type === EffectType.Plugin && e.enabled)
  }
  return cache.plugin
}

export function getAllPluginEffects(effects: Effect[]): Effect[] {
  if (effects.length === 0) return []
  const cache = getCacheEntry(effects)
  if (cache.pluginAll.length === 0 && effects.length > 0) {
    cache.pluginAll = effects.filter(e => e.type === EffectType.Plugin)
  }
  return cache.pluginAll
}

export function hasPluginEffects(effects: Effect[]): boolean {
  return effects.some(e => e.type === EffectType.Plugin)
}

/**
 * Get crop effect for a specific clip.
 * Match by clipId (robust, survives reflow/split)
 */
export function getCropEffectForClip(effects: Effect[], clip: Clip): Effect | undefined {
  return effects.find(e =>
    e.type === EffectType.Crop &&
    e.clipId === clip.id
  )
}

// --- Data Accessors ---

export function getZoomData(effect: Effect): ZoomEffectData | null {
  return effect.type === EffectType.Zoom ? effect.data : null
}

export function getCursorData(effect: Effect): CursorEffectData | null {
  return effect.type === EffectType.Cursor ? effect.data : null
}

export function getBackgroundData(effect: Effect): BackgroundEffectData | null {
  return effect.type === EffectType.Background ? effect.data : null
}

export function getKeystrokeData(effect: Effect): KeystrokeEffectData | null {
  return effect.type === EffectType.Keystroke ? effect.data : null
}

export function getScreenData(effect: Effect): ScreenEffectData | null {
  return effect.type === EffectType.Screen ? effect.data : null
}

export function getCropData(effect: Effect): CropEffectData | null {
  return effect.type === EffectType.Crop ? effect.data : null
}

export function getPluginData(effect: Effect): PluginEffectData | null {
  return effect.type === EffectType.Plugin ? effect.data : null
}
