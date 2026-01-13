
import type { Clip, Recording } from '@/types/project';
import { msToFrameCeil, msToFrameFloor } from '@/features/rendering/renderer/compositions/utils/time/frame-time';

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
  if (!clips || clips.length === 0) return [];

  const result: FrameLayoutItem[] = [];
  let currentGroup: FrameLayoutItem[] = [];

  let currentGroupId = '';
  let currentGroupStartFrame = 0;
  let currentGroupStartSourceIn = 0;

  let lastClip: Clip | null = null;
  let lastEndFrame = -1;

  // Track the underlying visual layer (Video or Image) for generated overlays
  let lastVisualItem: FrameLayoutItem | null = null;
  let lastVisualRecording: Recording | null = null;

  clips.forEach((clip) => {
    const startFrame = msToFrameFloor(clip.startTime, fps);
    const endFrame = Math.max(startFrame + 1, msToFrameCeil(clip.startTime + clip.duration, fps));
    const durationFrames = endFrame - startFrame;
    const recording = recordingsMap.get(clip.recordingId);

    // Check for continuity
    let isContiguous = false;
    if (lastClip && lastClip.recordingId === clip.recordingId) {
      const timelineGap = Math.abs(startFrame - lastEndFrame);
      const lastSourceOut = lastClip.sourceOut ?? (lastClip.sourceIn + lastClip.duration);
      const sourceGap = Math.abs(lastSourceOut - clip.sourceIn);
      const hasTransition = !!lastClip.transitionOut || !!clip.transitionIn;
      // Clips with different playback rates should NOT be grouped - timing formula breaks across rate changes
      const samePlaybackRate = (lastClip.playbackRate || 1) === (clip.playbackRate || 1);

      if (timelineGap <= 1 && sourceGap <= 50 && !hasTransition && samePlaybackRate) {
        isContiguous = true;
      }
    }

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

      // Start new group - use startFrame for temporal stability across split/trim
      // This ensures groupId remains stable when clips are split, preventing
      // unnecessary video element remounts that cause video/motion blur disappearance
      currentGroupId = `group-${clip.recordingId}-${startFrame}`;
      currentGroupStartFrame = startFrame;
      currentGroupStartSourceIn = clip.sourceIn || 0;
    }

    lastClip = clip;
    lastEndFrame = endFrame;

    const item: FrameLayoutItem = {
      clip,
      startFrame,
      durationFrames,
      endFrame,
      groupId: currentGroupId,
      groupStartFrame: currentGroupStartFrame,
      groupStartSourceIn: currentGroupStartSourceIn,
      groupDuration: 0, // Will be updated when group finishes
      persistedVideoState: null
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
          // We use sourceOut - 1ms to ensure we are within valid video range and effects are active
          const visualDurationMs = (lastVisualItem.durationFrames / fps) * 1000;
          const sourceOut = (lastVisualItem.clip.sourceIn || 0) + visualDurationMs * (lastVisualItem.clip.playbackRate || 1);
          baseSourceTimeMs = sourceOut - 1;
        } else {
          // Normal playback
          const offsetMs = (frameOffset / fps) * 1000;
          baseSourceTimeMs = (lastVisualItem.clip.sourceIn || 0) + offsetMs * (lastVisualItem.clip.playbackRate || 1);
        }

        item.persistedVideoState = {
          recording: lastVisualRecording,
          clip: lastVisualItem.clip,
          layoutItem: lastVisualItem,
          baseSourceTimeMs,
          isFrozen: isPastEnd
        };
      }
    }

    currentGroup.push(item);
  });

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

export function getTimelineDurationInFrames(layout: FrameLayoutItem[]): number {
  if (!layout || layout.length === 0) return 0;
  return Math.max(...layout.map((i) => i.endFrame));
}

/**
 * Calculate boundary overlap state for smooth clip transitions.
 * Used to keep previous/next clips mounted during transitions.
 */
export interface BoundaryOverlapState {
  isNearBoundaryStart: boolean;
  isNearBoundaryEnd: boolean;
  shouldHoldPrevFrame: boolean;
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

  const shouldHoldPrevFrame = isNearBoundaryStart;

  return { isNearBoundaryStart, isNearBoundaryEnd, shouldHoldPrevFrame, overlapFrames };
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
  if (isNearBoundaryEnd && nextLayoutItem) {
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
