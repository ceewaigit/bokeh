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
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout';
import { getVisibleFrameLayout } from '@/lib/timeline/frame-layout';

interface UseRenderableItemsOptions {
  frameLayout: FrameLayoutItem[];
  currentFrame: number;
  fps: number;
  isRendering: boolean;
  isPlaying: boolean;
  isScrubbing: boolean;
  recordingsMap: Map<string, Recording>;
  activeLayoutIndex: number;
  activeLayoutItem: FrameLayoutItem | null;
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
  isPlaying,
  isScrubbing,
  recordingsMap,
  activeLayoutIndex,
  activeLayoutItem,
  prevLayoutItem,
  nextLayoutItem,
  shouldHoldPrevFrame,
  isNearBoundaryEnd,
}: UseRenderableItemsOptions): FrameLayoutItem[] {
  // MEMORY FIX: Scrub keep-alive disabled - was causing VTDecoder leak (3.5GB+)
  const keepVideoWarmOnScrub = false;

  // STABILITY: Track previous renderable items to prevent unnecessary remounts
  const prevRenderableIdsRef = useRef<string>('');
  const prevRenderableItemsRef = useRef<FrameLayoutItem[]>([]);

  return useMemo(() => {
    // Helper: Check if a layout item is a generated (non-video) clip
    const isGeneratedItem = (item: FrameLayoutItem | null) => {
      if (!item) return false;
      return recordingsMap.get(item.clip.recordingId)?.sourceType === 'generated';
    };

    // Helper: Find previous non-generated clip
    const findPrevVideo = (startIndex: number) => {
      for (let i = startIndex - 1; i >= 0; i -= 1) {
        const candidate = frameLayout[i];
        if (!isGeneratedItem(candidate)) return candidate;
      }
      return null;
    };

    // Helper: Find next non-generated clip
    const findNextVideo = (startIndex: number) => {
      for (let i = startIndex + 1; i < frameLayout.length; i += 1) {
        const candidate = frameLayout[i];
        if (!isGeneratedItem(candidate)) return candidate;
      }
      return null;
    };

    // PREVIEW MODE: Optimize to minimize concurrent decoders
    if (!isRendering && activeLayoutItem) {
      const itemsByGroupId = new Map<string, FrameLayoutItem>();
      const activeIsGenerated = isGeneratedItem(activeLayoutItem);
      // Enable A/B buffering for smooth transitions (prev/next clips)
      // We respect shouldHoldPrevFrame/isNearBoundaryEnd to keep neighbors alive during transitions
      const shouldIncludePrevVideo = keepVideoWarmOnScrub || activeIsGenerated || (shouldHoldPrevFrame && !!prevLayoutItem);
      const shouldIncludeNextVideo = keepVideoWarmOnScrub || activeIsGenerated || (isNearBoundaryEnd && !!nextLayoutItem);

      // Include prev video clip if needed (for warm transition from generated)
      if (shouldIncludePrevVideo) {
        // First try finding the semantic "prev video" (skipping generated items)
        let prevVideo = findPrevVideo(activeLayoutIndex);

        // Fallback: If we assume standard A/B cut, just grab the previous layout item
        // This ensures that even if there are weird generated clips involved, we hold onto the neighbor
        if (!prevVideo && prevLayoutItem) {
          prevVideo = prevLayoutItem;
        }

        if (prevVideo && !itemsByGroupId.has(prevVideo.groupId)) {
          itemsByGroupId.set(prevVideo.groupId, prevVideo);
        }
      }

      // Include next video clip if needed (for warm transition to generated)
      if (shouldIncludeNextVideo) {
        const nextVideo = findNextVideo(activeLayoutIndex);
        if (nextVideo && !itemsByGroupId.has(nextVideo.groupId)) {
          itemsByGroupId.set(nextVideo.groupId, nextVideo);
        }
      }

      // Active clip always wins when sharing group with neighbors
      itemsByGroupId.set(activeLayoutItem.groupId, activeLayoutItem);

      return Array.from(itemsByGroupId.values()).sort(
        (a, b) => a.startFrame - b.startFrame
      );
    }

    // EXPORT MODE: Use full visibility calculation for correctness
    const items = getVisibleFrameLayout({
      frameLayout,
      currentFrame,
      fps,
      isRendering,
      prevLayoutItem,
      nextLayoutItem,
      activeLayoutItem,
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

    const sortedItems = Array.from(uniqueItems.values()).sort(
      (a, b) => a.startFrame - b.startFrame
    );

    // STABILITY FIX: Return previous array reference if groupIds haven't changed
    // This prevents VideoClipRenderer remounts when only play/pause state changes
    const currentIds = sortedItems.map((i) => i.groupId).join(',');
    if (currentIds === prevRenderableIdsRef.current) {
      return prevRenderableItemsRef.current;
    }

    // GroupIds changed - update refs and return new array
    prevRenderableIdsRef.current = currentIds;
    prevRenderableItemsRef.current = sortedItems;
    return sortedItems;
  }, [
    frameLayout,
    currentFrame,
    fps,
    isRendering,
    isPlaying,
    isScrubbing,
    keepVideoWarmOnScrub,
    activeLayoutIndex,
    prevLayoutItem,
    nextLayoutItem,
    activeLayoutItem,
    shouldHoldPrevFrame,
    isNearBoundaryEnd,
    recordingsMap,
  ]);
}
