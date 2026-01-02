'use client'

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { useProjectStore } from '@/features/stores/project-store'
import type { TimelineMetadata } from '@/features/timeline/hooks/use-timeline-metadata'
import { useCanvasDrag, type DragType, type CanvasDragDelta } from '@/features/editor/hooks/use-canvas-drag'
import { hitTestEffects, type HandlePosition } from '@/features/editor/logic/hit-testing'
import {
    deltaToPercent,
    clampPosition,
    clampPoint,
    getElementBounds,
    pixelsToPercent,
    type CameraTransform
} from '@/features/canvas/math/coordinates'
import type { FrameSnapshot } from '@/features/renderer/engine/layout-engine'
import { EffectType, AnnotationType, type Project, type Effect, type AnnotationData } from '@/types/project'
import { type AnnotationRenderContext } from '@/features/renderer/compositions/layers/annotation-elements'
import { useAnnotationEditContext } from '@/features/editor/context/AnnotationEditContext'

/**
 * Calculate rotation angle from drag position relative to center
 */
function calculateRotationFromDrag(
    centerX: number,
    centerY: number,
    startX: number,
    startY: number,
    currentX: number,
    currentY: number,
    initialRotation: number,
    shiftKey: boolean
): number {
    const startAngle = Math.atan2(startY - centerY, startX - centerX)
    const currentAngle = Math.atan2(currentY - centerY, currentX - centerX)
    const deltaAngle = (currentAngle - startAngle) * (180 / Math.PI)
    let newRotation = (initialRotation + deltaAngle + 360) % 360

    // Snap to 15-degree increments when Shift is held
    if (shiftKey) {
        newRotation = Math.round(newRotation / 15) * 15
    }

    return newRotation
}

// Types
export type InteractionMode = 'IDLE' | 'DRAGGING' | 'RESIZING' | 'ROTATING' | 'EDITING'

interface InteractionLayerProps {
    project: Project
    effects: Effect[]
    snapshot: FrameSnapshot
    timelineMetadata: TimelineMetadata
    currentTimeMs: number
}

export const InteractionLayer: React.FC<InteractionLayerProps> = ({
    project,
    effects,
    snapshot,
    timelineMetadata,
    currentTimeMs
}) => {
    // --- Stores & Context ---
    const overlayRef = useRef<HTMLDivElement>(null)

    // Store Access (selection only - NOT transient state)
    const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer)
    const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer)
    const clearEffectSelection = useProjectStore((s) => s.clearEffectSelection)
    const startEditingOverlay = useProjectStore((s) => s.startEditingOverlay)
    const stopEditingOverlay = useProjectStore((s) => s.stopEditingOverlay)
    const updateEffect = useProjectStore((s) => s.updateEffect)

    // SSOT: Use isolated annotation editing context for transient state
    // This ensures video rendering is never affected by annotation drag/resize
    // isInlineEditing is now in context so preview-interactions can override camera zoom
    const { transientState, setTransientState, isInlineEditing, setIsInlineEditing } = useAnnotationEditContext()

    // --- State ---
    const [mode, setMode] = useState<InteractionMode>('IDLE')
    const shiftKeyRef = useRef(false)

    // Track Shift key for rotation snapping
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') shiftKeyRef.current = true
        }
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') shiftKeyRef.current = false
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [])

    // --- Derived ---
    const videoRect = useMemo(() => ({
        x: snapshot.layout.offsetX,
        y: snapshot.layout.offsetY,
        width: snapshot.layout.drawWidth,
        height: snapshot.layout.drawHeight,
    }), [snapshot.layout])

    const selectedEffect = useMemo(() => {
        if (!selectedEffectLayer) return null
        const effect = effects.find((e: Effect) => e.id === selectedEffectLayer.id)
        if (!effect) return null

        // Merge transient state if applicable
        if (transientState && transientState.id === effect.id) {
            return {
                ...effect,
                data: { ...effect.data, ...(transientState.data as Partial<AnnotationData>) },
            } as Effect
        }
        return effect
    }, [selectedEffectLayer, effects, transientState])

    const canInteract = !isInlineEditing

    // Force mode reset if selection cleared externally
    useEffect(() => {
        if (!selectedEffectLayer && (mode === 'DRAGGING' || mode === 'RESIZING')) {
            setMode('IDLE')
        }
    }, [selectedEffectLayer, mode])

    // Filter Interactable Effects (Visible at current time)
    const interactableEffects = useMemo(() => {
        return effects.filter((effect: Effect) => {
            if (effect.enabled === false) return false
            // Global effects might not have start/end? Assuming all Effects do.
            return currentTimeMs >= effect.startTime && currentTimeMs <= effect.endTime
        }).map((effect: Effect) => {
            // Apply transient state
            if (transientState && transientState.id === effect.id) {
                // Shallow merge data
                if (effect.type === EffectType.Annotation) {
                    return {
                        ...effect,
                        data: { ...effect.data, ...(transientState.data as Partial<AnnotationData>) }
                    }
                } else if (effect.type === EffectType.Plugin) {
                    return {
                        ...effect,
                        data: { ...effect.data, ...transientState.data }
                    }
                }
            }
            return effect
        })
    }, [effects, currentTimeMs, transientState])

    // Extract camera transform from snapshot
    const cameraTransform: CameraTransform | null = useMemo(() => {
        if (!snapshot.camera.zoomTransform) return null
        // Cast to any to access properties safely until type is strict
        const zt = snapshot.camera.zoomTransform as any
        if (zt.scale === 1 && zt.panX === 0 && zt.panY === 0) return null
        return {
            scale: zt.scale ?? 1,
            panX: zt.panX ?? 0,
            panY: zt.panY ?? 0
        }
    }, [snapshot.camera.zoomTransform])

    const renderContext = useMemo<AnnotationRenderContext>(() => {
        // Calculate scale relative to original project dimensions
        const originalWidth = timelineMetadata.width || 1920
        const scale = videoRect.width / originalWidth

        return {
            videoWidth: videoRect.width,
            videoHeight: videoRect.height,
            offsetX: videoRect.x,
            offsetY: videoRect.y,
            scale,
            cameraTransform: cameraTransform ?? undefined
        }
    }, [videoRect, timelineMetadata, cameraTransform])

    // --- Helpers ---
    const pendingUpdateRef = useRef<any>(null)

    // --- Drag Handlers (Defined BEFORE useCanvasDrag) ---

    const onDrag = useCallback((delta: CanvasDragDelta, type: DragType, initial: any) => {
        // Handle visual updates (Transient State)
        if (!selectedEffect || !initial) return
        if (!initial.data) return

        // IMPORTANT: Adjust delta by camera scale for correct drag behavior when zoomed
        // When zoomed in 2x, a 10px mouse movement should move the annotation 5px in source space
        const cameraScale = cameraTransform?.scale ?? 1
        const adjustedDelta = {
            x: delta.x / cameraScale,
            y: delta.y / cameraScale
        }
        const percentDelta = deltaToPercent(adjustedDelta.x, adjustedDelta.y, videoRect)
        let newData: any = null

        if (initial.kind === 'annotation') {
            const base = initial.data

            if (type === 'move') {
                const pos = base.position || { x: 50, y: 50 }
                const next = clampPoint({
                    x: pos.x + percentDelta.x,
                    y: pos.y + percentDelta.y
                })

                if (base.type === AnnotationType.Arrow && base.endPosition) {
                    const end = base.endPosition
                    newData = {
                        position: next,
                        endPosition: clampPoint({
                            x: end.x + percentDelta.x,
                            y: end.y + percentDelta.y
                        })
                    }
                } else {
                    newData = { position: next }
                }
            } else if (type === 'rotate') {
                // Rotation drag - calculate angle from center to current mouse position
                // initial.rotateCenter has the annotation center in screen pixels
                // initial.startPos has the starting mouse position
                // delta gives us the offset from startPos
                if (initial.rotateCenter && initial.startPos) {
                    const currentX = initial.startPos.x + delta.x
                    const currentY = initial.startPos.y + delta.y
                    const initialRotation = base.rotation ?? 0

                    const newRotation = calculateRotationFromDrag(
                        initial.rotateCenter.x,
                        initial.rotateCenter.y,
                        initial.startPos.x,
                        initial.startPos.y,
                        currentX,
                        currentY,
                        initialRotation,
                        shiftKeyRef.current // 15-degree snap when Shift held
                    )

                    newData = { rotation: newRotation }
                }
            } else {
                // Resize Annotation
                const safeWidth = base.width ?? 20
                const safeHeight = base.height ?? 10

                if (base.type === AnnotationType.Highlight) {
                    // Highlight is Top-Left anchored
                    // We need to handle this like a standard rect resize
                    let newPos = { ...base.position, width: safeWidth, height: safeHeight }

                    // Convert everything to percent delta
                    const dX = percentDelta.x
                    const dY = percentDelta.y

                    switch (type as HandlePosition) {
                        case 'bottom-right':
                            newPos.width += dX
                            newPos.height += dY
                            break
                        case 'bottom-left':
                            newPos.x += dX
                            newPos.width -= dX
                            newPos.height += dY
                            break
                        case 'top-right':
                            newPos.y += dY
                            newPos.width += dX
                            newPos.height -= dY
                            break
                        case 'top-left':
                            newPos.x += dX
                            newPos.y += dY
                            newPos.width -= dX
                            newPos.height -= dY
                            break
                        case 'top':
                            newPos.y += dY
                            newPos.height -= dY
                            break
                        case 'bottom':
                            newPos.height += dY
                            break
                        case 'left':
                            newPos.x += dX
                            newPos.width -= dX
                            break
                        case 'right':
                            newPos.width += dX
                            break
                    }

                    // Clamp dimensions to minimums
                    newPos.width = Math.max(1, newPos.width)
                    newPos.height = Math.max(1, newPos.height)

                    newData = {
                        position: { x: newPos.x, y: newPos.y },
                        width: newPos.width,
                        height: newPos.height
                    }
                } else if (base.type === AnnotationType.Arrow) {
                    // Arrow Resize: Actually just moving endpoints?
                    // Usually users want to drag endpoints.
                    // Since Arrow "handles" hit test is generic box, let's just 
                    // allow "Scale" via box resize for now, but really we should enable endpoint dragging.
                    // Currently leaving as placeholder to avoid breaking it, but prevent crash.
                } else {
                    // Text / Keyboard (Center Anchored)
                    const initialFontSize = base.style?.fontSize ?? 18

                    const RESIZE_DIRS: Record<string, { x: number, y: number }> = {
                        'top-left': { x: -1, y: -1 },
                        'top': { x: 0, y: -1 },
                        'top-right': { x: 1, y: -1 },
                        'right': { x: 1, y: 0 },
                        'bottom-right': { x: 1, y: 1 },
                        'bottom': { x: 0, y: 1 },
                        'bottom-left': { x: -1, y: 1 },
                        'left': { x: -1, y: 0 }
                    }

                    const dir = RESIZE_DIRS[type] || { x: 0, y: 0 }
                    const isSideHandle = dir.y === 0 && dir.x !== 0

                    if (isSideHandle) {
                        // WIDTH RESIZE
                        const currentWidthPx = (safeWidth / 100) * videoRect.width
                        const deltaPx = delta.x * (type === 'left' ? -1 : 1)
                        const newWidthPx = Math.max(40, currentWidthPx + deltaPx)

                        const newWidthPercent = (newWidthPx / videoRect.width) * 100
                        const newXPercent = type === 'left' ? base.position!.x + percentDelta.x : base.position!.x

                        newData = {
                            position: { ...base.position, x: newXPercent },
                            width: newWidthPercent
                        }
                    } else {
                        // FONT SCALE
                        let deltaH = 0
                        if (dir.y !== 0) {
                            deltaH = percentDelta.y * dir.y
                        }

                        const pixelHeight = (safeHeight / 100) * videoRect.height
                        const pixelDelta = (deltaH / 100) * videoRect.height

                        if (pixelHeight + pixelDelta >= 10) {
                            const ratio = (pixelHeight + pixelDelta) / pixelHeight
                            const newFontSize = Math.max(8, Math.min(300, initialFontSize * ratio))
                            newData = {
                                style: { ...base.style, fontSize: newFontSize }
                            }
                        }
                    }
                }
            }
        } else if (initial.kind === 'plugin') {
            if (type === 'move') {
                newData = {
                    position: {
                        x: clampPoint({ x: initial.data.x + percentDelta.x, y: initial.data.y + percentDelta.y }).x,
                        y: clampPoint({ x: initial.data.x + percentDelta.x, y: initial.data.y + percentDelta.y }).y,
                        width: initial.data.width,
                        height: initial.data.height
                    }
                }
            } else {
                let newPos = { ...initial.data }
                switch (type as HandlePosition) {
                    case 'bottom-right':
                        newPos.width += percentDelta.x
                        newPos.height += percentDelta.y
                        break
                    case 'bottom-left':
                        newPos.x += percentDelta.x
                        newPos.width -= percentDelta.x
                        newPos.height += percentDelta.y
                        break
                    case 'top-right':
                        newPos.y += percentDelta.y
                        newPos.width += percentDelta.x
                        newPos.height -= percentDelta.y
                        break
                    case 'top-left':
                        newPos.x += percentDelta.x
                        newPos.y += percentDelta.y
                        newPos.width -= percentDelta.x
                        newPos.height -= percentDelta.y
                        break
                }
                newData = { position: clampPosition(newPos) }
            }
        }

        if (newData) {
            pendingUpdateRef.current = newData
            setTransientState(selectedEffect.id, newData)
        }

    }, [selectedEffect, videoRect, setTransientState, cameraTransform])

    const onDragEnd = useCallback(() => {
        setMode('IDLE')
        if (pendingUpdateRef.current && selectedEffectLayer?.id) {
            updateEffect(selectedEffectLayer.id, { data: pendingUpdateRef.current })
            pendingUpdateRef.current = null
        }
        setTransientState(null)
    }, [selectedEffectLayer, updateEffect, setTransientState])

    // --- Hook Usage (Must be after handlers) --- 
    const { startDrag } = useCanvasDrag({
        onDrag,
        onDragEnd
    })

    // --- Pointer Handler (Uses startDrag) ---

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!canInteract) return
        if (e.button !== 0) return

        // Hit Test
        const rect = overlayRef.current?.getBoundingClientRect()
        if (!rect) return
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const hit = hitTestEffects(
            mouseX,
            mouseY,
            interactableEffects,
            snapshot,
            selectedEffect?.id
        )

        if (hit) {
            e.stopPropagation() // Vital: Stop bubbling to background

            // Select it
            if (selectedEffect?.id !== hit.effectId) {
                const effect = effects.find((e: Effect) => e.id === hit.effectId)
                if (effect) {
                    const layerType = effect.type === EffectType.Annotation
                        ? 'annotation'
                        : 'plugin'

                    selectEffectLayer(layerType as any, hit.effectId)
                    startEditingOverlay(hit.effectId)
                }
            }

            const effect = effects.find((e: Effect) => e.id === hit.effectId)

            if (effect) {
                // Start Drag/Resize/Rotate
                if (hit.hitType === 'handle') {
                    if (hit.handlePosition === 'rotate' && effect.type === EffectType.Annotation) {
                        // Rotation handle - need to calculate center position
                        setMode('ROTATING')
                        const data = effect.data as AnnotationData
                        const pos = data.position ?? { x: 50, y: 50 }

                        // Calculate the ACTUAL center based on annotation type
                        // Highlight is top-left anchored, so center is pos + size/2
                        // Text/Keyboard are center-anchored, so pos IS the center
                        let annotationCenterPercent = { x: pos.x, y: pos.y }

                        if (data.type === AnnotationType.Highlight) {
                            annotationCenterPercent = {
                                x: pos.x + (data.width ?? 20) / 2,
                                y: pos.y + (data.height ?? 10) / 2
                            }
                        } else if (data.type === AnnotationType.Arrow) {
                            // Arrow center is midpoint between start and end
                            const endPos = data.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }
                            annotationCenterPercent = {
                                x: (pos.x + endPos.x) / 2,
                                y: (pos.y + endPos.y) / 2
                            }
                        }

                        // Convert to screen pixels
                        let centerX = videoRect.x + (annotationCenterPercent.x / 100) * videoRect.width
                        let centerY = videoRect.y + (annotationCenterPercent.y / 100) * videoRect.height

                        // Apply camera transform if zoomed
                        if (cameraTransform && cameraTransform.scale !== 1) {
                            const videoCenterX = videoRect.x + videoRect.width / 2
                            const videoCenterY = videoRect.y + videoRect.height / 2
                            centerX = videoCenterX + (centerX - videoCenterX) * cameraTransform.scale + cameraTransform.panX
                            centerY = videoCenterY + (centerY - videoCenterY) * cameraTransform.scale + cameraTransform.panY
                        }

                        startDrag(e, 'rotate', {
                            kind: 'annotation',
                            data: { ...data },
                            rotateCenter: { x: centerX, y: centerY },
                            startPos: { x: mouseX, y: mouseY }
                        })
                    } else {
                        setMode('RESIZING')
                        if (effect.type === EffectType.Annotation) {
                            const data = effect.data as any
                            startDrag(e, hit.handlePosition!, {
                                kind: 'annotation',
                                data: { ...data } // Copy data
                            })
                        } else if (effect.type === EffectType.Plugin) {
                            const data = effect.data as any
                            startDrag(e, hit.handlePosition!, {
                                kind: 'plugin',
                                data: { ...data.position }
                            })
                        }
                    }
                } else {
                    setMode('DRAGGING')
                    if (effect.type === EffectType.Annotation) {
                        // Pass distinct type for anchor handling if needed
                        startDrag(e, 'move', { kind: 'annotation', data: effect.data })
                    } else {
                        startDrag(e, 'move', { kind: 'plugin', data: (effect.data as any).position })
                    }
                }
            }

        } else {
            // Clicked empty space = Deselect
            clearEffectSelection()
            stopEditingOverlay()
            setMode('IDLE')
        }

    }, [effects, videoRect, selectedEffect, canInteract, selectEffectLayer, startEditingOverlay, clearEffectSelection, stopEditingOverlay, renderContext.scale, startDrag])

    // Click handler - stops propagation when annotation/plugin is hit
    // This prevents PreviewInteractions from duplicating selection handling
    // Allows double-click to work properly for text editing
    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!canInteract) return

        const rect = overlayRef.current?.getBoundingClientRect()
        if (!rect) return
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const hit = hitTestEffects(
            mouseX,
            mouseY,
            interactableEffects,
            snapshot,
            selectedEffect?.id ?? null
        )

        if (hit) {
            // Stop propagation to prevent PreviewInteractions from handling
            // This allows double-click to enter edit mode without interference
            e.stopPropagation()
        }
    }, [canInteract, interactableEffects, snapshot, selectedEffect?.id])

    // Double Click -> Edit
    // IMPORTANT: Perform fresh hit-test so double-click works on unselected annotations
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        const rect = overlayRef.current?.getBoundingClientRect()
        if (!rect) return
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const hit = hitTestEffects(
            mouseX, mouseY, interactableEffects, snapshot,
            selectedEffect?.id ?? null
        )

        if (hit) {
            const effect = effects.find((eff: Effect) => eff.id === hit.effectId)
            if (effect?.type === EffectType.Annotation) {
                const data = effect.data as any
                if (data.type === AnnotationType.Text || data.type === AnnotationType.Keyboard) {
                    // Select if not already selected
                    if (selectedEffect?.id !== hit.effectId) {
                        selectEffectLayer('annotation' as any, hit.effectId)
                        startEditingOverlay(hit.effectId)
                    }
                    setIsInlineEditing(true)
                    setMode('EDITING')
                    e.stopPropagation()
                    e.preventDefault()
                }
            }
        }
    }, [selectedEffect, effects, interactableEffects, snapshot, selectEffectLayer, startEditingOverlay, setIsInlineEditing])


    return (
        <div
            ref={overlayRef}
            className="absolute inset-0 z-50 outline-none"
            onPointerDown={handlePointerDown}
            onClick={handleClick} // Stop propagation when annotation is hit
            onDoubleClick={handleDoubleClick}
            style={{
                // Let events pass through when editing - contentEditable handles input
                pointerEvents: isInlineEditing ? 'none' : 'auto'
            }}
        >
            {/* Annotations, selection overlay, and editing are all handled inside AnnotationLayer */}
            {/* InteractionLayer only provides hit-testing and event handling */}
        </div>
    )
}
