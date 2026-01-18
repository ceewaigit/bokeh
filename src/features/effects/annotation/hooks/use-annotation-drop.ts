/**
 * useAnnotationDrop
 *
 * Handles drag-and-drop of annotation types onto the preview canvas.
 * Converts drop coordinates to video-local percent positions.
 */

import { useCallback, useState, useRef } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { AnnotationType } from '@/types/project'
import { EffectCreation } from '@/features/effects/core/creation'
import { EffectLayerType } from '@/features/effects/types'
import { AddEffectCommand, CommandExecutor } from '@/features/core/commands'
import {
    containerPointToVideoPoint,
    getVideoRectFromSnapshot,
    type Point
} from '@/features/ui/editor/logic/preview-point-transforms'
import type { FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'

export const ANNOTATION_DRAG_TYPE = 'application/x-bokeh-annotation'

interface UseAnnotationDropOptions {
    aspectContainerRef: React.RefObject<HTMLDivElement | null>
    snapshot: FrameSnapshot
    currentTime: number
}

interface UseAnnotationDropReturn {
    handlers: {
        onDragOver: (e: React.DragEvent) => void
        onDragEnter: (e: React.DragEvent) => void
        onDragLeave: (e: React.DragEvent) => void
        onDrop: (e: React.DragEvent) => void
    }
    isDraggingAnnotation: boolean
}

export function useAnnotationDrop({
    aspectContainerRef,
    snapshot,
    currentTime
}: UseAnnotationDropOptions): UseAnnotationDropReturn {
    const [isDraggingAnnotation, setIsDraggingAnnotation] = useState(false)
    const dragCounterRef = useRef(0)

    const addEffect = useProjectStore((s) => s.addEffect)
    const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer)
    const startEditingOverlay = useProjectStore((s) => s.startEditingOverlay)

    const calculateDropPosition = useCallback((e: React.DragEvent): Point => {
        const container = aspectContainerRef.current
        if (!container) return { x: 50, y: 50 }

        const rect = container.getBoundingClientRect()
        const containerX = e.clientX - rect.left
        const containerY = e.clientY - rect.top

        // Convert container coordinates to video-local coordinates
        const videoPoint = containerPointToVideoPoint({ x: containerX, y: containerY }, snapshot)

        // Convert to percent within the video frame (supports mockups).
        const videoRect = getVideoRectFromSnapshot(snapshot)
        const percentX = videoRect.width > 0 ? (videoPoint.x / videoRect.width) * 100 : 50
        const percentY = videoRect.height > 0 ? (videoPoint.y / videoRect.height) * 100 : 50

        return {
            x: percentX,
            y: percentY
        }
    }, [aspectContainerRef, snapshot])

    const createAnnotationAtPosition = useCallback((type: AnnotationType, position: Point) => {
        const effect = EffectCreation.createAnnotationEffect(type, { startTime: currentTime, position })

        if (CommandExecutor.isInitialized()) {
            void CommandExecutor.getInstance().execute(AddEffectCommand, effect)
        } else {
            addEffect(effect)
        }
        selectEffectLayer(EffectLayerType.Annotation, effect.id)
        startEditingOverlay(effect.id)

        return effect
    }, [currentTime, addEffect, selectEffectLayer, startEditingOverlay])

    const onDragOver = useCallback((e: React.DragEvent) => {
        // Only handle annotation type drags
        if (!e.dataTransfer.types.includes(ANNOTATION_DRAG_TYPE)) return

        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
    }, [])

    const onDragEnter = useCallback((e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(ANNOTATION_DRAG_TYPE)) return

        dragCounterRef.current++
        if (dragCounterRef.current === 1) {
            setIsDraggingAnnotation(true)
        }
    }, [])

    const onDragLeave = useCallback((e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(ANNOTATION_DRAG_TYPE)) return

        dragCounterRef.current--
        if (dragCounterRef.current === 0) {
            setIsDraggingAnnotation(false)
        }
    }, [])

    const onDrop = useCallback((e: React.DragEvent) => {
        const annotationType = e.dataTransfer.getData(ANNOTATION_DRAG_TYPE)
        if (!annotationType) return

        e.preventDefault()
        dragCounterRef.current = 0
        setIsDraggingAnnotation(false)

        const position = calculateDropPosition(e)
        createAnnotationAtPosition(annotationType as AnnotationType, position)
    }, [calculateDropPosition, createAnnotationAtPosition])

    return {
        handlers: {
            onDragOver,
            onDragEnter,
            onDragLeave,
            onDrop
        },
        isDraggingAnnotation
    }
}
