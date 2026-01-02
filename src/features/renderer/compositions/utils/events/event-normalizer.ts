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

/**
 * Normalize mouse event coordinates to 0-1 range.
 * This makes cursor calculations resolution-agnostic and eliminates
 * performance variance between different source video resolutions.
 *
 * Events are marked with `normalized: true` so consumers know coordinates are 0-1.
 */
function normalizeMouseCoordinates(events: MouseEvent[]): MouseEvent[] {
  if (events.length === 0) return events;

  // Get capture dimensions from first event (SSOT for this recording)
  const firstEvent = events[0];
  const captureWidth = firstEvent.captureWidth || firstEvent.screenWidth || 1920;
  const captureHeight = firstEvent.captureHeight || firstEvent.screenHeight || 1080;

  // Skip if already normalized
  if ((firstEvent as any).normalized === true) {
    return events;
  }

  return events.map(event => ({
    ...event,
    // Normalize to 0-1 range
    x: event.x / captureWidth,
    y: event.y / captureHeight,
    // Mark as normalized so we don't double-normalize
    normalized: true,
    // Preserve original dimensions for reference
    captureWidth,
    captureHeight,
  } as MouseEvent));
}

/**
 * Normalize click event coordinates to 0-1 range.
 */
function normalizeClickCoordinates(events: ClickEvent[], referenceMouseEvents?: MouseEvent[]): ClickEvent[] {
  if (events.length === 0) return events;

  // Get capture dimensions from first event or reference mouse events
  const firstEvent = events[0];
  const firstMouseEvent = referenceMouseEvents?.[0];
  const captureWidth = (firstEvent as any).captureWidth || firstMouseEvent?.captureWidth || firstMouseEvent?.screenWidth || 1920;
  const captureHeight = (firstEvent as any).captureHeight || firstMouseEvent?.captureHeight || firstMouseEvent?.screenHeight || 1080;

  // Skip if already normalized
  if ((firstEvent as any).normalized === true) {
    return events;
  }

  return events.map(event => ({
    ...event,
    x: event.x / captureWidth,
    y: event.y / captureHeight,
    normalized: true,
    captureWidth,
    captureHeight,
  } as ClickEvent));
}

/**
 * Normalize mouse events: both timestamps and coordinates.
 * Coordinates are converted to 0-1 range for resolution-agnostic processing.
 */
export const normalizeMouseEvents = (events?: MouseEvent[] | null): MouseEvent[] => {
  const timestampNormalized = normalizeEventsToSourceSpace(events);
  return normalizeMouseCoordinates(timestampNormalized);
};

/**
 * Normalize click events: both timestamps and coordinates.
 * Pass referenceMouseEvents to get capture dimensions if click events don't have them.
 */
export const normalizeClickEvents = (events?: ClickEvent[] | null, referenceMouseEvents?: MouseEvent[]): ClickEvent[] => {
  const timestampNormalized = normalizeEventsToSourceSpace(events);
  return normalizeClickCoordinates(timestampNormalized, referenceMouseEvents);
};
