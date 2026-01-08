/**
 * AnnotationDragPreview - Custom drag implementation for annotations
 * 
 * Uses mousedown/mousemove/mouseup instead of HTML5 drag for full control
 * over the drag preview appearance. Renders actual annotation components.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnnotationType } from '@/types/project'
import { DEFAULT_ANNOTATION_SIZES } from '../config'

interface DragState {
    type: AnnotationType
    x: number
    y: number
}

// Global state management for drag
let activeDrag: DragState | null = null
let dragListeners: Set<() => void> = new Set()

function notifyDragListeners() {
    dragListeners.forEach(fn => fn())
}

export function startAnnotationDrag(type: AnnotationType, x: number, y: number) {
    activeDrag = { type, x, y }
    notifyDragListeners()
}

export function updateAnnotationDrag(x: number, y: number) {
    if (activeDrag) {
        activeDrag = { ...activeDrag, x, y }
        notifyDragListeners()
    }
}

export function endAnnotationDrag(): DragState | null {
    const result = activeDrag
    activeDrag = null
    notifyDragListeners()
    return result
}

export function getActiveDrag(): DragState | null {
    return activeDrag
}

// Preview scale - matches roughly what a 20% width annotation looks like on screen
const PREVIEW_SCALE = 5

function getPreviewDimensions(type: AnnotationType) {
    const defaults = DEFAULT_ANNOTATION_SIZES[type]
    return {
        width: (defaults.width ?? 20) * PREVIEW_SCALE,
        height: (defaults.height ?? 12) * PREVIEW_SCALE,
    }
}

/**
 * Preview content - simplified versions of actual annotations
 * Uses same colors and proportions as the real render
 */
const PreviewContent: React.FC<{ type: AnnotationType }> = ({ type }) => {
    const dims = getPreviewDimensions(type)

    switch (type) {
        case AnnotationType.Redaction:
            return (
                <div
                    style={{
                        width: dims.width,
                        height: dims.height,
                        background: '#000000',
                        borderRadius: 2,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    }}
                />
            )

        case AnnotationType.Highlight:
            return (
                <div
                    style={{
                        width: dims.width,
                        height: dims.height,
                        border: '2px dashed rgba(255, 235, 59, 0.9)',
                        background: 'rgba(255, 235, 59, 0.2)',
                        borderRadius: 0,
                    }}
                />
            )

        case AnnotationType.Arrow:
            return (
                <svg
                    width={70}
                    height={24}
                    viewBox="0 0 70 24"
                    style={{ overflow: 'visible' }}
                >
                    <defs>
                        <marker
                            id="drag-arrow-marker"
                            markerWidth={10}
                            markerHeight={10}
                            refX={9}
                            refY={5}
                            orient="auto"
                        >
                            <polygon points="0,0 10,5 0,10" fill="#ff0000" />
                        </marker>
                    </defs>
                    <line
                        x1={5}
                        y1={12}
                        x2={55}
                        y2={12}
                        stroke="#ff0000"
                        strokeWidth={3}
                        strokeLinecap="round"
                        markerEnd="url(#drag-arrow-marker)"
                    />
                </svg>
            )

        case AnnotationType.Text:
        default:
            return (
                <div
                    style={{
                        fontSize: 18,
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
                        padding: '4px 8px',
                    }}
                >
                    New text
                </div>
            )
    }
}

/**
 * Portal component that renders the drag preview following mouse
 */
export const AnnotationDragPreview: React.FC = () => {
    const [, forceUpdate] = useState({})

    useEffect(() => {
        const update = () => forceUpdate({})
        dragListeners.add(update)
        return () => { dragListeners.delete(update) }
    }, [])

    const drag = activeDrag
    if (!drag) return null

    return createPortal(
        <div
            style={{
                position: 'fixed',
                left: drag.x,
                top: drag.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 99999,
                opacity: 0.85,
                cursor: 'grabbing',
            }}
        >
            <PreviewContent type={drag.type} />
        </div>,
        document.body
    )
}

/**
 * Hook for annotation drag source - uses custom mouse events instead of HTML5 drag
 */
export function useAnnotationDragSource(type: AnnotationType) {
    const isDraggingRef = useRef(false)

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Only left click
        if (e.button !== 0) return

        e.preventDefault()
        isDraggingRef.current = true
        startAnnotationDrag(type, e.clientX, e.clientY)

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (isDraggingRef.current) {
                updateAnnotationDrag(moveEvent.clientX, moveEvent.clientY)
            }
        }

        const handleMouseUp = (upEvent: MouseEvent) => {
            isDraggingRef.current = false
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''

            // Dispatch custom event with drop coordinates
            const drag = endAnnotationDrag()
            if (drag) {
                window.dispatchEvent(new CustomEvent('annotation-drop', {
                    detail: { type: drag.type, x: upEvent.clientX, y: upEvent.clientY }
                }))
            }
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
    }, [type])

    return {
        onMouseDown: handleMouseDown,
        style: { cursor: 'grab' } as const,
    }
}

/**
 * Hook for drop target - listens for custom annotation-drop events
 */
export function useAnnotationDropTarget(
    containerRef: React.RefObject<HTMLElement | null>,
    onDrop: (type: AnnotationType, x: number, y: number) => void
) {
    useEffect(() => {
        const handleDrop = (e: CustomEvent<{ type: AnnotationType; x: number; y: number }>) => {
            const container = containerRef.current
            if (!container) return

            const rect = container.getBoundingClientRect()
            const { type, x, y } = e.detail

            // Check if drop is within container
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                onDrop(type, x - rect.left, y - rect.top)
            }
        }

        window.addEventListener('annotation-drop', handleDrop as EventListener)
        return () => window.removeEventListener('annotation-drop', handleDrop as EventListener)
    }, [containerRef, onDrop])
}
