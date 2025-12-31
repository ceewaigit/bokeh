import { useMemo } from 'react';
import { useTimelineContext } from '@/remotion/context/TimelineContext';

/**
 * Hook to get layout navigation at current frame.
 * 
 * Determines which layout item is active, previous, and next based on the current frame.
 * Useful for transition logic and boundary detection.
 */
export function useLayoutNavigation(currentFrame: number) {
    const { getActiveLayoutIndex, getLayoutItem, getPrevLayoutItem, getNextLayoutItem } = useTimelineContext();

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
