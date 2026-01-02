/**
 * useAssetDragDrop
 *
 * Manages asset library drag-and-drop onto timeline.
 *
 * Usage:
 *   const { isDragging, handlers, ...state } = useAssetDragDrop({ ... })
 *   <div {...handlers} />
 */

import { useState, useCallback, useEffect } from 'react'
import { TrackType, type Clip } from '@/types/project'
import { useAssetLibraryStore } from '@/features/stores/asset-library-store'
import { TimelineConfig } from '@/features/timeline/config'
import { TimeConverter } from '@/features/timeline/time/time-space-converter'
import { ClipPositioning } from '@/features/timeline/clips/clip-positioning'
import { getSnappedDragX } from '@/features/timeline/utils/drag-positioning'
import { useCommandExecutor } from '@/shared/hooks/use-command-executor'
import { AddAssetCommand } from '@/features/commands'

export interface DragPreviewForAsset {
    clipId: string
    trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam
    startTimes: Record<string, number>
    insertIndex: number
}

interface TimeBlock {
    id: string
    startTime: number
    endTime: number
}

interface UseAssetDragDropOptions {
    pixelsPerMs: number
    getTrackBounds: (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => { y: number; height: number }
    getClipsForTrack: (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => Clip[]
    getClipBlocksForTrack: (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => TimeBlock[]
    getStagePoint: (e: React.DragEvent<HTMLDivElement>) => { stageX: number; stageY: number }
}

export interface UseAssetDragDropReturn {
    isDragging: boolean
    dragTime: number | null
    dragAssetTrackType: TrackType.Video | TrackType.Audio | TrackType.Webcam | null
    dragPreview: DragPreviewForAsset | null
    handlers: {
        onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
        onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
        onDrop: (e: React.DragEvent<HTMLDivElement>) => void
    }
}

export function useAssetDragDrop({
    pixelsPerMs,
    getTrackBounds,
    getClipsForTrack,
    getClipBlocksForTrack,
    getStagePoint
}: UseAssetDragDropOptions): UseAssetDragDropReturn {
    const draggingAsset = useAssetLibraryStore((s) => s.draggingAsset)
    const [dragTime, setDragTime] = useState<number | null>(null)
    const [dragAssetTrackType, setDragAssetTrackType] = useState<TrackType.Video | TrackType.Audio | TrackType.Webcam | null>(null)
    const [dragPreview, setDragPreview] = useState<DragPreviewForAsset | null>(null)

    const executorRef = useCommandExecutor()

    const getAssetDropTrackType = useCallback((
        assetType: 'video' | 'audio' | 'image',
        stageY: number
    ): TrackType.Video | TrackType.Audio | TrackType.Webcam | null => {
        const hitSlop = TimelineConfig.TRACK_PADDING
        const boundsFor = (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => getTrackBounds(trackType)
        const isWithin = (bounds: ReturnType<typeof boundsFor>) => (
            stageY >= bounds.y - hitSlop && stageY <= bounds.y + bounds.height + hitSlop
        )

        if (assetType === 'audio') {
            const bounds = boundsFor(TrackType.Audio)
            return isWithin(bounds) ? TrackType.Audio : null
        }

        if (assetType === 'video') {
            const webcamBounds = boundsFor(TrackType.Webcam)
            if (isWithin(webcamBounds)) return TrackType.Webcam
            const videoBounds = boundsFor(TrackType.Video)
            return isWithin(videoBounds) ? TrackType.Video : null
        }

        if (assetType === 'image') {
            const bounds = boundsFor(TrackType.Video)
            return isWithin(bounds) ? TrackType.Video : null
        }

        return null
    }, [getTrackBounds])

    const resetAssetDragState = useCallback((clearDraggingAsset: boolean) => {
        setDragTime(null)
        setDragAssetTrackType(null)
        setDragPreview((prev) => (prev?.clipId === '__asset__' ? null : prev))
        if (clearDraggingAsset) {
            useAssetLibraryStore.getState().setDraggingAsset(null)
        }
    }, [])

    // Cleanup on window dragend/drop
    useEffect(() => {
        const handleWindowDragEnd = () => resetAssetDragState(true)
        const handleWindowDrop = () => resetAssetDragState(true)
        window.addEventListener('dragend', handleWindowDragEnd)
        window.addEventListener('drop', handleWindowDrop)
        return () => {
            window.removeEventListener('dragend', handleWindowDragEnd)
            window.removeEventListener('drop', handleWindowDrop)
        }
    }, [resetAssetDragState])

    const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'

        if (!draggingAsset) return

        const { stageX, stageY } = getStagePoint(e)
        const assetDuration = draggingAsset.metadata?.duration || 5000
        const targetTrack = getAssetDropTrackType(draggingAsset.type, stageY)

        if (!targetTrack) {
            setDragTime(null)
            setDragPreview((prev) => (prev?.clipId === '__asset__' ? null : prev))
            return
        }

        const snappedX = getSnappedDragX({
            proposedX: stageX,
            blockWidth: TimeConverter.msToPixels(assetDuration, pixelsPerMs),
            blocks: getClipBlocksForTrack(targetTrack),
            pixelsPerMs
        })
        const proposedTime = Math.max(
            0,
            TimeConverter.pixelsToMs(snappedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
        )

        const preview = ClipPositioning.computeContiguousPreview(
            getClipsForTrack(targetTrack),
            proposedTime,
            { durationMs: assetDuration }
        )

        if (preview) {
            setDragPreview({
                clipId: '__asset__',
                trackType: targetTrack,
                startTimes: preview.startTimes,
                insertIndex: preview.insertIndex
            })
            setDragTime(preview.insertTime)
            setDragAssetTrackType(targetTrack)
        } else {
            setDragPreview((prev) => (prev?.clipId === '__asset__' ? null : prev))
            setDragTime(proposedTime)
            setDragAssetTrackType(targetTrack)
        }
    }, [draggingAsset, getStagePoint, getAssetDropTrackType, pixelsPerMs, getClipBlocksForTrack, getClipsForTrack])

    const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        const relatedTarget = e.relatedTarget as Node | null
        if (relatedTarget && e.currentTarget.contains(relatedTarget)) return
        resetAssetDragState(false)
    }, [resetAssetDragState])

    const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        const assetData = e.dataTransfer.getData('application/x-bokeh-asset')

        if (!assetData && !draggingAsset) {
            resetAssetDragState(true)
            return
        }

        try {
            const asset = assetData ? JSON.parse(assetData) : {
                path: draggingAsset!.path,
                duration: draggingAsset!.metadata?.duration || 0,
                width: draggingAsset!.metadata?.width || 0,
                height: draggingAsset!.metadata?.height || 0,
                type: draggingAsset!.type,
                name: draggingAsset!.name
            }

            const { stageX, stageY } = getStagePoint(e)
            const assetDuration = asset.duration || 5000
            const targetTrack = getAssetDropTrackType(asset.type, stageY) ?? dragAssetTrackType

            if (!targetTrack) {
                setDragAssetTrackType(null)
                return
            }

            const snappedX = getSnappedDragX({
                proposedX: stageX,
                blockWidth: TimeConverter.msToPixels(assetDuration, pixelsPerMs),
                blocks: getClipBlocksForTrack(targetTrack),
                pixelsPerMs
            })
            const proposedTime = Math.max(
                0,
                TimeConverter.pixelsToMs(snappedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
            )

            const preview = ClipPositioning.computeContiguousPreview(
                getClipsForTrack(targetTrack),
                proposedTime,
                { durationMs: assetDuration }
            )

            const insertIndex = preview?.insertIndex
            const startTime = preview ? undefined : proposedTime

            if (executorRef.current) {
                await executorRef.current.execute(AddAssetCommand, {
                    asset,
                    options: {
                        insertIndex,
                        startTime,
                        trackType: targetTrack
                    }
                })
            }

            setDragAssetTrackType(null)
        } catch (err) {
            console.error('Failed to parse asset data on drop', err)
        } finally {
            resetAssetDragState(true)
        }
    }, [draggingAsset, getStagePoint, getAssetDropTrackType, dragAssetTrackType, pixelsPerMs, getClipBlocksForTrack, getClipsForTrack, resetAssetDragState, executorRef])

    return {
        isDragging: !!draggingAsset,
        dragTime,
        dragAssetTrackType,
        dragPreview,
        handlers: {
            onDragOver,
            onDragLeave,
            onDrop
        }
    }
}
