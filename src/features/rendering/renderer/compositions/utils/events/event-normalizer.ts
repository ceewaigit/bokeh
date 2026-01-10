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

type NormalizeMouseOptions = {
  /**
   * Capture-area scale factor (e.g. Retina 2.0). When provided, we can detect
   * whether recorded mouse coordinates are "physical" pixels and normalize
   * against scaled screen dimensions to keep cursor/zoom alignment.
   */
  scaleFactor?: number;
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
function normalizeMouseCoordinates(events: MouseEvent[], options?: NormalizeMouseOptions): MouseEvent[] {
  if (events.length === 0) return events;

  const providedScaleFactor = options?.scaleFactor ?? 1;
  const firstEvent = events[0];
  const fallbackWidth = firstEvent.captureWidth || firstEvent.screenWidth || 1920;
  const fallbackHeight = firstEvent.captureHeight || firstEvent.screenHeight || 1080;

  const looksPhysical = events.some((e) => {
    const sw = e.screenWidth || 0;
    const sh = e.screenHeight || 0;
    return (sw > 0 && e.x > sw * 1.1) || (sh > 0 && e.y > sh * 1.1);
  });

  // Some older recordings omit `captureWidth/Height` and `captureArea.scaleFactor`.
  // If coordinates look "physical" (Retina), infer a reasonable scale factor from observed ratios.
  const inferredScaleFactor = (() => {
    if (providedScaleFactor > 1) return providedScaleFactor;
    if (!looksPhysical) return 1;

    let maxRatio = 1;
    for (const e of events) {
      const sw = e.screenWidth || 0;
      const sh = e.screenHeight || 0;
      if (sw > 0 && e.x > sw * 1.1) maxRatio = Math.max(maxRatio, e.x / sw);
      if (sh > 0 && e.y > sh * 1.1) maxRatio = Math.max(maxRatio, e.y / sh);
    }

    if (maxRatio < 1.2) return 1;
    if (maxRatio < 1.75) return 1.5;
    if (maxRatio < 2.5) return 2;
    if (maxRatio < 3.5) return 3;
    return 4;
  })();

  const hasPhysicalCoords = looksPhysical && inferredScaleFactor > 1;

  return events.map((event) => {
    const screenW = event.screenWidth || fallbackWidth;
    const screenH = event.screenHeight || fallbackHeight;

    const captureW = event.captureWidth
      ?? (hasPhysicalCoords ? Math.round(screenW * inferredScaleFactor) : screenW);
    const captureH = event.captureHeight
      ?? (hasPhysicalCoords ? Math.round(screenH * inferredScaleFactor) : screenH);

    return {
      ...event,
      x: event.x / (captureW || 1),
      y: event.y / (captureH || 1),
      captureWidth: captureW,
      captureHeight: captureH,
    };
  });
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

export const normalizeMouseEvents = (events?: MouseEvent[] | null, options?: NormalizeMouseOptions): MouseEvent[] => {
  const timestampNormalized = normalizeEventsToSourceSpace(events);
  return normalizeMouseCoordinates(timestampNormalized, options);
};

export const normalizeClickEvents = (events?: ClickEvent[] | null, referenceMouseEvents?: MouseEvent[]): ClickEvent[] => {
  const timestampNormalized = normalizeEventsToSourceSpace(events);
  return normalizeClickCoordinates(timestampNormalized, referenceMouseEvents);
};
