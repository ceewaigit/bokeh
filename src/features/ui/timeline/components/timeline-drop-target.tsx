import React from 'react'
import type { TrackType } from '@/types/project'
import { useTimelineLayout } from './timeline-layout-provider'

interface TimelineDropTargetProps {
    visible: boolean
    trackType: TrackType | null
    getTrackBounds: (type: TrackType) => { y: number; height: number }
}

export const TimelineDropTarget = React.memo(function TimelineDropTarget({
    visible,
    trackType,
    getTrackBounds
}: TimelineDropTargetProps) {
    const { stageWidth } = useTimelineLayout()
    if (!visible || !trackType) return null
    const bounds = getTrackBounds(trackType)

    return (
        <div
            className="absolute pointer-events-none z-40 timeline-drop-target"
            style={{
                left: 0,
                top: bounds.y + 'px',
                width: stageWidth + 'px',
                height: bounds.height + 'px',
            }}
        />
    )
})
