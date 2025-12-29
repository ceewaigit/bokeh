import React from 'react'
import { TimelineConfig } from '@/lib/timeline/config'
import type { TrackType } from '@/types/project'

interface TimelineDropTargetProps {
    visible: boolean
    trackType: TrackType | null
    getTrackBounds: (type: TrackType) => { y: number; height: number }
    timelineWidth: number
}

export const TimelineDropTarget = ({
    visible,
    trackType,
    getTrackBounds,
    timelineWidth
}: TimelineDropTargetProps) => {
    if (!visible || !trackType) return null

    const bounds = getTrackBounds(trackType)

    return (
        <div
            className="absolute pointer-events-none z-40 timeline-drop-target"
            style={{
                left: 0,
                top: bounds.y + 'px',
                width: (timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH) + 'px',
                height: bounds.height + 'px',
            }}
        />
    )
}
