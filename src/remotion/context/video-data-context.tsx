/**
 * VideoDataProvider
 *
 * Provides computed video data (frame layout, sorted clips, active clip)
 * to Remotion compositions. This eliminates duplicated computation in:
 * - TimelineComposition (lines 107-120)
 * - SharedVideoController (lines 94-120)
 * - toolbar.tsx
 *
 * Builds on top of TimeContext to provide:
 * - sortedClips (sorted by startTime)
 * - frameLayout (computed from clips + fps + recordingsMap)
 * - Active clip lookup functions
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react'
import type { Clip, Effect, Recording } from '@/types/project'
import {
  buildFrameLayout,
  findActiveFrameLayoutIndex,
  findActiveFrameLayoutItems,
  type FrameLayoutItem
} from '@/lib/timeline/frame-layout'
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame'
import type { ActiveClipDataAtFrame } from '@/types'

/**
 * Video data context value.
 */
export interface VideoDataContextValue {
  // Sorted clips (by startTime)
  sortedClips: Clip[]

  // Frame layout for video playback
  frameLayout: FrameLayoutItem[]

  // Get active clip data at a specific frame
  getActiveClipData: (frame: number) => ActiveClipDataAtFrame | null

  // Get active frame layout index
  getActiveLayoutIndex: (frame: number) => number

  // Get all active layout items at a frame (for overlapping tracks)
  getActiveLayoutItems: (frame: number) => FrameLayoutItem[]

  // Get layout item by index
  getLayoutItem: (index: number) => FrameLayoutItem | null

  // Get prev/next layout items relative to an index
  getPrevLayoutItem: (index: number) => FrameLayoutItem | null
  getNextLayoutItem: (index: number) => FrameLayoutItem | null

  // Get recording by ID
  getRecording: (recordingId: string) => Recording | undefined

  // Map of recordings by ID (O(1) lookup)
  recordingsMap: Map<string, Recording>

  // All effects
  effects: Effect[]
}

const VideoDataContext = createContext<VideoDataContextValue | null>(null)

/**
 * Hook to access video data context.
 * Throws if used outside of VideoDataProvider.
 */
export function useVideoData(): VideoDataContextValue {
  const ctx = useContext(VideoDataContext)
  if (!ctx) {
    throw new Error('[useVideoData] Must be used within VideoDataProvider')
  }
  return ctx
}

/**
 * Hook to safely try to get video data context.
 * Returns null if outside provider (doesn't throw).
 */
export function useVideoDataOptional(): VideoDataContextValue | null {
  return useContext(VideoDataContext)
}

interface VideoDataProviderProps {
  clips: Clip[]
  recordings: Recording[]
  effects: Effect[]
  fps: number
  children: React.ReactNode
}

/**
 * VideoDataProvider - Provides computed video data to the composition tree.
 *
 * This provider should wrap components that need frame layout and clip data.
 * It computes these values once and provides them via context, eliminating
 * duplicated computation in child components.
 */
export function VideoDataProvider({
  clips,
  recordings,
  effects,
  fps,
  children
}: VideoDataProviderProps) {
  // Create recordings map for O(1) lookup
  const recordingsMap = useMemo(
    () => new Map(recordings.map(r => [r.id, r])),
    [recordings]
  )

  // Sort clips by start time
  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => a.startTime - b.startTime),
    [clips]
  )

  // Build frame layout
  const frameLayout = useMemo(
    () => buildFrameLayout(sortedClips, fps, recordingsMap),
    [sortedClips, fps, recordingsMap]
  )

  // Get recording by ID
  const getRecording = useCallback(
    (recordingId: string): Recording | undefined => recordingsMap.get(recordingId),
    [recordingsMap]
  )

  // Get active clip data at frame
  const getActiveClipData = useCallback(
    (frame: number): ActiveClipDataAtFrame | null => {
      return getActiveClipDataAtFrame({
        frame,
        frameLayout,
        fps,
        effects,
        getRecording: (id) => getRecording(id) ?? null
      })
    },
    [frameLayout, fps, effects, getRecording]
  )

  // Get active layout index
  const getActiveLayoutIndex = useCallback(
    (frame: number): number => findActiveFrameLayoutIndex(frameLayout, frame),
    [frameLayout]
  )

  // Get all active layout items at frame
  const getActiveLayoutItems = useCallback(
    (frame: number): FrameLayoutItem[] => findActiveFrameLayoutItems(frameLayout, frame),
    [frameLayout]
  )

  // Get layout item by index
  const getLayoutItem = useCallback(
    (index: number): FrameLayoutItem | null => {
      if (index < 0 || index >= frameLayout.length) return null
      return frameLayout[index]
    },
    [frameLayout]
  )

  // Get prev layout item
  const getPrevLayoutItem = useCallback(
    (index: number): FrameLayoutItem | null => {
      if (index <= 0) return null
      return frameLayout[index - 1]
    },
    [frameLayout]
  )

  // Get next layout item
  const getNextLayoutItem = useCallback(
    (index: number): FrameLayoutItem | null => {
      if (index < 0 || index >= frameLayout.length - 1) return null
      return frameLayout[index + 1]
    },
    [frameLayout]
  )

  // Build context value
  const value = useMemo<VideoDataContextValue>(() => ({
    sortedClips,
    frameLayout,
    getActiveClipData,
    getActiveLayoutIndex,
    getActiveLayoutItems,
    getLayoutItem,
    getPrevLayoutItem,
    getNextLayoutItem,
    getRecording,
    recordingsMap,
    effects
  }), [
    sortedClips,
    frameLayout,
    getActiveClipData,
    getActiveLayoutIndex,
    getActiveLayoutItems,
    getLayoutItem,
    getPrevLayoutItem,
    getNextLayoutItem,
    getRecording,
    recordingsMap,
    effects
  ])

  return (
    <VideoDataContext.Provider value={value}>
      {children}
    </VideoDataContext.Provider>
  )
}

/**
 * Hook to get active clip data at current frame.
 * Convenience hook that combines useVideoData with useCurrentFrame.
 */
export function useActiveClipData(currentFrame: number): ActiveClipDataAtFrame | null {
  const { getActiveClipData } = useVideoData()
  return useMemo(() => getActiveClipData(currentFrame), [getActiveClipData, currentFrame])
}

/**
 * Hook to get layout navigation at current frame.
 * Returns active/prev/next layout items.
 */
export function useLayoutNavigation(currentFrame: number) {
  const { getActiveLayoutIndex, getLayoutItem, getPrevLayoutItem, getNextLayoutItem } = useVideoData()

  return useMemo(() => {
    const activeIndex = getActiveLayoutIndex(currentFrame)
    return {
      activeIndex,
      activeItem: getLayoutItem(activeIndex),
      prevItem: getPrevLayoutItem(activeIndex),
      nextItem: getNextLayoutItem(activeIndex)
    }
  }, [currentFrame, getActiveLayoutIndex, getLayoutItem, getPrevLayoutItem, getNextLayoutItem])
}
