
import { useCallback, useState } from 'react'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { ClipReorderService } from '@/lib/timeline/clip-reorder-service'
import { TimelineConfig } from '@/lib/timeline/config'
import type { Project, TrackType } from '@/types/project'

interface UseTimelineSnappingProps {
    pixelsPerMs: number
    project?: Project | null
}

export const useTimelineSnapping = ({ pixelsPerMs, project }: UseTimelineSnappingProps) => {
    const [isSnapping, setIsSnapping] = useState(false)

    // Calculate snap points from project tracks
    const getSnapPoints = useCallback((excludeClipId?: string) => {
        if (!project) return []

        // Aggregate all clips from all tracks
        const allClips = project.timeline.tracks.flatMap(t => t.clips)

        // Use the service to compute snap positions
        // This includes start/end of clips, and 0
        return ClipReorderService.computeSnapPositions(allClips, excludeClipId || '')
    }, [project])

    const snapTime = useCallback((time: number, snapPoints: number[]) => {
        const { position } = ClipReorderService.findNearestSnapPosition(time, snapPoints)
        // Manually determine snapping state based on distance or change
        const isSnapped = Math.abs(time - position) > 0.001
        setIsSnapping(isSnapped)
        return position
    }, [])

    const getSnappedTimeFromPixel = useCallback((pixelX: number, snapPoints: number[]) => {
        const rawTime = Math.max(0, TimeConverter.pixelsToMs(pixelX, pixelsPerMs))
        return snapTime(rawTime, snapPoints)
    }, [pixelsPerMs, snapTime])

    return {
        getSnapPoints,
        snapTime,
        getSnappedTimeFromPixel,
        isSnapping
    }
}
