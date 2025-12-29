/**
 * Effect Filters
 *
 * Centralized filter methods for extracting effects by type.
 * Simplified from 433 lines to ~150 lines by using generics.
 *
 * NOTE: Removed WeakMap cache - filtering small arrays is O(n) and fast.
 * The cache added complexity and potential stale data bugs.
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
  PluginEffectData,
  WebcamEffectData
} from '@/types/project'
import { EffectType } from '@/types/project'

// =============================================================================
// GENERIC CORE FUNCTIONS
// =============================================================================

/**
 * Get all effects of a specific type.
 * @param effects - Array of effects
 * @param type - Effect type to filter by
 * @param enabledOnly - If true (default), only return enabled effects
 */
export function getEffectsByType(effects: Effect[], type: EffectType, enabledOnly = true): Effect[] {
  return effects.filter(e => e.type === type && (!enabledOnly || e.enabled !== false))
}

/**
 * Get the first effect of a specific type.
 */
export function getEffectByType(effects: Effect[], type: EffectType): Effect | undefined {
  return effects.find(e => e.type === type)
}

/**
 * Get effects active at a specific time.
 * Boundary: startTime <= timeMs < endTime (inclusive start, exclusive end)
 */
export function getActiveEffectsByType(effects: Effect[], type: EffectType, timeMs: number): Effect[] {
  return effects.filter(e =>
    e.type === type &&
    e.enabled !== false &&
    e.startTime <= timeMs &&
    e.endTime > timeMs
  )
}

/**
 * Get the first effect active at a specific time.
 */
export function getActiveEffectByType(effects: Effect[], type: EffectType, timeMs: number): Effect | undefined {
  return effects.find(e =>
    e.type === type &&
    e.enabled !== false &&
    e.startTime <= timeMs &&
    e.endTime > timeMs
  )
}

/**
 * Check if any effect of the given type exists.
 */
export function hasEffectOfType(effects: Effect[], type: EffectType, enabledOnly = false): boolean {
  return effects.some(e => e.type === type && (!enabledOnly || e.enabled !== false))
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

// =============================================================================
// TYPE-SPECIFIC SHORTCUTS (thin wrappers for common use cases)
// =============================================================================

// --- Zoom ---
export const getZoomEffects = (effects: Effect[]) => getEffectsByType(effects, EffectType.Zoom)
export const getActiveZoomEffects = (effects: Effect[], timeMs: number) => getActiveEffectsByType(effects, EffectType.Zoom, timeMs)
export const hasActiveZoomEffects = (effects: Effect[]) => hasEffectOfType(effects, EffectType.Zoom, true)

// --- Screen ---
export const getScreenEffects = (effects: Effect[]) => getEffectsByType(effects, EffectType.Screen)
export const getActiveScreenEffects = (effects: Effect[], timeMs: number) => getActiveEffectsByType(effects, EffectType.Screen, timeMs)

// --- Cursor ---
export const getCursorEffect = (effects: Effect[]) => getEffectByType(effects, EffectType.Cursor)

// --- Background ---
export const getBackgroundEffect = (effects: Effect[]) => effects.find(e => e.type === EffectType.Background && e.enabled !== false)
export function getActiveBackgroundEffect(effects: Effect[], timeMs: number): Effect | undefined {
  // Try time-based first, fall back to any enabled background
  return getActiveEffectByType(effects, EffectType.Background, timeMs)
    ?? effects.find(e => e.type === EffectType.Background && e.enabled !== false)
}

// --- Keystroke ---
export const getKeystrokeEffects = (effects: Effect[]) => getEffectsByType(effects, EffectType.Keystroke, false)
export const getKeystrokeEffect = (effects: Effect[]) => getEffectByType(effects, EffectType.Keystroke)
export const hasKeystrokeTrack = (effects: Effect[]) => hasEffectOfType(effects, EffectType.Keystroke)
export const hasEnabledKeystrokeEffects = (effects: Effect[]) => hasEffectOfType(effects, EffectType.Keystroke, true)

// --- Webcam ---
export const getWebcamEffect = (effects: Effect[]) => getEffectByType(effects, EffectType.Webcam)
export const getWebcamEffects = (effects: Effect[]) => getEffectsByType(effects, EffectType.Webcam, false)
export const hasWebcamEffect = (effects: Effect[]) => hasEffectOfType(effects, EffectType.Webcam, true)

// --- Crop ---
export const getCropEffects = (effects: Effect[]) => getEffectsByType(effects, EffectType.Crop)
export const getCropEffect = (effects: Effect[]) => getEffectByType(effects, EffectType.Crop)
export const hasCropEffect = (effects: Effect[]) => hasEffectOfType(effects, EffectType.Crop, true)
export function getActiveCropEffect(effects: Effect[], timeMs: number): Effect | undefined {
  return getActiveEffectByType(effects, EffectType.Crop, timeMs)
    ?? effects.find(e => e.type === EffectType.Crop && e.enabled !== false)
}
export function getCropEffectForClip(effects: Effect[], clip: Clip): Effect | undefined {
  return effects.find(e => e.type === EffectType.Crop && e.clipId === clip.id)
}

// --- Plugin ---
export const getPluginEffects = (effects: Effect[]) => getEffectsByType(effects, EffectType.Plugin)
export const getAllPluginEffects = (effects: Effect[]) => getEffectsByType(effects, EffectType.Plugin, false)
export const hasPluginEffects = (effects: Effect[]) => hasEffectOfType(effects, EffectType.Plugin)

// =============================================================================
// DATA ACCESSORS (type-safe extraction of effect data)
// =============================================================================

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

export function getWebcamData(effect: Effect): WebcamEffectData | null {
  return effect.type === EffectType.Webcam ? effect.data : null
}

// =============================================================================
// ASSERTIONS (fail-fast validation)
// =============================================================================

export function assertEffectType<T extends Effect>(
  effect: Effect | undefined | null,
  type: EffectType,
  message?: string
): asserts effect is T {
  if (!effect) {
    throw new Error(message ?? `Expected effect of type ${type}, got undefined`)
  }
  if (effect.type !== type) {
    throw new Error(message ?? `Expected effect type ${type}, got ${effect.type}`)
  }
}

export function assertEffectExists<T extends Effect>(
  effect: T | undefined | null,
  context?: string
): asserts effect is T {
  if (!effect) {
    throw new Error(context ? `Effect not found: ${context}` : 'Expected effect to exist')
  }
}

// =============================================================================
// TIME RANGE FILTERING
// =============================================================================

/**
 * Filter effects that overlap with a clip's timeline range.
 */
export function filterEffectsForClip(effects: Effect[], clip: Clip): Effect[] {
  const clipStart = clip.startTime
  const clipEnd = clip.startTime + clip.duration
  return effects.filter(e => e.startTime < clipEnd && e.endTime > clipStart)
}

/**
 * Filter effects that overlap with a specific timeline range.
 */
export function filterEffectsForTimeRange(effects: Effect[], startTime: number, endTime: number): Effect[] {
  return effects.filter(e => e.startTime < endTime && e.endTime > startTime)
}

/**
 * Filter events that fall within a source range.
 */
export function filterEventsForSourceRange<T extends { timestamp: number }>(
  events: T[],
  sourceIn: number,
  sourceOut: number
): T[] {
  return events.filter(e => e.timestamp >= sourceIn && e.timestamp <= sourceOut)
}

/**
 * Get the active effect at a specific timeline position.
 */
export function getActiveEffectAtTime(effects: Effect[], timeMs: number): Effect | undefined {
  return effects.find(e => timeMs >= e.startTime && timeMs < e.endTime)
}

/**
 * Get all active effects at a specific timeline position.
 */
export function getActiveEffectsAtTime(effects: Effect[], timeMs: number): Effect[] {
  return effects.filter(e => timeMs >= e.startTime && timeMs < e.endTime)
}
