/**
 * Effect and Event Filtering Utilities
 *
 * Centralized utilities for filtering effects and metadata events.
 * Eliminates duplicated filtering logic across ClipContext and other components.
 */

import type { Clip, Effect } from '@/types/project';

/**
 * Event with a timestamp property (common to all metadata events)
 */
interface TimestampedEvent {
  timestamp: number;
}

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
  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;

  return effects.filter(
    (effect) => effect.startTime < clipEnd && effect.endTime > clipStart
  );
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
  );
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
  );
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
  );
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
  );
}
