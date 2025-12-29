/**
 * useRenderableItems Hook
 *
 * Determines which clips to render based on current mode:
 * - Preview: Only active clip + neighbors when active is generated
 * - Export: Active clip + boundary overlap clips for smooth transitions
 *
 * This hook provides memory-optimized clip selection to minimize concurrent
 * VTDecoders while ensuring smooth transitions.
 */

import { useMemo, useRef } from 'react';
import type { Recording } from '@/types/project';
import type { FrameLayoutItem } from '@/features/timeline/utils/frame-layout';
import { getVisibleFrameLayout } from '@/features/timeline/utils/frame-layout';

interface UseRenderableItemsOptions {
  frameLayout: FrameLayoutItem[];
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  recordingsMap: Map<string, Recording>;
  prevLayoutItem: FrameLayoutItem | null;
  nextLayoutItem: FrameLayoutItem | null;
  shouldHoldPrevFrame: boolean;
  isNearBoundaryEnd: boolean;
}

/**
 * Hook for calculating which clips should be rendered at the current frame.
 *
 * @returns Array of FrameLayoutItems to render, sorted by start frame
 */
export function useRenderableItems({
  frameLayout,
  currentFrame,
  fps,
  isRendering,
  recordingsMap,
  prevLayoutItem,
  nextLayoutItem,
  shouldHoldPrevFrame,
  isNearBoundaryEnd,
}: UseRenderableItemsOptions): FrameLayoutItem[] {
  const prevRenderableIdsRef = useRef<string>('');
  const prevRenderableItemsRef = useRef<FrameLayoutItem[]>([]);

  return useMemo(() => {
    const items = getVisibleFrameLayout({
      frameLayout,
      currentFrame,
      fps,
      isRendering,
      prevLayoutItem,
      nextLayoutItem,
      shouldHoldPrevFrame,
      isNearBoundaryEnd,
    });

    // Deduplicate by groupId (O(N) with Map vs O(N²) with filter)
    const uniqueItems = new Map<string, FrameLayoutItem>();
    for (const item of items) {
      if (!uniqueItems.has(item.groupId)) {
        uniqueItems.set(item.groupId, item);
      }
    }

    let sortedItems = Array.from(uniqueItems.values()).sort(
      (a, b) => a.startFrame - b.startFrame
    );

    // MEMORY CAP: Maximum 3 video clips mounted at once to prevent VTDecoder exhaustion
    const MAX_VIDEO_CLIPS = 3;
    const videoItems = sortedItems.filter(
      (item) => recordingsMap.get(item.clip.recordingId)?.sourceType === 'video'
    );
    if (videoItems.length > MAX_VIDEO_CLIPS) {
      // Keep closest to currentFrame
      const byDistance = videoItems
        .map((item) => ({ item, dist: Math.abs(item.startFrame - currentFrame) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, MAX_VIDEO_CLIPS)
        .map(({ item }) => item);

      const nonVideoItems = sortedItems.filter(
        (item) => recordingsMap.get(item.clip.recordingId)?.sourceType !== 'video'
      );
      sortedItems = [...nonVideoItems, ...byDistance].sort(
        (a, b) => a.startFrame - b.startFrame
      );
    }

    // STABILITY FIX: Return previous array reference if groupIds haven't changed
    // This prevents VideoClipRenderer remounts when only play/pause state changes
    const currentIds = sortedItems.map((i) => i.groupId).join(',');
    if (currentIds === prevRenderableIdsRef.current) {
      return prevRenderableItemsRef.current;
    }

    prevRenderableIdsRef.current = currentIds;
    prevRenderableItemsRef.current = sortedItems;
    return sortedItems;
  }, [
    frameLayout,
    currentFrame,
    fps,
    isRendering,
    prevLayoutItem,
    nextLayoutItem,
    shouldHoldPrevFrame,
    isNearBoundaryEnd,
    recordingsMap,
  ]);
}
