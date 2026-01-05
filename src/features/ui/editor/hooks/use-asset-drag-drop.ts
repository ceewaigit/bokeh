/**
 * useAssetDragDrop
 *
 * Manages asset library drag-and-drop onto timeline.
 *
 * Usage:
 *   const { isDragging, handlers, ...state } = useAssetDragDrop({ ... })
 *   <div {...handlers} />
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { TrackType, type Clip } from '@/types/project'
import { useAssetLibraryStore } from '@/features/core/stores/asset-library-store'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { getSnappedDragX, computeContiguousPreview } from '@/features/ui/timeline/utils/drag-positioning'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { AddAssetCommand } from '@/features/core/commands'

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

// Raw drag input for RAF-deferred computation
interface PendingDragInput {
    stageX: number
    stageY: number
    assetDuration: number
    assetType: 'video' | 'audio' | 'image'
    assetName?: string
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

    // RAF throttling refs - store raw input, compute in RAF
    const rafRef = useRef<number | null>(null)
    const pendingInputRef = useRef<PendingDragInput | null>(null)

    const executorRef = useCommandExecutor()

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
        }
    }, [])

    const getAssetDropTrackType = useCallback((
        asset: { type: 'video' | 'audio' | 'image'; name?: string },
        stageY: number
    ): TrackType.Video | TrackType.Audio | TrackType.Webcam | null => {
        const hitSlop = TimelineConfig.TRACK_PADDING
        const boundsFor = (trackType: TrackType.Video | TrackType.Audio | TrackType.Webcam) => getTrackBounds(trackType)
        const isWithin = (bounds: ReturnType<typeof boundsFor>) => (
            stageY >= bounds.y - hitSlop && stageY <= bounds.y + bounds.height + hitSlop
        )

        // 1. Audio
        if (asset.type === 'audio') {
            const bounds = boundsFor(TrackType.Audio)
            return isWithin(bounds) ? TrackType.Audio : null
        }

        // 2. Video / Webcam / Image
        if (asset.type === 'video' || asset.type === 'image') {
            // WEBCAM OVERRIDE:
            // If the asset is a webcam recording (via name convention), FORCE it to be
            // on the webcam track or nothing. It should NOT land on the video track.
            const isWebcamAsset = asset.name?.toLowerCase().includes('webcam')

            if (isWebcamAsset) {
                // If it's a webcam asset, we theoretically allow dropping ANYWHERE to mean "add to webcam track".
                // But for good UX, let's keep it somewhat contextual or just default to Webcam track
                // if it's generally over the timeline area.
                // For now, let's prioritize the Webcam track specifically if dragged there,
                // OR if dragged over Video track, stick to Webcam track (overlay behavior).
                const webcamBounds = boundsFor(TrackType.Webcam)
                const videoBounds = boundsFor(TrackType.Video)

                // If hovering webcam OR video track, return Webcam track.
                if (isWithin(webcamBounds) || isWithin(videoBounds)) {
                    return TrackType.Webcam
                }
                return null
            }

            // Normal Video/Image Logic
            const webcamBounds = boundsFor(TrackType.Webcam)
            if (isWithin(webcamBounds)) return TrackType.Webcam

            const videoBounds = boundsFor(TrackType.Video)
            return isWithin(videoBounds) ? TrackType.Video : null
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

        // Only capture raw coordinates - expensive computation deferred to RAF
        const { stageX, stageY } = getStagePoint(e)
        pendingInputRef.current = {
            stageX,
            stageY,
            assetDuration: draggingAsset.metadata?.duration || 5000,
            assetType: draggingAsset.type,
            assetName: draggingAsset.name
        }

        // Schedule RAF to compute and apply state updates (throttles to ~60fps)
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null
                const input = pendingInputRef.current
                if (!input) return

                // Now do the expensive computation (once per frame, not per event)
                const targetTrack = getAssetDropTrackType(
                    { type: input.assetType, name: input.assetName },
                    input.stageY
                )

                if (!targetTrack) {
                    setDragTime(null)
                    setDragAssetTrackType(null)
                    setDragPreview(null)
                    return
                }

                const snappedX = getSnappedDragX({
                    proposedX: input.stageX,
                    blockWidth: TimeConverter.msToPixels(input.assetDuration, pixelsPerMs),
                    blocks: getClipBlocksForTrack(targetTrack),
                    pixelsPerMs
                })
                const proposedTime = Math.max(
                    0,
                    TimeConverter.pixelsToMs(snappedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
                )

                // Webcam track: No contiguous/ripple logic
                if (targetTrack === TrackType.Webcam) {
                    setDragTime(proposedTime)
                    setDragAssetTrackType(targetTrack)
                    setDragPreview({
                        clipId: '__asset__',
                        trackType: targetTrack,
                        startTimes: {},
                        insertIndex: -1
                    })
                    return
                }

                // Video/Audio track: Compute contiguous preview
                const clips = getClipsForTrack(targetTrack)
                const blocks = clips.map(c => ({ id: c.id, startTime: c.startTime, endTime: c.startTime + c.duration }))
                const preview = computeContiguousPreview(blocks, proposedTime, input.assetDuration)

                if (preview) {
                    setDragTime(preview.insertTime)
                    setDragAssetTrackType(targetTrack)
                    setDragPreview({
                        clipId: '__asset__',
                        trackType: targetTrack,
                        startTimes: preview.startTimes,
                        insertIndex: preview.insertIndex
                    })
                } else {
                    setDragTime(proposedTime)
                    setDragAssetTrackType(targetTrack)
                    setDragPreview(null)
                }
            })
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
            const targetTrack = getAssetDropTrackType(asset, stageY) ?? dragAssetTrackType

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

            let insertIndex: number | undefined
            let startTime: number | undefined

            if (targetTrack === TrackType.Webcam) {
                // Webcam: Explicit start time, no insert index
                startTime = proposedTime
            } else {
                const clips = getClipsForTrack(targetTrack)
                const blocks = clips.map(c => ({ id: c.id, startTime: c.startTime, endTime: c.startTime + c.duration }))
                const preview = computeContiguousPreview(
                    blocks,
                    proposedTime,
                    assetDuration
                )
                insertIndex = preview?.insertIndex
                if (!preview) {
                    startTime = proposedTime
                }
            }

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
