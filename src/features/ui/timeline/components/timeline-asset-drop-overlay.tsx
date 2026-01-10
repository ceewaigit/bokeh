import React from 'react'
import { useAssetLibraryStore } from '@/features/core/stores/asset-library-store'
import { TimelineDropTarget } from './timeline-drop-target'
import { TimelineAssetGhost } from './timeline-asset-ghost'
import type { TrackType } from '@/types/project'
import type { UseAssetDragDropReturn } from '@/features/ui/editor/hooks/use-asset-drag-drop'

interface TimelineAssetDropOverlayProps {
    assetDragDrop: UseAssetDragDropReturn
    getTrackBounds: (type: TrackType) => { y: number; height: number; clipY: number; clipHeight: number }
    pixelsPerMs: number
}

/**
 * Isolated component for asset drop overlay.
 * This subscribes to `draggingAsset` directly, isolating re-renders to just this component
 * instead of the entire TimelineCanvasContent.
 */
export const TimelineAssetDropOverlay = React.memo(function TimelineAssetDropOverlay({
    assetDragDrop,
    getTrackBounds,
    pixelsPerMs
}: TimelineAssetDropOverlayProps) {
    // Subscribe to draggingAsset here to isolate re-renders
    const draggingAsset = useAssetLibraryStore((s) => s.draggingAsset)

    const effectiveTrackType = assetDragDrop.dragAssetTrackType ??
        (assetDragDrop.dragPreview?.clipId === '__asset__' ? assetDragDrop.dragPreview.trackType : null)

    return (
        <>
            {/* Asset drop target highlight */}
            <TimelineDropTarget
                visible={!!draggingAsset && !!effectiveTrackType}
                trackType={effectiveTrackType}
                getTrackBounds={getTrackBounds}
            />

            {/* Drag Preview Overlay (Ghost Clip) */}
            <TimelineAssetGhost
                draggingAsset={draggingAsset}
                dragTime={assetDragDrop.dragTime}
                trackType={effectiveTrackType}
                getTrackBounds={getTrackBounds}
                pixelsPerMs={pixelsPerMs}
            />
        </>
    )
})
