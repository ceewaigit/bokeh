import React, { createContext, useContext } from 'react'

import type { SpeedUpPeriod } from '@/types/speed-up'
import { TrackType } from '@/types/project'

export interface DragPreview {
  clipId: string
  trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam
  startTimes: Record<string, number>
  insertIndex: number
}

export interface TimelineContextValue {
  pixelsPerMs: number
  dragPreview: DragPreview | null
  scrollTop: number
  minZoom: number
  maxZoom: number
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onZoomChange: (zoom: number) => void
  onScrubStart: (e: any) => void
  onScrubMove: (e: any) => void
  onScrubEnd: () => void
  onSelect: (clipId: string) => void
  onDragPreview: (clipId: string, trackType: TrackType.Video | TrackType.Audio, proposedStartTime: number) => void
  onDragCommit: (clipId: string, trackType: TrackType.Video | TrackType.Audio, proposedStartTime: number) => void
  onContextMenu: (e: { evt: { clientX: number; clientY: number } }, clipId: string) => void
  onTrimStart: (clipId: string, newStartTime: number) => void
  onTrimEnd: (clipId: string, newEndTime: number) => void
  onOpenSpeedUpSuggestion: (clipId: string, opts: {
    x: number
    y: number
    period: SpeedUpPeriod
    allTypingPeriods: SpeedUpPeriod[]
    allIdlePeriods: SpeedUpPeriod[]
  }) => void
  onSplitClip: (clipId: string) => void | Promise<void>
  onTrimClipStart: (clipId: string) => void | Promise<void>
  onTrimClipEnd: (clipId: string) => void | Promise<void>
  onDuplicateClip: (clipId: string) => void | Promise<void>
  onCutClip: (clipId: string) => void | Promise<void>
  onCopyClip: (clipId: string) => void | Promise<void>
  onPasteClip: () => void | Promise<void>
  onDeleteClip: (clipId: string) => void | Promise<void>
  onSpeedUpClip: (clipId: string) => void | Promise<void>
  onSplitSelected: () => void | Promise<void>
  onTrimStartSelected: () => void | Promise<void>
  onTrimEndSelected: () => void | Promise<void>
  onDeleteSelected: () => void | Promise<void>
  onDuplicateSelected: () => void | Promise<void>
}

const TimelineContext = createContext<TimelineContextValue | null>(null)

export function useTimelineContext(): TimelineContextValue {
  const ctx = useContext(TimelineContext)
  if (!ctx) {
    throw new Error('[useTimelineContext] Must be used within TimelineContextProvider')
  }
  return ctx
}

export function TimelineContextProvider({
  value,
  children
}: {
  value: TimelineContextValue
  children: React.ReactNode
}) {
  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  )
}
