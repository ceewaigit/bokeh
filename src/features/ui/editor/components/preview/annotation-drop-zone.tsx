/**
 * AnnotationDropZone - Handles drag-and-drop for annotations onto the preview
 *
 * Extracted from preview-interactions.tsx for single responsibility.
 */

import React, { useCallback } from 'react'
import { AnnotationType } from '@/types/project'
import { EffectLayerType } from '@/features/effects/types'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useAnnotationDrop } from '@/features/effects/annotation/hooks/use-annotation-drop'
import { useAnnotationDropTarget } from '@/features/effects/annotation/ui/AnnotationDragPreview'
import { containerPointToVideoPoint, getVideoRectFromSnapshot } from '@/features/ui/editor/logic/preview-point-transforms'
import { EffectCreation } from '@/features/effects/core/creation'
import type { FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'

interface AnnotationDropZoneProps {
    aspectContainerRef: React.RefObject<HTMLDivElement | null>
    snapshot: FrameSnapshot
    currentTimeMs: number
    children: React.ReactNode
    className?: string
}

/**
 * Hook that combines both HTML5 drag-drop and custom mouse-based drag-drop
 * for annotations onto the preview.
 */
export function useAnnotationDropZone({
    aspectContainerRef,
    snapshot,
    currentTimeMs,
}: {
    aspectContainerRef: React.RefObject<HTMLDivElement | null>
    snapshot: FrameSnapshot
    currentTimeMs: number
}) {
    const addEffect = useProjectStore((s) => s.addEffect)
    const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer)
    const startEditingOverlay = useProjectStore((s) => s.startEditingOverlay)

    // HTML5 drag-drop handler
    const {
        handlers: html5DropHandlers,
        isDraggingAnnotation
    } = useAnnotationDrop({
        aspectContainerRef,
        snapshot,
        currentTime: currentTimeMs
    })

    // Custom mouse-based drop handler
    const handleCustomAnnotationDrop = useCallback((type: AnnotationType, containerX: number, containerY: number) => {
        const videoPoint = containerPointToVideoPoint({ x: containerX, y: containerY }, snapshot)
        const videoRectData = getVideoRectFromSnapshot(snapshot)

        // Convert to percent within the video frame
        const percentX = videoRectData.width > 0 ? (videoPoint.x / videoRectData.width) * 100 : 50
        const percentY = videoRectData.height > 0 ? (videoPoint.y / videoRectData.height) * 100 : 50

        const effect = EffectCreation.createAnnotationEffect(type, {
            startTime: currentTimeMs,
            position: { x: percentX, y: percentY },
        })

        addEffect(effect)
        selectEffectLayer(EffectLayerType.Annotation, effect.id)
        startEditingOverlay(effect.id)
    }, [snapshot, currentTimeMs, addEffect, selectEffectLayer, startEditingOverlay])

    // Wire up custom event listener
    useAnnotationDropTarget(aspectContainerRef, handleCustomAnnotationDrop)

    return {
        isDraggingAnnotation,
        dropHandlers: html5DropHandlers,
    }
}

/**
 * Component wrapper that provides the drop zone UI and handlers.
 */
export const AnnotationDropZone: React.FC<AnnotationDropZoneProps> = ({
    aspectContainerRef,
    snapshot,
    currentTimeMs,
    children,
    className = '',
}) => {
    const { isDraggingAnnotation, dropHandlers } = useAnnotationDropZone({
        aspectContainerRef,
        snapshot,
        currentTimeMs,
    })

    return (
        <div
            className={`${className}${isDraggingAnnotation ? ' ring-2 ring-primary/50 ring-inset' : ''}`}
            onDragOver={dropHandlers.onDragOver}
            onDragLeave={dropHandlers.onDragLeave}
            onDrop={dropHandlers.onDrop}
        >
            {children}
        </div>
    )
}
