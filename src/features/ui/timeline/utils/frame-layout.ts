
import type { Clip, Recording } from '@/types/project';
import { msToFrameCeil, msToFrameFloor } from '@/features/rendering/renderer/compositions/utils/time/frame-time';
import { ClipUtils } from '@/features/ui/timeline/time/clip-utils';

export interface PersistedVideoState {
  recording: Recording;
  clip: Clip;
  layoutItem: FrameLayoutItem;
  // Source time of the background video at the start of the overlay
  baseSourceTimeMs: number;
  // Whether the video should be frozen (held at last frame) because the overlay extends past the video end
  isFrozen: boolean;
}

export interface FrameLayoutItem {
  clip: Clip;
  startFrame: number;
  durationFrames: number;
  endFrame: number; // exclusive
  groupId: string; // Unique ID for contiguous blocks of clips from same recording
  groupStartFrame: number; // Start frame of the entire contiguous group
  groupStartSourceIn: number; // Source start time (ms) of the entire contiguous group
  groupDuration: number; // Total duration of the contiguous group

  // Explicitly points to the visual content underneath a generated clip
  persistedVideoState?: PersistedVideoState | null;
}

// ============================================================================
// Shared helpers for frame layout building
// ============================================================================

/**
 * Calculate frame timing for a clip
 */
function calculateClipFrames(clip: Clip, fps: number): { startFrame: number; endFrame: number; durationFrames: number } {
  const startFrame = msToFrameFloor(clip.startTime, fps);
  const endFrame = Math.max(startFrame + 1, msToFrameCeil(ClipUtils.getEndTime(clip), fps));
  const durationFrames = endFrame - startFrame;
  return { startFrame, endFrame, durationFrames };
}

/**
 * Check if two consecutive clips should be grouped together.
 * Both video and webcam use the same logic - clips with different playback rates
 * are in separate groups. This allows Remotion's Sequence timing to work correctly.
 */
function checkContiguity(
  lastClip: Clip | null,
  currentClip: Clip,
  startFrame: number,
  lastEndFrame: number,
  fps: number
): boolean {
  if (!lastClip || lastClip.recordingId !== currentClip.recordingId) return false;

  const timelineGapFrames = Math.abs(startFrame - lastEndFrame);
  const timelineGapMs = Math.abs(currentClip.startTime - ClipUtils.getEndTime(lastClip));
  const maxTimelineGapMs = (fps > 0 ? (1000 / fps) : 34) + 1; // allow <= 1 frame + 1ms float drift
  const timelineContiguous = timelineGapFrames <= 1 || timelineGapMs <= maxTimelineGapMs;

  const lastSourceOut = ClipUtils.getSourceOut(lastClip)
  const sourceGap = Math.abs(lastSourceOut - ClipUtils.getSourceIn(currentClip));
  const hasTransition = !!lastClip.transitionOut || !!currentClip.transitionIn;
  // Clips with different playback rates should NOT be grouped - timing formula breaks across rate changes
  const lastRate = ClipUtils.getPlaybackRate(lastClip);
  const currentRate = ClipUtils.getPlaybackRate(currentClip);
  const samePlaybackRate = Math.abs(lastRate - currentRate) < 1e-6;

  return timelineContiguous && sourceGap <= 50 && !hasTransition && samePlaybackRate;
}

/**
 * Generate a stable group ID for a contiguous block of clips
 */
function generateGroupId(prefix: string, recordingId: string, startFrame: number): string {
  return `${prefix}-${recordingId}-${startFrame}`;
}

/**
 * Options for unified frame layout building
 */
interface FrameLayoutOptions {
  clips: Clip[];
  fps: number;
  trackType: 'video' | 'webcam';
  recordingsMap?: Map<string, Recording>;
  sortClips?: boolean;
}

/**
 * Unified frame layout builder that handles both video and webcam tracks.
 *
 * Uses the clip's own duration instead of calculating it based on the next clip's start time.
 * This allows for overlapping tracks where multiple clips can be active at the same time.
 *
 * GROUPING: Assigns a unique groupId to contiguous blocks of clips from the same recording.
 * This allows the renderer to reuse the same video element for seamless playback.
 */
function buildLayout<T extends FrameLayoutItem>(
  options: FrameLayoutOptions,
  createItem: (
    clip: Clip,
    frames: { startFrame: number; endFrame: number; durationFrames: number },
    groupInfo: { groupId: string; groupStartFrame: number; groupStartSourceIn: number }
  ) => T
): T[] {
  const { clips, fps, trackType, sortClips = false } = options;

  if (!clips || clips.length === 0) return [];

  // Optionally sort clips by startTime
  const orderedClips = sortClips
    ? [...clips].sort((a, b) => a.startTime - b.startTime)
    : clips;

  const result: T[] = [];
  let currentGroup: T[] = [];

  const groupPrefix = trackType === 'webcam' ? 'webcam-group' : 'group';
  let currentGroupId = '';
  let currentGroupStartFrame = 0;
  let currentGroupStartSourceIn = 0;

  let lastClip: Clip | null = null;
  let lastEndFrame = -1;

  for (const clip of orderedClips) {
    const frames = calculateClipFrames(clip, fps);
    const { startFrame, endFrame } = frames;

    // Check for continuity
    const isContiguous = checkContiguity(lastClip, clip, startFrame, lastEndFrame, fps);

    if (!isContiguous) {
      // Finish previous group
      if (currentGroup.length > 0) {
        const groupDuration = lastEndFrame - currentGroup[0].startFrame;
        currentGroup.forEach(item => {
          item.groupDuration = groupDuration;
          result.push(item);
        });
        currentGroup = [];
      }

      // Start new group
      currentGroupId = generateGroupId(groupPrefix, clip.recordingId, startFrame);
      currentGroupStartFrame = startFrame;
      currentGroupStartSourceIn = clip.sourceIn || 0;
    }

    lastClip = clip;
    lastEndFrame = endFrame;

    const item = createItem(clip, frames, {
      groupId: currentGroupId,
      groupStartFrame: currentGroupStartFrame,
      groupStartSourceIn: currentGroupStartSourceIn,
    });

    currentGroup.push(item);
  }

  // Finish last group
  if (currentGroup.length > 0) {
    const groupDuration = lastEndFrame - currentGroup[0].startFrame;
    currentGroup.forEach(item => {
      item.groupDuration = groupDuration;
      result.push(item);
    });
  }

  return result;
}

type FrameLayoutIndexCache = {
  startFrames: number[];
  maxEndPrefix: number[];
  indicesByStartFrame: Map<number, number[]>;
  itemsByEndFrame: Map<number, FrameLayoutItem[]>;
};

const frameLayoutIndexCache = new WeakMap<FrameLayoutItem[], FrameLayoutIndexCache>();

function getIndexCache(layout: FrameLayoutItem[]): FrameLayoutIndexCache {
  const cached = frameLayoutIndexCache.get(layout);
  if (cached) return cached;

  const startFrames: number[] = new Array(layout.length);
  const maxEndPrefix: number[] = new Array(layout.length);
  const indicesByStartFrame = new Map<number, number[]>();
  const itemsByEndFrame = new Map<number, FrameLayoutItem[]>();

  let runningMaxEnd = -Infinity;

  for (let i = 0; i < layout.length; i += 1) {
    const item = layout[i];
    startFrames[i] = item.startFrame;

    runningMaxEnd = Math.max(runningMaxEnd, item.endFrame);
    maxEndPrefix[i] = runningMaxEnd;

    const startList = indicesByStartFrame.get(item.startFrame);
    if (startList) startList.push(i);
    else indicesByStartFrame.set(item.startFrame, [i]);

    const endList = itemsByEndFrame.get(item.endFrame);
    if (endList) endList.push(item);
    else itemsByEndFrame.set(item.endFrame, [item]);
  }

  const next: FrameLayoutIndexCache = {
    startFrames,
    maxEndPrefix,
    indicesByStartFrame,
    itemsByEndFrame,
  };
  frameLayoutIndexCache.set(layout, next);
  return next;
}

function upperBoundLE(sorted: number[], value: number): number {
  // Rightmost index where sorted[i] <= value, or -1 if none.
  let lo = 0;
  let hi = sorted.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function lowerBoundGT(sorted: number[], value: number): number {
  // Leftmost index where sorted[i] > value, or sorted.length if none.
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] > value) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

/**
 * Find the index of the clip that should be considered "active" at a given frame.
 *
 * - Prefers the clip whose `startFrame` exactly matches `frame` (boundary case).
 * - Otherwise returns the clip whose range contains `frame` (`startFrame <= frame < endFrame`).
 * - If `frame` is outside all ranges (shouldn't happen with contiguous layouts), returns the nearest clip
 *   to avoid black frames during edge cases.
 */
export function findActiveFrameLayoutIndex(layout: FrameLayoutItem[], frame: number): number {
  if (!layout || layout.length === 0) return -1;

  // Fast paths
  if (frame <= layout[0].startFrame) return 0;
  const lastIndex = layout.length - 1;
  if (frame >= layout[lastIndex].endFrame) return lastIndex;

  // Binary search: last item whose startFrame <= frame
  let lo = 0;
  let hi = lastIndex;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midStart = layout[mid].startFrame;
    if (midStart <= frame) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const candidate = Math.max(0, Math.min(lastIndex, hi));

  // Boundary preference: if the frame equals a startFrame, pick that clip (candidate or next).
  if (layout[candidate].startFrame === frame) return candidate;
  if (candidate + 1 <= lastIndex && layout[candidate + 1].startFrame === frame) return candidate + 1;

  // Containment check
  if (frame >= layout[candidate].startFrame && frame < layout[candidate].endFrame) return candidate;

  // Gap handling: hold previous clip if we're between clips
  if (
    frame >= layout[candidate].endFrame &&
    candidate + 1 <= lastIndex &&
    frame < layout[candidate + 1].startFrame
  ) {
    return candidate;
  }

  // Fallback: choose nearest clip to avoid black frames
  return frame < layout[candidate].startFrame ? Math.max(0, candidate - 1) : Math.min(lastIndex, candidate + 1);
}

/**
 * Find ALL clips that are active at a given frame.
 * Essential for overlapping tracks (e.g. video over background).
 *
 * IMPORTANT: This function should NEVER return an empty array if there are clips.
 * During fast scrubbing, empty results cause BLACK SCREEN. When no clip is
 * technically "active" (e.g., in a gap), we return the nearest clip to ensure
 * there's always something to render.
 */
export function findActiveFrameLayoutItems(layout: FrameLayoutItem[], frame: number): FrameLayoutItem[] {
  if (!layout || layout.length === 0) return [];

  // Boundary protection: if the frame is at/past the end of the timeline,
  // return the last clip to avoid blank frames at the end.
  const lastItem = layout[layout.length - 1];
  if (frame >= lastItem.endFrame) return [lastItem];

  const { startFrames, maxEndPrefix } = getIndexCache(layout);

  // Only items with startFrame <= frame can be active.
  const limitIndex = upperBoundLE(startFrames, frame);

  // FIX: Before first clip - show first clip instead of black
  if (limitIndex < 0) return [layout[0]];

  // If max end in prefix is <= frame, then everything in that prefix has ended.
  // Find the first index where maxEndPrefix[i] > frame to skip large expired prefixes.
  const startIndex = lowerBoundGT(maxEndPrefix, frame);

  // FIX: In a "gap" between clips - show the clip that just ended (hold last frame)
  // This prevents black screen during fast scrubbing
  if (startIndex > limitIndex) {
    return [layout[limitIndex]];
  }

  const result: FrameLayoutItem[] = [];
  for (let i = startIndex; i <= limitIndex; i += 1) {
    const item = layout[i];
    if (frame < item.endFrame) {
      result.push(item);
    }
  }

  // FIX: Safety net - if somehow still empty, return nearest clip
  if (result.length === 0 && limitIndex >= 0) {
    return [layout[limitIndex]];
  }

  return result;
}

/**
 * Build a frame-accurate layout for timeline playback.
 *
 * Uses the clip's own duration instead of calculating it based on the next clip's start time.
 * This allows for overlapping tracks where multiple clips can be active at the same time.
 *
 * GROUPING: Assigns a unique groupId to contiguous blocks of clips from the same recording.
 * This allows the renderer to reuse the same video element for seamless playback.
 */
export function buildFrameLayout(
  clips: Clip[],
  fps: number,
  recordingsMap: Map<string, Recording>
): FrameLayoutItem[] {
  // Track the underlying visual layer (Video or Image) for generated overlays
  let lastVisualItem: FrameLayoutItem | null = null;
  let lastVisualRecording: Recording | null = null;

  return buildLayout<FrameLayoutItem>(
    { clips, fps, trackType: 'video', recordingsMap },
    (clip, frames, groupInfo) => {
      const { startFrame, endFrame, durationFrames } = frames;
      const recording = recordingsMap.get(clip.recordingId);

      const item: FrameLayoutItem = {
        clip,
        startFrame,
        durationFrames,
        endFrame,
        groupId: groupInfo.groupId,
        groupStartFrame: groupInfo.groupStartFrame,
        groupStartSourceIn: groupInfo.groupStartSourceIn,
        groupDuration: 0, // Will be updated by unified builder
        persistedVideoState: null,
      };

      if (recording) {
        const isVisual = recording.sourceType === 'video' || recording.sourceType === 'image';

        if (isVisual) {
          lastVisualItem = item;
          lastVisualRecording = recording;
        } else if (recording.sourceType === 'generated' && lastVisualItem && lastVisualRecording) {
          // Link stored video state using offset from the video's start frame
          const frameOffset = startFrame - lastVisualItem.startFrame;
          const isPastEnd = startFrame >= lastVisualItem.endFrame;

          let baseSourceTimeMs: number;

          if (isPastEnd) {
            // Clamped to last frame of video (freeze state)
            const visualDurationMs = (lastVisualItem.durationFrames / fps) * 1000;
            const sourceIn = ClipUtils.getSourceIn(lastVisualItem.clip);
            const playbackRate = ClipUtils.getPlaybackRate(lastVisualItem.clip);
            const sourceOut = sourceIn + visualDurationMs * playbackRate;
            baseSourceTimeMs = sourceOut - 1;
          } else {
            // Normal playback
            const offsetMs = (frameOffset / fps) * 1000;
            const sourceIn = ClipUtils.getSourceIn(lastVisualItem.clip);
            const playbackRate = ClipUtils.getPlaybackRate(lastVisualItem.clip);
            baseSourceTimeMs = sourceIn + offsetMs * playbackRate;
          }

          item.persistedVideoState = {
            recording: lastVisualRecording,
            clip: lastVisualItem.clip,
            layoutItem: lastVisualItem,
            baseSourceTimeMs,
            isFrozen: isPastEnd,
          };
        }
      }

      return item;
    }
  );
}

export function getTimelineDurationInFrames(layout: FrameLayoutItem[]): number {
  if (!layout || layout.length === 0) return 0;
  return Math.max(...layout.map((i) => i.endFrame));
}

/**
 * Webcam Frame Layout Item - Similar to FrameLayoutItem but for webcam clips
 */
export interface WebcamFrameLayoutItem {
  clip: Clip;
  startFrame: number;
  durationFrames: number;
  endFrame: number;
  groupId: string;
  groupStartFrame: number;
  groupStartSourceIn: number; // Source start time (ms) of the entire contiguous group
  groupDuration: number; // Total duration in frames of the contiguous group
}

// ============================================================================
// Webcam Frame Layout Index Cache (for O(log n) lookup)
// ============================================================================

type WebcamFrameLayoutIndexCache = {
  // Sorted by startFrame for binary search
  sortedByStart: WebcamFrameLayoutItem[];
  startFrames: number[];
  // Index by exact startFrame for boundary detection
  itemsByStartFrame: Map<number, WebcamFrameLayoutItem[]>;
};

const webcamFrameLayoutIndexCache = new WeakMap<WebcamFrameLayoutItem[], WebcamFrameLayoutIndexCache>();

function getWebcamIndexCache(layout: WebcamFrameLayoutItem[]): WebcamFrameLayoutIndexCache {
  const cached = webcamFrameLayoutIndexCache.get(layout);
  if (cached) return cached;

  // Sort items by startFrame for binary search
  const sortedByStart = [...layout].sort((a, b) => a.startFrame - b.startFrame);
  const startFrames = sortedByStart.map(item => item.startFrame);

  // Index items by exact startFrame for boundary detection
  const itemsByStartFrame = new Map<number, WebcamFrameLayoutItem[]>();
  for (const item of layout) {
    const list = itemsByStartFrame.get(item.startFrame);
    if (list) list.push(item);
    else itemsByStartFrame.set(item.startFrame, [item]);
  }

  const next: WebcamFrameLayoutIndexCache = {
    sortedByStart,
    startFrames,
    itemsByStartFrame,
  };
  webcamFrameLayoutIndexCache.set(layout, next);
  return next;
}

/**
 * Find the active webcam layout item at a given frame.
 *
 * Webcam tracks may overlap; selection is deterministic:
 * - Prefer any item whose `startFrame` exactly matches `frame` (boundary).
 * - Otherwise choose the overlapping item with the latest `startFrame` (newest wins).
 *
 * Uses O(log n) binary search instead of O(n) linear scan.
 */
export function findActiveWebcamFrameLayoutItem(
  webcamLayout: WebcamFrameLayoutItem[],
  frame: number
): WebcamFrameLayoutItem | null {
  if (!webcamLayout || webcamLayout.length === 0) return null;

  const { sortedByStart, startFrames, itemsByStartFrame } = getWebcamIndexCache(webcamLayout);

  // Boundary preference: if items start on this exact frame, take the last one (newest by array order).
  const boundaryItems = itemsByStartFrame.get(frame);
  if (boundaryItems && boundaryItems.length > 0) {
    return boundaryItems[boundaryItems.length - 1];
  }

  // Binary search: find rightmost item whose startFrame <= frame
  const limitIndex = upperBoundLE(startFrames, frame);
  if (limitIndex < 0) return null;

  // Overlap preference: scan backwards from limitIndex to find active item with latest startFrame
  // Since sortedByStart is sorted by startFrame, the first match we find going backwards
  // is already the one with the latest startFrame
  let candidate: WebcamFrameLayoutItem | null = null;
  for (let i = limitIndex; i >= 0; i--) {
    const item = sortedByStart[i];
    // Early exit: if startFrame is way before frame and we already have a candidate,
    // no need to check further
    if (candidate && item.startFrame < candidate.startFrame) break;

    if (frame >= item.startFrame && frame < item.endFrame) {
      if (!candidate || item.startFrame >= candidate.startFrame) {
        candidate = item;
      }
    }
  }

  return candidate;
}

/**
 * Build a frame-accurate layout for webcam clips with grouping.
 *
 * The resulting `groupId` represents a contiguous block of clips from the same
 * recording with a stable playback rate and no transitions. Renderers can use
 * this to keep a single video element playing continuously within a group and
 * to premount adjacent groups for preload at boundaries.
 */
export function buildWebcamFrameLayout(
  webcamClips: Clip[],
  fps: number
): WebcamFrameLayoutItem[] {
  return buildLayout<WebcamFrameLayoutItem>(
    { clips: webcamClips, fps, trackType: 'webcam', sortClips: true },
    (clip, frames, groupInfo) => ({
      clip,
      startFrame: frames.startFrame,
      durationFrames: frames.durationFrames,
      endFrame: frames.endFrame,
      groupId: groupInfo.groupId,
      groupStartFrame: groupInfo.groupStartFrame,
      groupStartSourceIn: groupInfo.groupStartSourceIn,
      groupDuration: 0, // Will be updated by unified builder
    })
  );
}

/**
 * Get the video startFrom time (in seconds) for a webcam at a given frame.
 *
 * This should return the source time where the video needs to be positioned
 * so that video.currentTime matches the expected source time for this frame.
 */
export function getWebcamVideoStartFrom(
  frame: number,
  layoutItem: WebcamFrameLayoutItem,
  fps: number
): number {
  // Convert the current timeline frame into the expected source time (seconds)
  // for the given webcam group.
  const safeFps = fps > 0 ? fps : 30;
  const localFrame = Math.max(0, frame - layoutItem.groupStartFrame);
  const playbackRate = ClipUtils.getPlaybackRate(layoutItem.clip);
  return (layoutItem.groupStartSourceIn / 1000) + (localFrame / safeFps) * playbackRate;
}

/**
 * Get visible webcam groups at a given frame
 * Returns one representative item per group that should be rendered
 */
export function getVisibleWebcamGroups(
  webcamLayout: WebcamFrameLayoutItem[],
  currentFrame: number,
  bufferFrames: number = 0
): { groupId: string; items: WebcamFrameLayoutItem[]; activeItem: WebcamFrameLayoutItem | null }[] {
  if (!webcamLayout || webcamLayout.length === 0) return [];

  // Group items by groupId
  const groupsMap = new Map<string, WebcamFrameLayoutItem[]>();
  for (const item of webcamLayout) {
    const list = groupsMap.get(item.groupId) ?? [];
    list.push(item);
    groupsMap.set(item.groupId, list);
  }

  const result: { groupId: string; items: WebcamFrameLayoutItem[]; activeItem: WebcamFrameLayoutItem | null }[] = [];

  for (const [groupId, items] of groupsMap) {
    // Check if any item in this group is within visibility range
    const groupStart = Math.min(...items.map(i => i.startFrame));
    const groupEnd = Math.max(...items.map(i => i.endFrame));

    const isVisible =
      (currentFrame >= groupStart - bufferFrames && currentFrame < groupEnd + bufferFrames);

    if (isVisible) {
      // Find the active item within this group (boundary-aware, deterministic)
      const activeItem = findActiveWebcamFrameLayoutItem(items, currentFrame);

      result.push({ groupId, items, activeItem });
    }
  }

  return result;
}

/**
 * Calculate boundary overlap state for smooth clip transitions.
 * Used to keep previous/next clips mounted during transitions.
 */
export interface BoundaryOverlapState {
  isNearBoundaryStart: boolean;
  isNearBoundaryEnd: boolean;
  shouldHoldPrevFrame: boolean;
  shouldHoldNextFrame: boolean;
  overlapFrames: number;
}

export function getBoundaryOverlapState(opts: {
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  activeLayoutItem: FrameLayoutItem | null;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  // Source dimensions for adaptive overlap
  sourceWidth?: number;
  sourceHeight?: number;
}): BoundaryOverlapState {
  const { currentFrame, fps, isRendering, activeLayoutItem, prevLayoutItem, nextLayoutItem, sourceWidth = 1920, sourceHeight = 1080 } = opts;

  // Use shorter overlap for high-res sources to reduce memory pressure
  const isHighRes = sourceWidth > 1920 || sourceHeight > 1080;
  const overlapSeconds = isHighRes ? 0.35 : 0.5;
  const overlapFrames = !isRendering ? Math.max(8, Math.round(fps * overlapSeconds)) : 0;

  const isNearBoundaryStart =
    !isRendering &&
    !!prevLayoutItem &&
    !!activeLayoutItem &&
    currentFrame >= activeLayoutItem.startFrame &&
    currentFrame < activeLayoutItem.startFrame + overlapFrames;

  const isNearBoundaryEnd =
    !isRendering &&
    !!activeLayoutItem &&
    !!nextLayoutItem &&
    currentFrame >= activeLayoutItem.startFrame + activeLayoutItem.durationFrames - overlapFrames;

  // Gap handling: when in a gap between clips (no active item), hold the nearest clip
  // to prevent transparency during fast scrubbing in either direction
  const isInGap = !isRendering && !activeLayoutItem && (!!prevLayoutItem || !!nextLayoutItem);

  let shouldHoldPrevFrame = isNearBoundaryStart;
  let shouldHoldNextFrame = false;

  if (isInGap) {
    // Determine which clip to hold based on proximity
    const prevEnd = prevLayoutItem ? prevLayoutItem.startFrame + prevLayoutItem.durationFrames : -Infinity;
    const nextStart = nextLayoutItem ? nextLayoutItem.startFrame : Infinity;

    const distToPrev = currentFrame - prevEnd;
    const distToNext = nextStart - currentFrame;

    if (prevLayoutItem && (!nextLayoutItem || distToPrev <= distToNext)) {
      shouldHoldPrevFrame = true;
    } else if (nextLayoutItem) {
      shouldHoldNextFrame = true;
    }
  }

  return { isNearBoundaryStart, isNearBoundaryEnd, shouldHoldPrevFrame, shouldHoldNextFrame, overlapFrames };
}

/**
 * Get the list of clips that should be rendered at the current frame.
 * Handles memory optimization by only rendering clips within visibility window.
 */
export function getVisibleFrameLayout(opts: {
  frameLayout: FrameLayoutItem[];
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  shouldHoldPrevFrame: boolean;
  shouldHoldNextFrame: boolean;
  isNearBoundaryEnd: boolean;
}): FrameLayoutItem[] {
  const {
    frameLayout,
    currentFrame,
    fps,
    isRendering,
    prevLayoutItem,
    nextLayoutItem,
    shouldHoldPrevFrame,
    shouldHoldNextFrame,
    isNearBoundaryEnd,
  } = opts;

  // Find ALL clips active at the current frame
  const activeItems = findActiveFrameLayoutItems(frameLayout, currentFrame);

  if (isRendering) {
    // Export/Thumbnail: render ALL active clips to support overlapping tracks.
    return [...activeItems];
  }

  // Preview: render active clips + boundary overlap for smooth transitions
  const items = [...activeItems];
  if (shouldHoldPrevFrame && prevLayoutItem) {
    items.push(prevLayoutItem);
  }
  if ((isNearBoundaryEnd || shouldHoldNextFrame) && nextLayoutItem) {
    items.push(nextLayoutItem);
  }

  const { indicesByStartFrame, itemsByEndFrame } = getIndexCache(frameLayout);

  // Boundary safety: keep clips that just ended at this frame for 1 frame
  // to avoid a single-frame gap when timeline state doesn't include neighbors.
  const endedNow = itemsByEndFrame.get(currentFrame);
  if (endedNow) {
    items.push(...endedNow);
  }

  const startedNowIndices = indicesByStartFrame.get(currentFrame);
  if (startedNowIndices) {
    for (const idx of startedNowIndices) {
      if (idx > 0) {
        items.push(frameLayout[idx - 1]);
      }
    }
  }

  // Extra safety: keep near-boundary neighbors for a tiny window to avoid flicker.
  const boundaryHoldFrames = Math.max(2, Math.round(fps * 0.12));
  for (let f = currentFrame - boundaryHoldFrames; f <= currentFrame; f += 1) {
    const ended = itemsByEndFrame.get(f);
    if (ended) items.push(...ended);
  }
  for (let f = currentFrame; f <= currentFrame + boundaryHoldFrames; f += 1) {
    const indices = indicesByStartFrame.get(f);
    if (!indices) continue;
    for (const idx of indices) {
      items.push(frameLayout[idx]);
    }
  }

  return items;
}

/**
 * Get visible webcam layout items at a given frame with boundary overlap handling.
 *
 * This returns individual webcam items (one per clip) that should be rendered,
 * including items near boundaries for smooth transitions.
 *
 * Used by the per-clip webcam rendering approach (Sequence + Video pattern).
 */
export function getVisibleWebcamFrameLayout(opts: {
  webcamFrameLayout: WebcamFrameLayoutItem[];
  currentFrame: number;
  fps: number;
  isRendering: boolean;
}): WebcamFrameLayoutItem[] {
  const { webcamFrameLayout, currentFrame, fps, isRendering } = opts;

  if (!webcamFrameLayout || webcamFrameLayout.length === 0) return [];

  // Find all items active at the current frame
  const activeItems = webcamFrameLayout.filter(
    item => currentFrame >= item.startFrame && currentFrame < item.endFrame
  );

  // For rendering/export, return only strictly active items
  if (isRendering) return activeItems;

  // Preview mode: add boundary overlap items for smooth transitions
  const overlapFrames = Math.max(8, Math.round(fps * 0.35));
  const result = [...activeItems];
  const activeIds = new Set(activeItems.map(i => i.clip.id));

  for (const item of webcamFrameLayout) {
    if (activeIds.has(item.clip.id)) continue;

    // Check if we're near this item's start boundary (premount)
    const nearStart = currentFrame >= item.startFrame - overlapFrames && currentFrame < item.startFrame;
    // Check if we're near this item's end boundary (postmount/hold)
    const nearEnd = currentFrame >= item.endFrame && currentFrame < item.endFrame + overlapFrames;

    if (nearStart || nearEnd) {
      result.push(item);
      activeIds.add(item.clip.id);
    }
  }

  return result;
}
