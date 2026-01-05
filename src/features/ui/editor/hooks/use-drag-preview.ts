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
import { computeContiguousPreview } from '@/features/ui/timeline/utils/drag-positioning'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { ReorderClipCommand, UpdateClipCommand } from '@/features/core/commands'

export interface DragPreview {
    clipId: string
    trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam | TrackType.Webcam
    startTimes: Record<string, number>
    insertIndex: number
}

interface UseDragPreviewOptions {
    getClipsForTrack: (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => Clip[]
}

export interface UseDragPreviewReturn {
    dragPreview: DragPreview | null
    handleDragPreview: (clipId: string, trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam, proposedTime: number) => void
    handleDragCommit: (clipId: string, trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam, proposedTime: number) => void
    clearPreview: () => void
}

export function useDragPreview({ getClipsForTrack }: UseDragPreviewOptions): UseDragPreviewReturn {
    const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
    const previewRafRef = useRef<number | null>(null)
    const pendingPreviewRef = useRef<{
        clipId: string
        trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam
        proposedTime: number
    } | null>(null)

    const executorRef = useCommandExecutor()

    const buildContiguousPreview = useCallback((
        clips: Clip[],
        clipId: string,
        proposedTime: number
    ) => {
        const clip = clips.find(c => c.id === clipId)
        const duration = clip ? clip.duration : 0
        const blocks = clips.map(c => ({ id: c.id, startTime: c.startTime, endTime: c.startTime + c.duration }))
        return computeContiguousPreview(blocks, proposedTime, duration, clipId)
    }, [])

    const schedulePreviewUpdate = useCallback((
        clipId: string,
        trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam,
        proposedTime: number
    ) => {
        pendingPreviewRef.current = { clipId, trackType, proposedTime }
        if (previewRafRef.current !== null) return

        previewRafRef.current = requestAnimationFrame(() => {
            previewRafRef.current = null
            const pending = pendingPreviewRef.current
            if (!pending) return

            if (pending.trackType === TrackType.Webcam) {
                // Webcam: No contiguous preview (no ripple)
                setDragPreview({
                    clipId: pending.clipId,
                    trackType: pending.trackType,
                    startTimes: {}, // No clips move
                    insertIndex: -1 // Not used
                })
                return
            }

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
        trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam,
        proposedTime: number
    ) => {
        schedulePreviewUpdate(clipId, trackType, proposedTime)
    }, [schedulePreviewUpdate])

    const handleDragCommit = useCallback(async (
        clipId: string,
        trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam,
        proposedTime: number
    ) => {
        // Special Case: Webcam tracks should support free positioning (non-contiguous)
        if (trackType === TrackType.Webcam) {
            if (executorRef.current) {
                await executorRef.current.execute(
                    UpdateClipCommand,
                    clipId,
                    { startTime: proposedTime },
                    { maintainContiguous: false }
                )
            }
            clearPreview()
            return
        }

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
