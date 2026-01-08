import type { ClickEvent, MouseEvent } from '@/types/project';

/**
 * Coordinate and time normalization for recording events.
 * 
 * DESIGN PRINCIPLE: 
 * All events used in the renderer MUST be normalized to a 0-1 range.
 * This ensures that effects (cursors, annotations, zoom) behave identically 
 * regardless of the original recording resolution (4K, 1080p, etc).
 */

type TimestampedEvent = {
  timestamp: number;
  sourceTimestamp?: number;
};

const getEventSourceTimestamp = (event: TimestampedEvent): number => (
  typeof event.sourceTimestamp === 'number' ? event.sourceTimestamp : event.timestamp
);

/**
 * Normalize event timelines so all timestamps live in source space and are monotonic.
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

/**
 * Normalize mouse event coordinates to 0-1 range.
 */
function normalizeMouseCoordinates(events: MouseEvent[]): MouseEvent[] {
  if (events.length === 0) return events;

  // Use capture dimensions from the first event as reference
  const firstEvent = events[0];
  const captureWidth = firstEvent.captureWidth || firstEvent.screenWidth || 1920;
  const captureHeight = firstEvent.captureHeight || firstEvent.screenHeight || 1080;

  return events.map(event => ({
    ...event,
    x: event.x / captureWidth,
    y: event.y / captureHeight,
    captureWidth,
    captureHeight,
  }));
}

/**
 * Normalize click event coordinates to 0-1 range.
 */
function normalizeClickCoordinates(events: ClickEvent[], referenceMouseEvents?: MouseEvent[]): ClickEvent[] {
  if (events.length === 0) return events;

  const firstEvent = events[0];
  const firstMouseEvent = referenceMouseEvents?.[0];
  
  const captureWidth = (firstEvent as any).captureWidth || firstMouseEvent?.captureWidth || firstMouseEvent?.screenWidth || 1920;
  const captureHeight = (firstEvent as any).captureHeight || firstMouseEvent?.captureHeight || firstMouseEvent?.screenHeight || 1080;

  return events.map(event => ({
    ...event,
    x: event.x / captureWidth,
    y: event.y / captureHeight,
    captureWidth,
    captureHeight,
  }));
}

export const normalizeMouseEvents = (events?: MouseEvent[] | null): MouseEvent[] => {
  const timestampNormalized = normalizeEventsToSourceSpace(events);
  return normalizeMouseCoordinates(timestampNormalized);
};

export const normalizeClickEvents = (events?: ClickEvent[] | null, referenceMouseEvents?: MouseEvent[]): ClickEvent[] => {
  const timestampNormalized = normalizeEventsToSourceSpace(events);
  return normalizeClickCoordinates(timestampNormalized, referenceMouseEvents);
};
