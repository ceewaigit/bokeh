/**
 * useAnnotationDrop
 *
 * Handles drag-and-drop of annotation types onto the preview canvas.
 * Converts drop coordinates to video-local percent positions.
 */

import { useCallback, useState, useRef } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { EffectType, type Effect, type AnnotationData } from '@/types/project'
import { AnnotationType } from '@/types/project'
import { getDefaultAnnotationSize } from '../config'
import { EffectLayerType } from '@/features/effects/types'
import {
    containerPointToVideoPoint,
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

        // Convert to percent (0-100)
        const videoRect = snapshot.layout
        const percentX = (videoPoint.x / videoRect.drawWidth) * 100
        const percentY = (videoPoint.y / videoRect.drawHeight) * 100

        // Clamp to valid range
        return {
            x: Math.max(5, Math.min(95, percentX)),
            y: Math.max(5, Math.min(95, percentY))
        }
    }, [aspectContainerRef, snapshot])

    const createAnnotationAtPosition = useCallback((type: AnnotationType, position: Point) => {
        const startTime = currentTime
        const endTime = startTime + 3000 // 3 second default duration
        const defaultSize = getDefaultAnnotationSize(type)

        // Adjust position for top-left anchored elements (Highlight, Redaction, Blur)
        // These need to be offset by half width/height so the center lands at cursor
        const isTopLeftAnchor = type === AnnotationType.Highlight ||
            type === AnnotationType.Redaction ||
            type === AnnotationType.Blur

        let finalPosition = position
        if (isTopLeftAnchor && defaultSize.width && defaultSize.height) {
            // Offset so center of element is at cursor position
            finalPosition = {
                x: position.x - defaultSize.width / 2,
                y: position.y - defaultSize.height / 2
            }
        }
        // Arrow uses position directly as start point, which is correct

        const effect: Effect = {
            id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: EffectType.Annotation,
            startTime,
            endTime,
            enabled: true,
            data: {
                type,
                position: finalPosition,
                content: type === AnnotationType.Text ? 'New text' : undefined,
                endPosition: type === AnnotationType.Arrow
                    ? { x: Math.min(95, position.x + 10), y: position.y }
                    : undefined,
                width: defaultSize.width,
                height: defaultSize.height,
                style: {
                    color: type === AnnotationType.Highlight ? '#ffeb3b' : '#ffffff',
                    backgroundColor: type === AnnotationType.Redaction ? '#000000' : undefined,
                    fontSize: 18,
                    textAlign: type === AnnotationType.Text ? 'center' : undefined,
                    borderRadius: type === AnnotationType.Redaction ? 2 : undefined,
                },
            } satisfies AnnotationData,
        }

        addEffect(effect)
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
