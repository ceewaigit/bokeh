/**
 * useVisualLayoutNavigation Hook
 *
 * Finds visual items (video/image) in the frame layout for boundary calculations.
 * Extracted from useFrameSnapshot to improve modularity and testability.
 */

import { useMemo } from 'react'
import type { FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout'
import { findActiveFrameLayoutItems } from '@/features/ui/timeline/utils/frame-layout'
import type { Recording } from '@/types/project'

export interface VisualLayoutNavigation {
  activeVisualItem: FrameLayoutItem | null
  prevVisualItem: FrameLayoutItem | null
  nextVisualItem: FrameLayoutItem | null
}

/**
 * Finds the active, previous, and next visual items (video/image) in the frame layout.
 * Visual items are prioritized for boundary calculations and transitions.
 *
 * @param frameLayout - The complete frame layout array
 * @param recordingsMap - Map of recording IDs to Recording objects
 * @param currentFrame - Current frame number
 * @returns Navigation object with active, prev, and next visual items
 */
export function useVisualLayoutNavigation(
  frameLayout: FrameLayoutItem[],
  recordingsMap: Map<string, Recording>,
  currentFrame: number
): VisualLayoutNavigation {
  return useMemo(() => {
    const isVisualItem = (item: FrameLayoutItem | null): boolean => {
      if (!item) return false
      const recording = recordingsMap.get(item.clip.recordingId)
      return recording?.sourceType === 'video' || recording?.sourceType === 'image'
    }

    // Find active visual item (prefer latest start frame if multiple)
    const activeItems = findActiveFrameLayoutItems(frameLayout, currentFrame)
    let activeVisualItem: FrameLayoutItem | null = null
    for (const item of activeItems) {
      if (isVisualItem(item) && (!activeVisualItem || item.startFrame > activeVisualItem.startFrame)) {
        activeVisualItem = item
      }
    }

    // Find index for prev/next search
    const activeVisualIndex = activeVisualItem
      ? frameLayout.findIndex((item) => item.clip.id === activeVisualItem?.clip.id)
      : -1

    // Find previous visual item
    let prevVisualItem: FrameLayoutItem | null = null
    for (let i = activeVisualIndex - 1; i >= 0; i -= 1) {
      const candidate = frameLayout[i]
      if (isVisualItem(candidate)) {
        prevVisualItem = candidate
        break
      }
    }

    // Find next visual item
    let nextVisualItem: FrameLayoutItem | null = null
    for (let i = activeVisualIndex + 1; i < frameLayout.length; i += 1) {
      const candidate = frameLayout[i]
      if (isVisualItem(candidate)) {
        nextVisualItem = candidate
        break
      }
    }

    return {
      activeVisualItem,
      prevVisualItem,
      nextVisualItem,
    }
  }, [frameLayout, recordingsMap, currentFrame])
}
