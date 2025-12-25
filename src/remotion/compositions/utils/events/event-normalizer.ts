import type { ClickEvent, MouseEvent } from '@/types/project';

type TimestampedEvent = {
  timestamp: number;
  sourceTimestamp?: number;
};

const getEventSourceTimestamp = (event: TimestampedEvent): number => (
  typeof event.sourceTimestamp === 'number' ? event.sourceTimestamp : event.timestamp
);

/**
 * Normalize event timelines so all timestamps live in source space and are monotonic.
 * This prevents chunked renders (which restart the Remotion frame clock) from feeding
 * discontinuous time deltas into smoothing/interpolation logic.
 */
function normalizeEventsToSourceSpace<T extends TimestampedEvent>(events?: T[] | null): T[] {
  if (!events || events.length === 0) {
    return [];
  }

  const normalized = events
    .map((event) => ({
      ...event,
      timestamp: getEventSourceTimestamp(event),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  let lastTimestamp = normalized[0].timestamp;
  for (let i = 1; i < normalized.length; i++) {
    const current = normalized[i];
    if (current.timestamp < lastTimestamp) {
      normalized[i] = {
        ...current,
        timestamp: lastTimestamp,
      };
    } else {
      lastTimestamp = current.timestamp;
    }
  }

  return normalized;
}

export const normalizeMouseEvents = (events?: MouseEvent[] | null): MouseEvent[] =>
  normalizeEventsToSourceSpace(events);

export const normalizeClickEvents = (events?: ClickEvent[] | null): ClickEvent[] =>
  normalizeEventsToSourceSpace(events);
