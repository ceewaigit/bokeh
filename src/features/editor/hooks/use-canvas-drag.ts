/**
 * useCanvasDrag - Reusable canvas drag/resize hook
 *
 * Consolidates the window-level mouse event handling pattern shared by:
 * - OverlayEditor (overlay positioning)
 * - CropEditingLayer (crop region)
 * - CropOverlay (legacy crop)
 *
 * Usage:
 *   const { isDragging, dragType, startDrag, dragDelta, initialValue } = useCanvasDrag<MyData>({
 *     onDrag: (delta, type, initial) => { ... },
 *     onDragEnd: () => { ... },
 *   })
 *   
 *   // Start drag with initial data
 *   startDrag({ startX: e.clientX, startY: e.clientY, type: 'move', initialValue: { x: 50, y: 50 } })
 */

import { useState, useCallback, useEffect, useRef } from 'react'

export type HandlePosition =
    | 'top-left'
    | 'top'
    | 'top-right'
    | 'right'
    | 'bottom-right'
    | 'bottom'
    | 'bottom-left'
    | 'left'

export type DragType = 'move' | 'rotate' | HandlePosition

export interface CanvasDragDelta {
    /** Raw pixel delta from drag start */
    x: number
    y: number
}

export interface UseCanvasDragOptions<T = unknown> {
    /** Called on each mousemove with delta from start and initial value */
    onDrag?: (delta: CanvasDragDelta, type: DragType, initialValue: T | null) => void
    /** Called when drag ends (mouseup) */
    onDragEnd?: () => void
}

export interface UseCanvasDragReturn<T = unknown> {
    /** Whether currently dragging */
    isDragging: boolean
    /** Current drag type (move or resize handle) */
    dragType: DragType | null
    /** Start a drag operation with optional initial value */
    startDrag: (options: {
        startX: number
        startY: number
        type: DragType
        initialValue?: T
        /** Minimum movement in pixels before drag activates (prevents click-vs-drag conflicts). */
        activationDistance?: number
    }) => void
    /** Current drag delta from start (pixels) */
    dragDelta: CanvasDragDelta
    /** Initial value passed when drag started */
    initialValue: T | null
}

export function useCanvasDrag<T = unknown>(
    options: UseCanvasDragOptions<T> = {}
): UseCanvasDragReturn<T> {
    const { onDrag, onDragEnd } = options

    const [isDragging, setIsDragging] = useState(false)
    const [isPending, setIsPending] = useState(false)
    const [dragType, setDragType] = useState<DragType | null>(null)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [dragDelta, setDragDelta] = useState<CanvasDragDelta>({ x: 0, y: 0 })
    const [initialValue, setInitialValue] = useState<T | null>(null)
    const activationDistanceRef = useRef(0)
    const didDragRef = useRef(false)

    // Refs for stable callbacks
    const onDragRef = useRef(onDrag)
    const onDragEndRef = useRef(onDragEnd)
    const initialValueRef = useRef<T | null>(null)
    onDragRef.current = onDrag
    onDragEndRef.current = onDragEnd

    const handleMouseMove = useCallback(
        (e: PointerEvent) => {
            const delta = {
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y,
            }

            // Pending -> Dragging threshold
            let draggingNow = isDragging
            if (isPending) {
                const dist = Math.hypot(delta.x, delta.y)
                if (dist < activationDistanceRef.current) {
                    return
                }
                setIsPending(false)
                setIsDragging(true)
                didDragRef.current = true
                // Prevent text selection once drag activates
                e.preventDefault?.()
                draggingNow = true
            }

            if (!draggingNow) return

            setDragDelta(delta)
            if (onDragRef.current && dragType) {
                onDragRef.current(delta, dragType, initialValueRef.current)
            }
        },
        [dragStart.x, dragStart.y, dragType, isPending, isDragging]
    )

    const handleMouseUp = useCallback(() => {
        if (!isDragging && !isPending) return
        const didDrag = didDragRef.current
        setIsDragging(false)
        setIsPending(false)
        setDragType(null)
        setDragDelta({ x: 0, y: 0 })
        setInitialValue(null)
        initialValueRef.current = null
        didDragRef.current = false
        if (didDrag) {
            onDragEndRef.current?.()
        }
    }, [isDragging, isPending])

    // Global mouse event listeners
    useEffect(() => {
        if (isDragging || isPending) {
            window.addEventListener('pointermove', handleMouseMove)
            window.addEventListener('pointerup', handleMouseUp)
            return () => {
                window.removeEventListener('pointermove', handleMouseMove)
                window.removeEventListener('pointerup', handleMouseUp)
            }
        }
    }, [isDragging, isPending, handleMouseMove, handleMouseUp])

    const startDrag = useCallback((params: {
        startX: number
        startY: number
        type: DragType
        initialValue?: T
        activationDistance?: number
    }) => {
        const activationDistance = params.activationDistance ?? 0
        activationDistanceRef.current = Math.max(0, activationDistance)
        setIsPending(activationDistanceRef.current > 0)
        setIsDragging(activationDistanceRef.current === 0)
        didDragRef.current = activationDistanceRef.current === 0
        setDragType(params.type)
        setDragStart({ x: params.startX, y: params.startY })
        setDragDelta({ x: 0, y: 0 })
        const value = params.initialValue ?? null
        setInitialValue(value)
        initialValueRef.current = value
    }, [])

    return {
        isDragging,
        dragType,
        startDrag,
        dragDelta,
        initialValue,
    }
}

/**
 * Get cursor style for a given handle position
 */
export function getHandleCursorStyle(position: HandlePosition): string {
    switch (position) {
        case 'top-left':
        case 'bottom-right':
            return 'nwse-resize'
        case 'top-right':
        case 'bottom-left':
            return 'nesw-resize'
        case 'top':
        case 'bottom':
            return 'ns-resize'
        case 'left':
        case 'right':
            return 'ew-resize'
        default:
            return 'default'
    }
}

/**
 * Apply resize delta to a rect based on handle position
 */
export function applyResizeDelta(
    initial: { x: number; y: number; width: number; height: number },
    delta: { x: number; y: number },
    handle: HandlePosition
): { x: number; y: number; width: number; height: number } {
    const result = { ...initial }

    switch (handle) {
        case 'top-left':
            result.x = initial.x + delta.x
            result.y = initial.y + delta.y
            result.width = initial.width - delta.x
            result.height = initial.height - delta.y
            break
        case 'top':
            result.y = initial.y + delta.y
            result.height = initial.height - delta.y
            break
        case 'top-right':
            result.y = initial.y + delta.y
            result.width = initial.width + delta.x
            result.height = initial.height - delta.y
            break
        case 'right':
            result.width = initial.width + delta.x
            break
        case 'bottom-right':
            result.width = initial.width + delta.x
            result.height = initial.height + delta.y
            break
        case 'bottom':
            result.height = initial.height + delta.y
            break
        case 'bottom-left':
            result.x = initial.x + delta.x
            result.width = initial.width - delta.x
            result.height = initial.height + delta.y
            break
        case 'left':
            result.x = initial.x + delta.x
            result.width = initial.width - delta.x
            break
    }

    return result
}
