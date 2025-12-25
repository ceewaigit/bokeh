import type { Clip, Effect, Recording } from '@/types/project'
import type { ActiveClipDataAtFrame } from '@/types'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'
import { findActiveFrameLayoutIndex } from '@/lib/timeline/frame-layout'

// Cache timeline-space effect overlap per (effects array ref, frameLayout array ref, clip.id).
// This dramatically reduces per-frame allocations during playback and during camera path precompute.
const timelineEffectsByClipCache: WeakMap<
  Effect[],
  WeakMap<FrameLayoutItem[], Map<string, Effect[]>>
> = new WeakMap()

function getTimelineEffectsForClip(args: {
  effects: Effect[]
  frameLayout: FrameLayoutItem[]
  clip: Clip
}): Effect[] {
  const { effects, frameLayout, clip } = args

  let byLayout = timelineEffectsByClipCache.get(effects)
  if (!byLayout) {
    byLayout = new WeakMap()
    timelineEffectsByClipCache.set(effects, byLayout)
  }

  let byClipId = byLayout.get(frameLayout)
  if (!byClipId) {
    byClipId = new Map()
    byLayout.set(frameLayout, byClipId)
  }

  const cached = byClipId.get(clip.id)
  if (cached) return cached

  const clipStart = clip.startTime
  const clipEnd = clip.startTime + clip.duration
  const timelineEffects = effects.filter(effect => effect.startTime < clipEnd && effect.endTime > clipStart)

  byClipId.set(clip.id, timelineEffects)
  return timelineEffects
}

export function getActiveClipDataAtFrame(args: {
  frame: number
  frameLayout: FrameLayoutItem[]
  fps: number
  effects: Effect[]
  getRecording: (recordingId: string) => Recording | null | undefined
}): ActiveClipDataAtFrame | null {
  const { frame, frameLayout, fps, effects, getRecording } = args
  if (!frameLayout || frameLayout.length === 0) return null

  const layoutIndex = findActiveFrameLayoutIndex(frameLayout, frame)
  if (layoutIndex < 0) return null
  const layoutItem = frameLayout[layoutIndex]

  return resolveClipDataForLayoutItem({
    frame,
    layoutItem,
    frameLayout,
    fps,
    effects,
    getRecording
  })
}

/**
 * Resolve clip data for a specific layout item at a specific frame.
 * Useful when you already know which item you want to evaluate (e.g. background video),
 * bypassing the "active index" lookup which might return an overlapping clip.
 */
export function resolveClipDataForLayoutItem(args: {
  frame: number
  layoutItem: FrameLayoutItem
  frameLayout: FrameLayoutItem[]
  fps: number
  effects: Effect[]
  getRecording: (recordingId: string) => Recording | null | undefined
}): ActiveClipDataAtFrame | null {
  const { frame, layoutItem, frameLayout, fps, effects, getRecording } = args

  const clip = layoutItem.clip
  const recording = getRecording(clip.recordingId)
  if (!recording) return null

  const clipStartFrame = layoutItem.startFrame ?? Math.round((clip.startTime / 1000) * fps)
  const clipDurationFrames = layoutItem.durationFrames ?? Math.max(1, Math.round((clip.duration / 1000) * fps))
  // Calculate elapsed frames with clamping
  const clipElapsedFramesRaw = frame - clipStartFrame
  const isLastFrame = clipElapsedFramesRaw >= clipDurationFrames - 1
  const clipElapsedFrames = Math.max(0, Math.min(clipElapsedFramesRaw, clipDurationFrames - 1))
  // For the last frame, use actual clip duration minus one frame to reach the true end
  // This fixes rounding discrepancy where frame-based calculation falls short of video end
  const frameDurationMs = 1000 / fps
  const clipElapsedMs = isLastFrame
    ? Math.max(0, clip.duration - frameDurationMs)
    : (clipElapsedFrames / fps) * 1000
  const sourceTimeMs = (clip.sourceIn || 0) + clipElapsedMs * (clip.playbackRate || 1)

  const timelineEffects = getTimelineEffectsForClip({ effects, frameLayout, clip })

  // Recording-scoped effects are stored in source space on Recording.effects.
  // They should be resolved by sourceTimeMs, not timeline overlap.
  const sourceEffects = (recording.effects || []).filter(effect => {
    return effect.enabled && sourceTimeMs >= effect.startTime && sourceTimeMs <= effect.endTime
  })

  // OPTIMIZATION: Use Map for O(N) deduplication instead of O(N^2) filter+findIndex
  const uniqueEffects = new Map<string, Effect>();

  // Process timeline effects first
  for (const effect of timelineEffects) {
    if (effect.id) uniqueEffects.set(effect.id, effect);
  }

  // Process source effects (overwriting if same ID, though usually they are distinct sets)
  for (const effect of sourceEffects) {
    if (effect.id) uniqueEffects.set(effect.id, effect);
  }

  const mergedEffects = Array.from(uniqueEffects.values())
    .sort((a, b) => a.startTime - b.startTime);

  // OPTIMIZATION: Return stable array reference if contents match previous call (Last-Value Caching)
  // This is critical for keeping usePrecomputedCameraPath from re-running heavy physics
  const cacheKey = `${clip.id}-${layoutItem.startFrame}`;
  const prev = activeEffectsCache.get(cacheKey);

  // Check if IDs and enabled states match exactly
  if (prev && areEffectsSemanticallyEqual(prev, mergedEffects)) {
    return { clip, recording, sourceTimeMs, effects: prev };
  }

  activeEffectsCache.set(cacheKey, mergedEffects);

  // Prune cache to avoid memory leaks (simple random eviction if too large)
  if (activeEffectsCache.size > 100) {
    const keyToDelete = activeEffectsCache.keys().next().value;
    if (keyToDelete) activeEffectsCache.delete(keyToDelete);
  }

  return { clip, recording, sourceTimeMs, effects: mergedEffects }
}

// Global cache for effect stability checks (Module-scoped)
const activeEffectsCache = new Map<string, Effect[]>();

function areEffectsSemanticallyEqual(prev: Effect[], next: Effect[]): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    // We care about identity + enabled state stability
    if (prev[i] !== next[i]) return false;
  }
  return true;
}
