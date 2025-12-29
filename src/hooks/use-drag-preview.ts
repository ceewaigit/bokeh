/**
 * useDragPreview
 *
 * Manages clip drag preview state with RAF-throttled updates.
 *
 * Usage:
 *   const { dragPreview, handleDragPreview, handleDragCommit, clearPreview } = useDragPreview()
 */

import { useState, useCallback, useRef } from 'react'
import { TrackType, type Clip } from '@/types/project'
import { ClipPositioning } from '@/features/timeline/clips/clip-positioning'
import { useCommandExecutor } from '@/hooks/use-command-executor'
import { ReorderClipCommand } from '@/lib/commands'

export interface DragPreview {
    clipId: string
    trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam
    startTimes: Record<string, number>
    insertIndex: number
}

interface UseDragPreviewOptions {
    getClipsForTrack: (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => Clip[]
}

export interface UseDragPreviewReturn {
    dragPreview: DragPreview | null
    handleDragPreview: (clipId: string, trackType: TrackType.Video | TrackType.Audio, proposedTime: number) => void
    handleDragCommit: (clipId: string, trackType: TrackType.Video | TrackType.Audio, proposedTime: number) => void
    clearPreview: () => void
}

export function useDragPreview({ getClipsForTrack }: UseDragPreviewOptions): UseDragPreviewReturn {
    const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
    const previewRafRef = useRef<number | null>(null)
    const pendingPreviewRef = useRef<{
        clipId: string
        trackType: TrackType.Video | TrackType.Audio
        proposedTime: number
    } | null>(null)

    const executorRef = useCommandExecutor()

    const buildContiguousPreview = useCallback((
        clips: Clip[],
        clipId: string,
        proposedTime: number
    ) => {
        return ClipPositioning.computeContiguousPreview(clips, proposedTime, { clipId })
    }, [])

    const schedulePreviewUpdate = useCallback((
        clipId: string,
        trackType: TrackType.Video | TrackType.Audio,
        proposedTime: number
    ) => {
        pendingPreviewRef.current = { clipId, trackType, proposedTime }
        if (previewRafRef.current !== null) return

        previewRafRef.current = requestAnimationFrame(() => {
            previewRafRef.current = null
            const pending = pendingPreviewRef.current
            if (!pending) return

            const clips = getClipsForTrack(pending.trackType)
            const preview = buildContiguousPreview(clips, pending.clipId, pending.proposedTime)
            if (preview) {
                setDragPreview({
                    clipId: pending.clipId,
                    trackType: pending.trackType,
                    startTimes: preview.startTimes,
                    insertIndex: preview.insertIndex
                })
            }
        })
    }, [buildContiguousPreview, getClipsForTrack])

    const clearPreview = useCallback(() => {
        pendingPreviewRef.current = null
        if (previewRafRef.current !== null) {
            cancelAnimationFrame(previewRafRef.current)
            previewRafRef.current = null
        }
        setDragPreview(null)
    }, [])

    const handleDragPreview = useCallback((
        clipId: string,
        trackType: TrackType.Video | TrackType.Audio,
        proposedTime: number
    ) => {
        schedulePreviewUpdate(clipId, trackType, proposedTime)
    }, [schedulePreviewUpdate])

    const handleDragCommit = useCallback(async (
        clipId: string,
        trackType: TrackType.Video | TrackType.Audio,
        proposedTime: number
    ) => {
        const clips = getClipsForTrack(trackType)
        const preview = buildContiguousPreview(clips, clipId, proposedTime)

        if (preview && executorRef.current) {
            await executorRef.current.execute(ReorderClipCommand, clipId, preview.insertIndex)
        }
        clearPreview()
    }, [buildContiguousPreview, clearPreview, getClipsForTrack, executorRef])

    return {
        dragPreview,
        handleDragPreview,
        handleDragCommit,
        clearPreview
    }
}
