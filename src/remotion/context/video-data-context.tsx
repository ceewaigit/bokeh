/**
 * video-data-context.tsx - COMPATIBILITY BRIDGE
 *
 * This file now delegates to TimelineContext.tsx.
 * It maintains the existing API (useVideoData, useActiveClipData, etc.)
 * but consumes data from the unified TimelineContext.
 */

import { useMemo } from 'react';
import { useTimelineContext } from './TimelineContext';
import type { TimelineContextValue } from './TimelineContext';
import type { ActiveClipDataAtFrame } from '@/types';

// Re-export the interface (it matches TimelineContextValue structural subset)
export type VideoDataContextValue = TimelineContextValue;

/**
 * Hook to access video data context.
 * Delegates to useTimelineContext.
 */
export function useVideoData(): VideoDataContextValue {
  return useTimelineContext();
}

/**
 * Hook to safely try to get video data context.
 */
export function useVideoDataOptional(): VideoDataContextValue | null {
  try {
    return useTimelineContext();
  } catch {
    return null;
  }
}

/**
 * @deprecated VideoDataProvider is deprecated. Use TimelineProvider instead.
 */
export function VideoDataProvider({ children }: { children: React.ReactNode }) {
  console.warn('VideoDataProvider is deprecated and does nothing. Use TimelineProvider.');
  return <>{children}</>;
}

/**
 * Hook to get active clip data at current frame.
 */
export function useActiveClipData(currentFrame: number): ActiveClipDataAtFrame | null {
  const { getActiveClipData } = useVideoData();
  return useMemo(() => getActiveClipData(currentFrame), [getActiveClipData, currentFrame]);
}

/**
 * Hook to get layout navigation at current frame.
 */
export function useLayoutNavigation(currentFrame: number) {
  const { getActiveLayoutIndex, getLayoutItem, getPrevLayoutItem, getNextLayoutItem } = useVideoData();

  return useMemo(() => {
    const activeIndex = getActiveLayoutIndex(currentFrame);
    return {
      activeIndex,
      activeItem: getLayoutItem(activeIndex),
      prevItem: getPrevLayoutItem(activeIndex),
      nextItem: getNextLayoutItem(activeIndex),
    };
  }, [currentFrame, getActiveLayoutIndex, getLayoutItem, getPrevLayoutItem, getNextLayoutItem]);
}
