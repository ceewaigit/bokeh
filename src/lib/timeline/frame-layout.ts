import type { Clip } from '@/types/project';
import { msToFrame } from '@/remotion/compositions/utils/frame-time';

export interface FrameLayoutItem {
  clip: Clip;
  startFrame: number;
  durationFrames: number;
  endFrame: number; // exclusive
  groupId: string; // Unique ID for contiguous blocks of clips from same recording
  groupStartFrame: number; // Start frame of the entire contiguous group
  groupStartSourceIn: number; // Source start time (ms) of the entire contiguous group
  groupDuration: number; // Total duration of the contiguous group
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

  // Fallback: choose nearest clip to avoid black frames
  return frame < layout[candidate].startFrame ? Math.max(0, candidate - 1) : Math.min(lastIndex, candidate + 1);
}

/**
 * Find ALL clips that are active at a given frame.
 * Essential for overlapping tracks (e.g. video over background).
 */
export function findActiveFrameLayoutItems(layout: FrameLayoutItem[], frame: number): FrameLayoutItem[] {
  if (!layout || layout.length === 0) return [];

  const activeItems: FrameLayoutItem[] = [];
  let hi = layout.length - 1;
  let lo = 0;

  // Find the rightmost index where startFrame <= frame
  let limitIndex = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (layout[mid].startFrame <= frame) {
      limitIndex = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (limitIndex === -1) return [];

  for (let i = limitIndex; i >= 0; i--) {
    const item = layout[i];
    if (frame < item.endFrame) {
      activeItems.push(item);
    }
  }

  // Let's just do forward iteration up to limitIndex.
  // It avoids checking items that haven't started yet.
  const result: FrameLayoutItem[] = [];
  for (let i = 0; i <= limitIndex; i++) {
    const item = layout[i];
    if (frame < item.endFrame) {
      result.push(item);
    }
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
export function buildFrameLayout(clips: Clip[], fps: number): FrameLayoutItem[] {
  if (!clips || clips.length === 0) return [];

  const result: FrameLayoutItem[] = [];
  let currentGroup: FrameLayoutItem[] = [];

  let currentGroupId = '';
  let currentGroupStartFrame = 0;
  let currentGroupStartSourceIn = 0;

  let lastClip: Clip | null = null;
  let lastEndFrame = -1;

  clips.forEach((clip, index) => {
    const startFrame = msToFrame(clip.startTime, fps);
    const durationFrames = Math.max(1, msToFrame(clip.duration, fps));
    const endFrame = startFrame + durationFrames;

    // Check for continuity
    let isContiguous = false;
    if (lastClip && lastClip.recordingId === clip.recordingId) {
      // Check timeline continuity (no gap)
      // Allow 1 frame tolerance for rounding errors
      const timelineGap = Math.abs(startFrame - lastEndFrame);

      // Check source continuity
      // lastClip.sourceOut should match clip.sourceIn
      const lastSourceOut = lastClip.sourceOut ?? (lastClip.sourceIn + lastClip.duration);
      const sourceGap = Math.abs(lastSourceOut - clip.sourceIn);

      // Check for transitions (if there's a transition, we likely want separate players for cross-dissolve)
      const hasTransition = !!lastClip.transitionOut || !!clip.transitionIn;

      // USER REQUEST: Allow grouping even if playback rate changes.
      // We will handle the time mapping in the renderer.

      if (timelineGap <= 1 && sourceGap <= 50 && !hasTransition) { // 50ms tolerance for source
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

      // Start new group
      currentGroupId = `group-${clip.recordingId}-${clip.id}`;
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
      groupDuration: 0 // Will be updated when group finishes
    };

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
  // DEPRECATED: isScrubbing no longer affects behavior - unified for SSOT
  isScrubbing?: boolean;
}): BoundaryOverlapState {
  const { currentFrame, fps, isRendering, activeLayoutItem, prevLayoutItem, nextLayoutItem, sourceWidth = 1920, sourceHeight = 1080 } = opts;

  // REMOVED: isScrubbing early return that caused frame mismatch between scrub and playback
  // Now boundary detection is unified for consistent frame display in both modes

  // Shorter overlap for high-res sources to reduce concurrent decode streams
  // High-res videos (>1080p) use 0.35s overlap, standard uses 0.5s (reduced from 1.0s)
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
  activeLayoutItem: FrameLayoutItem | null;
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
    activeLayoutItem,
    shouldHoldPrevFrame,
    isNearBoundaryEnd,
  } = opts;

  // Find ALL clips active at the current frame
  const activeItems = findActiveFrameLayoutItems(frameLayout, currentFrame);

  if (isRendering) {
    // Export/Thumbnail: render ALL active clips to support overlapping tracks.
    // We also include neighbors near boundaries if there are fades.
    const items = [...activeItems];

    for (const item of activeItems) {
      const prev = frameLayout.find(p => p.endFrame === item.startFrame);
      if (prev && item.clip.introFadeMs && currentFrame < item.startFrame + Math.round((item.clip.introFadeMs / 1000) * fps)) {
        if (!items.find(i => i.clip.id === prev.clip.id)) items.push(prev);
      }

      const next = frameLayout.find(n => n.startFrame === item.endFrame);
      if (next && item.clip.outroFadeMs && currentFrame >= item.endFrame - Math.round((item.clip.outroFadeMs / 1000) * fps)) {
        if (!items.find(i => i.clip.id === next.clip.id)) items.push(next);
      }
    }

    return items;
  }

  // Preview: render active clips + boundary overlap for smooth transitions
  if (shouldHoldPrevFrame && prevLayoutItem) {
    return [...activeItems, prevLayoutItem];
  }

  if (isNearBoundaryEnd && nextLayoutItem) {
    return [...activeItems, nextLayoutItem];
  }

  return activeItems;
}
