/**
 * Hook for computing optimal timeline height based on visible tracks.
 * 
 * When auto mode is enabled (default), returns a height that fits all visible
 * tracks, clamped between min and max constraints.
 * 
 * When auto mode is disabled (user manually resized), returns the stored height.
 */

import { useMemo } from 'react'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { useTimelineContentHeight } from '@/features/core/stores/selectors/timeline-selectors'
import { TimelineConfig } from '@/features/ui/timeline/config'

export interface TimelineAutoHeightResult {
    /** The computed timeline height to use */
    height: number
    /** Whether auto mode is currently active */
    isAuto: boolean
}

/**
 * Computes the optimal timeline height.
 * 
 * Uses the selector-based content height calculation which can be consumed
 * at any component level (unlike layout context which requires being inside TimelineLayoutProvider).
 */
export function useTimelineAutoHeight(): TimelineAutoHeightResult {
    const isTimelineHeightAuto = useWorkspaceStore((s) => s.isTimelineHeightAuto)
    const storedHeight = useWorkspaceStore((s) => s.timelineHeight)

    // Content height from selector (works outside of TimelineLayoutProvider)
    const contentHeight = useTimelineContentHeight()

    const height = useMemo(() => {
        // If auto mode is off, use stored height
        if (!isTimelineHeightAuto) {
            return storedHeight
        }

        // Compute constrained height
        const minHeight = TimelineConfig.TIMELINE.MIN_HEIGHT
        const maxHeight = typeof window !== 'undefined'
            ? window.innerHeight * TimelineConfig.TIMELINE.MAX_HEIGHT_VH
            : 300  // SSR fallback

        // Add buffer for controls bar (shown above timeline canvas)
        const controlsHeight = 48  // TimelineControls approximate height
        const contentWithBuffer = contentHeight + controlsHeight

        return Math.max(minHeight, Math.min(contentWithBuffer, maxHeight))
    }, [isTimelineHeightAuto, storedHeight, contentHeight])

    return {
        height,
        isAuto: isTimelineHeightAuto
    }
}
