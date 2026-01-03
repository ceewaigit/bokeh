'use client'

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { useProjectStore } from '@/features/stores/project-store'
import { useWorkspaceStore } from '@/features/stores/workspace-store'
import { useCanvasDrag, type DragType, type CanvasDragDelta } from '@/features/editor/hooks/use-canvas-drag'
import { hitTestEffects, type HandlePosition } from '@/features/editor/logic/hit-testing'
import { hitTestAnnotationsFromPoint } from '@/features/editor/logic/dom-hit-testing'
import { SelectionOverlay, SELECTION_HANDLE_SIZE } from '@/features/editor/components/SelectionOverlay'
import {
    deltaToPercent,
    clampPosition,
    clampPoint,
    type CameraTransform
} from '@/features/canvas/math/coordinates'
import {
    containerPointToVideoPoint,
    getVideoRectFromSnapshot,
    percentToVideoPoint,
    videoDeltaToPercentDelta,
    videoPointToContainerPoint,
    type Point
} from '@/features/editor/logic/preview-point-transforms'
import type { FrameSnapshot } from '@/features/renderer/engine/layout-engine'
import { EffectType, AnnotationType, type Effect, type AnnotationData } from '@/types/project'
import { useAnnotationEditContext } from '@/features/editor/context/AnnotationEditContext'
import { SidebarTabId } from '@/features/effects/components/constants'

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

function getCursorForHandle(handle: HandlePosition): string {
    switch (handle) {
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
        case 'rotate':
            return 'grab'
        default:
            return 'default'
    }
}

// Types
export type InteractionMode = 'IDLE' | 'DRAGGING' | 'RESIZING' | 'ROTATING' | 'EDITING'

interface InteractionLayerProps {
    effects: Effect[]
    snapshot: FrameSnapshot
    currentTimeMs: number
}

interface SelectionBounds {
    x: number
    y: number
    width: number
    height: number
}

interface ClipRect {
    x: number
    y: number
    width: number
    height: number
}

export const InteractionLayer: React.FC<InteractionLayerProps> = ({
    effects,
    snapshot,
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
    const startInlineEditing = useProjectStore((s) => s.startInlineEditing)
    const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen)
    const toggleProperties = useWorkspaceStore((s) => s.toggleProperties)
    const setActiveSidebarTab = useWorkspaceStore((s) => s.setActiveSidebarTab)

    // SSOT: Use isolated annotation editing context for transient state
    // This ensures video rendering is never affected by annotation drag/resize
    // isInlineEditing is now in context so preview-interactions can override camera zoom
    const { transientState, setTransientState, isInlineEditing, setIsInlineEditing } = useAnnotationEditContext()

    // --- State ---
    const [mode, setMode] = useState<InteractionMode>('IDLE')
    const shiftKeyRef = useRef(false)
    const lastCursorRef = useRef<string>('default')
    const didJustDragRef = useRef(false) // Tracks if drag just ended to prevent click-after-drag from deselecting

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
    const videoRect = useMemo(() => getVideoRectFromSnapshot(snapshot), [snapshot])

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

    const selectedAnnotation = selectedEffect?.type === EffectType.Annotation ? selectedEffect : null
    const [selectionBounds, setSelectionBounds] = useState<SelectionBounds | null>(null)
    const [clipRect, setClipRect] = useState<ClipRect | null>(null)

    const updateSelectionBounds = useCallback(() => {
        const overlayEl = overlayRef.current
        if (!overlayEl || !selectedAnnotation) {
            setSelectionBounds(null)
            return
        }

        const candidates = Array.from(
            document.querySelectorAll<HTMLElement>(`[data-annotation-id="${selectedAnnotation.id}"]`)
        )
        const annotationEl = candidates.find((el) => !overlayEl.contains(el)) ?? candidates[0]
        if (!annotationEl) {
            setSelectionBounds(null)
            return
        }

        const contentEl =
            annotationEl.querySelector<HTMLElement>('[data-annotation-content="true"]') ?? annotationEl
        const overlayRect = overlayEl.getBoundingClientRect()
        const rect = contentEl.getBoundingClientRect()

        setSelectionBounds({
            x: rect.left - overlayRect.left,
            y: rect.top - overlayRect.top,
            width: rect.width,
            height: rect.height,
        })

        const videoEl = document.querySelector<HTMLElement>('[data-video-transform-container="true"]')
        if (videoEl) {
            const videoRect = videoEl.getBoundingClientRect()
            setClipRect({
                x: videoRect.left - overlayRect.left,
                y: videoRect.top - overlayRect.top,
                width: videoRect.width,
                height: videoRect.height,
            })
        } else {
            setClipRect(null)
        }
    }, [selectedAnnotation])

    useEffect(() => {
        if (!selectedAnnotation) {
            setSelectionBounds(null)
            return
        }

        let rafId = 0
        const tick = () => {
            updateSelectionBounds()
            rafId = window.requestAnimationFrame(tick)
        }

        rafId = window.requestAnimationFrame(tick)
        return () => window.cancelAnimationFrame(rafId)
    }, [selectedAnnotation, updateSelectionBounds])

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

    const interactablePlugins = useMemo(() => {
        return interactableEffects.filter((effect) => effect.type === EffectType.Plugin)
    }, [interactableEffects])

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

    // --- Helpers ---
    const pendingUpdateRef = useRef<any>(null)
    const setOverlayCursor = useCallback((next: string) => {
        const el = overlayRef.current
        if (!el) return
        if (lastCursorRef.current === next) return
        lastCursorRef.current = next
        el.style.cursor = next
    }, [])

    // --- Drag Handlers (Defined BEFORE useCanvasDrag) ---

    const onDrag = useCallback((delta: CanvasDragDelta, type: DragType, initial: any) => {
        if (mode === 'IDLE') {
            if (type === 'move') setMode('DRAGGING')
            else if (type === 'rotate') setMode('ROTATING')
            else setMode('RESIZING')
        }

        // Handle visual updates (Transient State)
        if (!selectedEffect || !initial) return
        if (!initial.data) return

        let videoDeltaPx: Point = { x: delta.x, y: delta.y }
        let percentDelta: Point = { x: 0, y: 0 }

        // For annotations (rendered inside the transformed video container), convert pointer movement
        // into untransformed video-local deltas by inverting the renderer's combined transform.
        if (initial.kind === 'annotation' && initial.startContainer && initial.startVideoPoint) {
            const startContainer = initial.startContainer as Point
            const startVideoPoint = initial.startVideoPoint as Point
            const currentContainer: Point = {
                x: startContainer.x + delta.x,
                y: startContainer.y + delta.y
            }

            const currentVideoPoint = containerPointToVideoPoint(currentContainer, snapshot)
            videoDeltaPx = {
                x: currentVideoPoint.x - startVideoPoint.x,
                y: currentVideoPoint.y - startVideoPoint.y
            }
            percentDelta = videoDeltaToPercentDelta(videoDeltaPx, snapshot)
        } else {
            // Plugins use legacy math hit-testing/drag behavior for now.
            // IMPORTANT: Adjust delta by camera scale for correct behavior when zoomed.
            const cameraScale = cameraTransform?.scale ?? 1
            const adjustedDelta = {
                x: delta.x / cameraScale,
                y: delta.y / cameraScale
            }
            videoDeltaPx = adjustedDelta
            percentDelta = deltaToPercent(adjustedDelta.x, adjustedDelta.y, videoRect)
        }
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

                if (base.type === AnnotationType.Highlight || base.type === AnnotationType.Blur) {
                    // Highlight/Blur are Top-Left anchored
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
                    const isCornerHandle = dir.x !== 0 && dir.y !== 0

                    const basePosition = base.position ?? { x: 50, y: 50 }
                    const startBounds = (initial as any).startBounds as { width: number; height: number } | null | undefined
                    const fallbackWidthPx = Math.max(60, startBounds?.width ?? initialFontSize * 6)
                    const fallbackHeightPx = Math.max(16, startBounds?.height ?? initialFontSize * 1.4)

                    if (isSideHandle) {
                        // WIDTH RESIZE
                        const currentWidthPx =
                            typeof base.width === 'number' ? (base.width / 100) * videoRect.width : fallbackWidthPx
                        const edgeDeltaPx = videoDeltaPx.x
                        const newWidthPx = Math.max(40, currentWidthPx + edgeDeltaPx * dir.x)

                        const newWidthPercent = (newWidthPx / videoRect.width) * 100
                        // Text is center-anchored: edge drags shift center by half the edge movement.
                        const nextCenter = clampPoint({
                            x: basePosition.x + percentDelta.x / 2,
                            y: basePosition.y
                        })

                        newData = {
                            position: { ...basePosition, x: nextCenter.x },
                            width: newWidthPercent
                        }
                    } else {
                        // FONT SCALE (Canva-like): corners scale text; top/bottom also scale font size.
                        const basisPx = fallbackHeightPx
                        const deltaPx = isCornerHandle
                            ? (videoDeltaPx.x * dir.x + videoDeltaPx.y * dir.y) / Math.sqrt(2)
                            : videoDeltaPx.y * dir.y

                        if (basisPx + deltaPx >= 10) {
                            const ratio = (basisPx + deltaPx) / basisPx
                            const newFontSize = Math.max(8, Math.min(300, initialFontSize * ratio))

                            const maybeWidth =
                                isCornerHandle
                                    ? (() => {
                                        const currentWidthPx =
                                            typeof base.width === 'number'
                                                ? (base.width / 100) * videoRect.width
                                                : fallbackWidthPx
                                        const newWidthPx = Math.max(40, currentWidthPx * ratio)
                                        return { width: (newWidthPx / videoRect.width) * 100 }
                                    })()
                                    : null

                            newData = {
                                ...(maybeWidth ?? null),
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

    }, [mode, selectedEffect, snapshot, videoRect, setTransientState, cameraTransform])

    const onDragEnd = useCallback(() => {
        setMode('IDLE')
        if (pendingUpdateRef.current && selectedEffectLayer?.id) {
            updateEffect(selectedEffectLayer.id, { data: pendingUpdateRef.current })
            pendingUpdateRef.current = null
        }
        setTransientState(null)
        // Mark that drag just ended - prevents click event from deselecting the annotation
        didJustDragRef.current = true
        requestAnimationFrame(() => {
            didJustDragRef.current = false
        })
    }, [selectedEffectLayer, updateEffect, setTransientState])

    // --- Hook Usage (Must be after handlers) --- 
    const { startDrag } = useCanvasDrag({
        onDrag,
        onDragEnd
    })

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!canInteract) return

        // Keep cursor stable during active gestures.
        if (mode === 'DRAGGING') {
            setOverlayCursor('grabbing')
            return
        }
        if (mode === 'ROTATING') {
            setOverlayCursor('grabbing')
            return
        }

        const overlayElement = overlayRef.current
        if (!overlayElement) return

        const domHit = hitTestAnnotationsFromPoint(e.clientX, e.clientY, {
            ignoreElement: overlayElement
        })

        if (domHit?.kind === 'handle') {
            setOverlayCursor(getCursorForHandle(domHit.handle))
            return
        }

        if (domHit?.kind === 'annotation') {
            setOverlayCursor('move')
            return
        }

        // Plugin hover (legacy math hit test)
        const rect = overlayElement.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const hit = hitTestEffects(mouseX, mouseY, interactablePlugins, snapshot, selectedEffect?.id ?? null)

        if (hit?.hitType === 'handle' && hit.handlePosition) {
            setOverlayCursor(getCursorForHandle(hit.handlePosition as HandlePosition))
            return
        }

        if (hit?.hitType === 'body') {
            setOverlayCursor('move')
            return
        }

        setOverlayCursor('default')
    }, [canInteract, interactablePlugins, mode, selectedEffect?.id, setOverlayCursor, snapshot])

    const handlePointerLeave = useCallback(() => {
        setOverlayCursor('default')
    }, [setOverlayCursor])

    // --- Pointer Handler (Uses startDrag) ---

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!canInteract) return
        if (e.button !== 0) return

        // Hit Test
        const rect = overlayRef.current?.getBoundingClientRect()
        if (!rect) return
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const startContainer: Point = { x: mouseX, y: mouseY }
        const startVideoPoint = containerPointToVideoPoint(startContainer, snapshot)

        const domHit = hitTestAnnotationsFromPoint(e.clientX, e.clientY, {
            ignoreElement: overlayRef.current
        })

        const startBounds =
            domHit && overlayRef.current
                ? (() => {
                    const overlayRect = overlayRef.current!.getBoundingClientRect()
                    const rect = domHit.annotationElement.getBoundingClientRect()
                    const topLeftVideo = containerPointToVideoPoint(
                        { x: rect.left - overlayRect.left, y: rect.top - overlayRect.top },
                        snapshot
                    )
                    const bottomRightVideo = containerPointToVideoPoint(
                        { x: rect.right - overlayRect.left, y: rect.bottom - overlayRect.top },
                        snapshot
                    )
                    return {
                        width: Math.abs(bottomRightVideo.x - topLeftVideo.x),
                        height: Math.abs(bottomRightVideo.y - topLeftVideo.y),
                    }
                })()
                : null

        const pluginEffects = interactableEffects.filter((effect) => effect.type === EffectType.Plugin)
        const hit = domHit
            ? {
                effectId: domHit.annotationId,
                effectType: EffectType.Annotation,
                hitType: domHit.kind === 'handle' ? 'handle' : 'body',
                handlePosition: domHit.kind === 'handle' ? domHit.handle : undefined
            }
            : hitTestEffects(mouseX, mouseY, pluginEffects, snapshot, selectedEffect?.id ?? null)

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
                    if (effect.type === EffectType.Annotation) {
                        setActiveSidebarTab(SidebarTabId.Annotation)
                        if (!isPropertiesOpen) toggleProperties()
                    }
                }
            }

            const effect = effects.find((e: Effect) => e.id === hit.effectId)

            if (effect) {
                if (effect.type === EffectType.Annotation) {
                    setActiveSidebarTab(SidebarTabId.Annotation)
                    if (!isPropertiesOpen) toggleProperties()
                }
                // Start Drag/Resize/Rotate
                if (hit.hitType === 'handle') {
                    if (hit.handlePosition === 'rotate' && effect.type === EffectType.Annotation) {
                        // Rotation handle - need to calculate center position
                        const data = effect.data as AnnotationData
                        const pos = data.position ?? { x: 50, y: 50 }

                        // Calculate the ACTUAL center based on annotation type
                        // Highlight is top-left anchored, so center is pos + size/2
                        // Text/Keyboard are center-anchored, so pos IS the center
                        let annotationCenterPercent = { x: pos.x, y: pos.y }

                        if (data.type === AnnotationType.Highlight || data.type === AnnotationType.Blur) {
                            annotationCenterPercent = {
                                x: pos.x + (data.width ?? 20) / 2,
                                y: pos.y + (data.height ?? 12) / 2
                            }
                        } else if (data.type === AnnotationType.Arrow) {
                            // Arrow center is midpoint between start and end
                            const endPos = data.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }
                            annotationCenterPercent = {
                                x: (pos.x + endPos.x) / 2,
                                y: (pos.y + endPos.y) / 2
                            }
                        }

                        const rotateCenter = videoPointToContainerPoint(
                            percentToVideoPoint(annotationCenterPercent, snapshot),
                            snapshot
                        )

                        startDrag({
                            startX: e.clientX,
                            startY: e.clientY,
                            type: 'rotate',
                            initialValue: {
                                kind: 'annotation',
                                data: { ...data },
                                rotateCenter,
                                startPos: { x: mouseX, y: mouseY },
                                startContainer,
                                startVideoPoint
                            },
                            activationDistance: 0
                        })
                    } else {
                        if (effect.type === EffectType.Annotation) {
                            const data = effect.data as any
                            startDrag({
                                startX: e.clientX,
                                startY: e.clientY,
                                type: hit.handlePosition!,
                                initialValue: {
                                    kind: 'annotation',
                                    data: { ...data }, // Copy data
                                    startContainer,
                                    startVideoPoint,
                                    startBounds,
                                },
                                activationDistance: 0
                            })
                        } else if (effect.type === EffectType.Plugin) {
                            const data = effect.data as any
                            startDrag({
                                startX: e.clientX,
                                startY: e.clientY,
                                type: hit.handlePosition!,
                                initialValue: {
                                    kind: 'plugin',
                                    data: { ...data.position }
                                },
                                activationDistance: 0
                            })
                        }
                    }
                } else {
                    if (effect.type === EffectType.Annotation) {
                        // Pass distinct type for anchor handling if needed
                        startDrag({
                            startX: e.clientX,
                            startY: e.clientY,
                            type: 'move',
                            initialValue: {
                                kind: 'annotation',
                                data: { ...(effect.data as any) },
                                startContainer,
                                startVideoPoint,
                                startBounds,
                            },
                            activationDistance: 6
                        })
                    } else {
                        startDrag({
                            startX: e.clientX,
                            startY: e.clientY,
                            type: 'move',
                            initialValue: { kind: 'plugin', data: (effect.data as any).position },
                            activationDistance: 6
                        })
                    }
                }
            }

        } else {
            // Clicked empty space = Deselect
            clearEffectSelection()
            stopEditingOverlay()
            setMode('IDLE')
        }

    }, [
        canInteract,
        clearEffectSelection,
        effects,
        interactableEffects,
        isPropertiesOpen,
        selectEffectLayer,
        selectedEffect,
        snapshot,
        startDrag,
        startEditingOverlay,
        setActiveSidebarTab,
        stopEditingOverlay,
        toggleProperties
    ])

    // Click handler - stops propagation when annotation/plugin is hit
    // This prevents PreviewInteractions from duplicating selection handling
    // Allows double-click to work properly for text editing
    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!canInteract) return

        // If drag just ended, stop propagation to prevent selecting background
        if (didJustDragRef.current) {
            e.stopPropagation()
            return
        }

        const rect = overlayRef.current?.getBoundingClientRect()
        if (!rect) return
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const domHit = hitTestAnnotationsFromPoint(e.clientX, e.clientY, {
            ignoreElement: overlayRef.current
        })
        const pluginEffects = interactableEffects.filter((effect) => effect.type === EffectType.Plugin)
        const hit = domHit
            ? {
                effectId: domHit.annotationId,
                effectType: EffectType.Annotation,
                hitType: domHit.kind === 'handle' ? 'handle' : 'body',
                handlePosition: domHit.kind === 'handle' ? domHit.handle : undefined
            }
            : hitTestEffects(mouseX, mouseY, pluginEffects, snapshot, selectedEffect?.id ?? null)

        if (hit) {
            // Stop propagation to prevent PreviewInteractions from handling
            // This allows double-click to enter edit mode without interference
            e.stopPropagation()
        }
    }, [canInteract, interactableEffects, snapshot, selectedEffect?.id])

    // Double Click -> Edit
    // IMPORTANT: Perform fresh hit-test so double-click works on unselected annotations
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        const overlayElement = overlayRef.current
        if (!overlayElement) return

        const domHit = hitTestAnnotationsFromPoint(e.clientX, e.clientY, {
            ignoreElement: overlayElement
        })
        const hit = domHit && domHit.kind === 'annotation'
            ? {
                effectId: domHit.annotationId,
                effectType: EffectType.Annotation,
                hitType: 'body' as const
            }
            : null

        if (hit) {
            const effect = effects.find((eff: Effect) => eff.id === hit.effectId)
            if (effect?.type === EffectType.Annotation) {
                const data = effect.data as any
                const annotationType = (data.type ?? AnnotationType.Text) as AnnotationType
                if (annotationType === AnnotationType.Text) {
                    setActiveSidebarTab(SidebarTabId.Annotation)
                    if (!isPropertiesOpen) toggleProperties()
                    // Select if not already selected
                    if (selectedEffect?.id !== hit.effectId) {
                        selectEffectLayer('annotation' as any, hit.effectId)
                        startEditingOverlay(hit.effectId)
                    }
                    setIsInlineEditing(true)
                    startInlineEditing(hit.effectId)
                    setMode('EDITING')
                    e.stopPropagation()
                    e.preventDefault()
                }
            }
        }
    }, [selectedEffect, effects, selectEffectLayer, startEditingOverlay, setIsInlineEditing, setActiveSidebarTab, isPropertiesOpen, toggleProperties, startInlineEditing])


    return (
        <div
            ref={overlayRef}
            className="absolute inset-0 z-[2000] outline-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onClick={handleClick} // Stop propagation when annotation is hit
            onDoubleClick={handleDoubleClick}
            style={{
                // Let events pass through when editing - contentEditable handles input
                pointerEvents: isInlineEditing ? 'none' : 'auto'
            }}
        >
            {selectedAnnotation && selectionBounds && !isInlineEditing && (
                <div
                    style={{
                        position: 'absolute',
                        left: clipRect ? clipRect.x - SELECTION_HANDLE_SIZE * 2 : 0,
                        top: clipRect ? clipRect.y - SELECTION_HANDLE_SIZE * 2 : 0,
                        width: clipRect ? clipRect.width + SELECTION_HANDLE_SIZE * 4 : '100%',
                        height: clipRect ? clipRect.height + SELECTION_HANDLE_SIZE * 4 : '100%',
                        overflow: clipRect ? 'hidden' : 'visible',
                        pointerEvents: 'auto',
                        zIndex: 2001,
                    }}
                >
                    <SelectionOverlay
                        annotationId={selectedAnnotation.id}
                        annotationType={(selectedAnnotation.data as AnnotationData).type ?? AnnotationType.Text}
                        bounds={{
                            x: selectionBounds.x - (clipRect?.x ?? 0) + (clipRect ? SELECTION_HANDLE_SIZE * 2 : 0),
                            y: selectionBounds.y - (clipRect?.y ?? 0) + (clipRect ? SELECTION_HANDLE_SIZE * 2 : 0),
                            width: selectionBounds.width,
                            height: selectionBounds.height,
                        }}
                        borderRadius={
                            (selectedAnnotation.data as AnnotationData).type === AnnotationType.Blur
                                ? 12
                                : ((selectedAnnotation.data as AnnotationData).style?.borderRadius ?? 4)
                        }
                        showHandles={true}
                        showRotation={(selectedAnnotation.data as AnnotationData).type !== AnnotationType.Arrow}
                    />
                </div>
            )}
        </div>
    )
}
