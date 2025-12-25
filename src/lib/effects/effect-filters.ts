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

// =============================================================================
// TIME-BASED ACTIVE EFFECT LOOKUPS
// =============================================================================
//
// BOUNDARY SEMANTICS: startTime <= timeMs < endTime (inclusive start, exclusive end)
// This is consistent with how clips work: a clip at frame 0-30 owns frames 0-29.
// An effect at time 0-1000ms is active from 0ms up to (but not including) 1000ms.
//
// This eliminates the subtle bugs where different hooks used different boundary logic.
// =============================================================================

/**
 * Get the active background effect at a specific time.
 * Returns the FIRST enabled background effect whose time range contains timeMs.
 */
export function getActiveBackgroundEffect(effects: Effect[], timeMs: number): Effect | undefined {
  const timed = effects.find(e =>
    e.type === EffectType.Background &&
    e.enabled !== false &&
    e.startTime <= timeMs &&
    e.endTime > timeMs
  )
  if (timed) return timed
  return effects.find(e =>
    e.type === EffectType.Background &&
    e.enabled !== false
  )
}

/**
 * Get the active crop effect at a specific time.
 * Returns the FIRST enabled crop effect whose time range contains timeMs.
 */
export function getActiveCropEffect(effects: Effect[], timeMs: number): Effect | undefined {
  const timed = effects.find(e =>
    e.type === EffectType.Crop &&
    e.enabled !== false &&
    e.startTime <= timeMs &&
    e.endTime > timeMs
  )
  if (timed) return timed
  return effects.find(e =>
    e.type === EffectType.Crop &&
    e.enabled !== false
  )
}

/**
 * Get all active zoom effects at a specific time.
 * Returns enabled zoom effects whose time range contains timeMs.
 */
export function getActiveZoomEffects(effects: Effect[], timeMs: number): Effect[] {
  return effects.filter(e =>
    e.type === EffectType.Zoom &&
    e.enabled &&
    e.startTime <= timeMs &&
    e.endTime > timeMs
  )
}

/**
 * Get all active screen effects at a specific time.
 * Returns enabled screen effects whose time range contains timeMs.
 */
export function getActiveScreenEffects(effects: Effect[], timeMs: number): Effect[] {
  return effects.filter(e =>
    e.type === EffectType.Screen &&
    e.enabled &&
    e.startTime <= timeMs &&
    e.endTime > timeMs
  )
}

/**
 * Check if any effect of the given type is active at the specified time.
 */
export function hasActiveEffectOfType(effects: Effect[], type: EffectType, timeMs: number): boolean {
  return effects.some(e =>
    e.type === type &&
    e.enabled !== false &&
    e.startTime <= timeMs &&
    e.endTime > timeMs
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

// =============================================================================
// CLIP/TIME RANGE FILTERING
// =============================================================================
//
// These functions were consolidated from remotion/compositions/utils/effects/effect-filters.ts
// to create a single source of truth for effect filtering.
// =============================================================================

/**
 * Filter effects that overlap with a clip's timeline range.
 * Effects are in timeline-space, so we check if the effect's time range
 * overlaps with the clip's time range.
 *
 * @param effects - Array of effects to filter
 * @param clip - The clip to filter effects for
 * @returns Effects that overlap with the clip's timeline range
 */
export function filterEffectsForClip(effects: Effect[], clip: Clip): Effect[] {
  const clipStart = clip.startTime
  const clipEnd = clip.startTime + clip.duration

  return effects.filter(
    (effect) => effect.startTime < clipEnd && effect.endTime > clipStart
  )
}

/**
 * Filter effects that overlap with a specific timeline range.
 *
 * @param effects - Array of effects to filter
 * @param startTime - Start of the time range (ms)
 * @param endTime - End of the time range (ms)
 * @returns Effects that overlap with the specified range
 */
export function filterEffectsForTimeRange(
  effects: Effect[],
  startTime: number,
  endTime: number
): Effect[] {
  return effects.filter(
    (effect) => effect.startTime < endTime && effect.endTime > startTime
  )
}

/**
 * Event with a timestamp property (common to all metadata events).
 */
interface TimestampedEvent {
  timestamp: number
}

/**
 * Filter events that fall within a clip's source range.
 * Events are in source-space (recording timestamps), so we check if the
 * event's timestamp falls within the clip's sourceIn/sourceOut range.
 *
 * @param events - Array of timestamped events to filter
 * @param sourceIn - Start of the source range (ms)
 * @param sourceOut - End of the source range (ms)
 * @returns Events within the source range
 */
export function filterEventsForSourceRange<T extends TimestampedEvent>(
  events: T[],
  sourceIn: number,
  sourceOut: number
): T[] {
  return events.filter(
    (event) => event.timestamp >= sourceIn && event.timestamp <= sourceOut
  )
}

/**
 * Get the active effect at a specific timeline position.
 * Returns the first effect that contains the given time.
 *
 * @param effects - Array of effects to search
 * @param timeMs - Timeline position in milliseconds
 * @returns The active effect or undefined
 */
export function getActiveEffectAtTime(
  effects: Effect[],
  timeMs: number
): Effect | undefined {
  return effects.find(
    (effect) => timeMs >= effect.startTime && timeMs < effect.endTime
  )
}

/**
 * Get all active effects at a specific timeline position.
 * Returns all effects that contain the given time (effects can overlap).
 *
 * @param effects - Array of effects to search
 * @param timeMs - Timeline position in milliseconds
 * @returns Array of active effects
 */
export function getActiveEffectsAtTime(
  effects: Effect[],
  timeMs: number
): Effect[] {
  return effects.filter(
    (effect) => timeMs >= effect.startTime && timeMs < effect.endTime
  )
}
