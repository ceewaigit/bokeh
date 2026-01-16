'use client'

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { useCanvasDrag, type DragType, type CanvasDragDelta } from '@/features/ui/editor/hooks/use-canvas-drag'
import { hitTestEffects, type HandlePosition } from '@/features/ui/editor/logic/hit-testing'
import { hitTestAnnotationsFromPoint } from '@/features/ui/editor/logic/dom-hit-testing'
import { SelectionOverlay } from '@/features/ui/editor/components/SelectionOverlay'
import {
    deltaToPercent,
    clampPosition,
    clampPoint,
    type CameraTransform
} from '@/features/rendering/canvas/math/coordinates'
import {
    containerPointToVideoPoint,
    getVideoRectFromSnapshot,
    percentToVideoPoint,
    videoDeltaToPercentDelta,
    videoPointToContainerPoint,
    type Point
} from '@/features/ui/editor/logic/preview-point-transforms'
import type { FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'
import { EffectType, AnnotationType, type Effect, type AnnotationData } from '@/types/project'
import { useAnnotationEditContext } from '@/features/ui/editor/context/AnnotationEditContext'
import { SidebarTabId } from '@/features/effects/components/constants'
import { CommandExecutor, UpdateEffectCommand } from '@/features/core/commands'
import { getWatermarkGate, normalizeWatermarkEffectData } from '@/features/effects/watermark'

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
        case 'arrow-start':
        case 'arrow-end':
            return 'grab'
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

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

type PercentSize = { width?: number; height?: number }
type PercentBounds = { minX: number; maxX: number; minY: number; maxY: number }

function getContainerPercentBounds(
    snapshot: FrameSnapshot,
    containerPx: { width: number; height: number }
): PercentBounds {
    const videoRect = getVideoRectFromSnapshot(snapshot)
    if (videoRect.width <= 0 || videoRect.height <= 0 || containerPx.width <= 0 || containerPx.height <= 0) {
        return { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    }

    const corners: Point[] = [
        { x: 0, y: 0 },
        { x: containerPx.width, y: 0 },
        { x: 0, y: containerPx.height },
        { x: containerPx.width, y: containerPx.height },
    ]

    const toPercent = (containerPoint: Point): Point => {
        const videoPoint = containerPointToVideoPoint(containerPoint, snapshot)
        return {
            x: (videoPoint.x / videoRect.width) * 100,
            y: (videoPoint.y / videoRect.height) * 100,
        }
    }

    const p = corners.map(toPercent)
    const xs = p.map((pt) => pt.x)
    const ys = p.map((pt) => pt.y)

    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
        return { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    }

    return { minX, maxX, minY, maxY }
}

function resolvePercentSize(
    data: AnnotationData,
    startBounds: { width: number; height: number } | null | undefined,
    videoRectPx: { width: number; height: number }
): PercentSize {
    const width = typeof data.width === 'number'
        ? data.width
        : startBounds && videoRectPx.width > 0
            ? (startBounds.width / videoRectPx.width) * 100
            : undefined

    const height = typeof data.height === 'number'
        ? data.height
        : startBounds && videoRectPx.height > 0
            ? (startBounds.height / videoRectPx.height) * 100
            : undefined

    return {
        width: width && Number.isFinite(width) ? width : undefined,
        height: height && Number.isFinite(height) ? height : undefined,
    }
}

function clampCenterPosition(
    pos: { x: number; y: number },
    size: PercentSize | null | undefined,
    bounds: PercentBounds
) {
    const halfW = (size?.width ?? 0) / 2
    const halfH = (size?.height ?? 0) / 2
    const loX = bounds.minX + halfW
    const hiX = bounds.maxX - halfW
    const loY = bounds.minY + halfH
    const hiY = bounds.maxY - halfH
    return {
        x: clampNumber(pos.x, Math.min(loX, hiX), Math.max(loX, hiX)),
        y: clampNumber(pos.y, Math.min(loY, hiY), Math.max(loY, hiY)),
    }
}

function clampTopLeftPosition(
    pos: { x: number; y: number },
    size: PercentSize | null | undefined,
    bounds: PercentBounds
) {
    const w = size?.width ?? 0
    const h = size?.height ?? 0
    const loX = bounds.minX
    const hiX = bounds.maxX - w
    const loY = bounds.minY
    const hiY = bounds.maxY - h
    return {
        x: clampNumber(pos.x, Math.min(loX, hiX), Math.max(loX, hiX)),
        y: clampNumber(pos.y, Math.min(loY, hiY), Math.max(loY, hiY)),
    }
}

function clampAnnotationPosition(
    data: AnnotationData,
    pos: { x: number; y: number },
    size: PercentSize | null | undefined,
    bounds: PercentBounds
) {
    const type = (data.type ?? AnnotationType.Text) as AnnotationType
    const isTopLeftAnchor = type === AnnotationType.Highlight || type === AnnotationType.Blur || type === AnnotationType.Redaction
    if (isTopLeftAnchor) return clampTopLeftPosition(pos, size, bounds)
    return clampCenterPosition(pos, size, bounds)
}

const MIN_ANNOTATION_RECT_SIZE = 2
function clampTopLeftRectToBounds(
    next: { x: number; y: number; width: number; height: number },
    bounds: PercentBounds,
    minSize = MIN_ANNOTATION_RECT_SIZE
) {
    const minW = Math.max(minSize, 0)
    const minH = Math.max(minSize, 0)
    const clampedX = clampNumber(next.x, Math.min(bounds.minX, bounds.maxX - minW), Math.max(bounds.minX, bounds.maxX - minW))
    const clampedY = clampNumber(next.y, Math.min(bounds.minY, bounds.maxY - minH), Math.max(bounds.minY, bounds.maxY - minH))
    const maxW = Math.max(minW, bounds.maxX - clampedX)
    const maxH = Math.max(minH, bounds.maxY - clampedY)
    return {
        x: clampedX,
        y: clampedY,
        width: clampNumber(next.width, minW, maxW),
        height: clampNumber(next.height, minH, maxH),
    }
}

function clampAnnotationPointToBounds(point: { x: number; y: number }, bounds: PercentBounds) {
    return {
        x: clampNumber(point.x, Math.min(bounds.minX, bounds.maxX), Math.max(bounds.minX, bounds.maxX)),
        y: clampNumber(point.y, Math.min(bounds.minY, bounds.maxY), Math.max(bounds.minY, bounds.maxY)),
    }
}


export const InteractionLayer: React.FC<InteractionLayerProps> = ({
    effects,
    snapshot,
    currentTimeMs
}) => {
    // --- Stores & Context ---
    const overlayRef = useRef<HTMLDivElement>(null)

    // Store Access - PERF: Consolidated into single subscription to prevent cascading re-renders
    const {
        selectedEffectLayer,
        selectEffectLayer,
        clearEffectSelection,
        startEditingOverlay,
        stopEditingOverlay,
        updateEffect,
        project,
        updateProjectData,
        startInlineEditing
    } = useProjectStore(useShallow((s) => ({
        selectedEffectLayer: s.selectedEffectLayer,
        selectEffectLayer: s.selectEffectLayer,
        clearEffectSelection: s.clearEffectSelection,
        startEditingOverlay: s.startEditingOverlay,
        stopEditingOverlay: s.stopEditingOverlay,
        updateEffect: s.updateEffect,
        project: s.currentProject,
        updateProjectData: s.updateProjectData,
        startInlineEditing: s.startInlineEditing
    })))

    const {
        isPropertiesOpen,
        toggleProperties,
        setActiveSidebarTab,
        activeSidebarTab
    } = useWorkspaceStore(useShallow((s) => ({
        isPropertiesOpen: s.isPropertiesOpen,
        toggleProperties: s.toggleProperties,
        setActiveSidebarTab: s.setActiveSidebarTab,
        activeSidebarTab: s.activeSidebarTab
    })))

    // SSOT: Use isolated annotation editing context for transient state
    // This ensures video rendering is never affected by annotation drag/resize
    // isInlineEditing is now in context so preview-interactions can override camera zoom
    const { transientState, setTransientState, isInlineEditing, setIsInlineEditing } = useAnnotationEditContext()

    // --- State ---
    const [mode, setMode] = useState<InteractionMode>('IDLE')
    const shiftKeyRef = useRef(false)
    const lastCursorRef = useRef<string>('default')
    const didJustDragRef = useRef(false) // Tracks if drag just ended to prevent click-after-drag from deselecting
    const selectionBoundsRafRef = useRef<number>(0) // Track RAF ID to prevent accumulation

    // PERF: Cache hit test results for 16ms (one frame) to deduplicate across move/down/click events
    const lastHitTestRef = useRef<{
        clientX: number
        clientY: number
        result: ReturnType<typeof hitTestAnnotationsFromPoint>
        timestamp: number
    } | null>(null)

    const cachedHitTest = useCallback((clientX: number, clientY: number) => {
        const cached = lastHitTestRef.current
        const now = performance.now()

        // Cache valid for 16ms and within 2px tolerance
        if (
            cached &&
            now - cached.timestamp < 16 &&
            Math.abs(cached.clientX - clientX) < 2 &&
            Math.abs(cached.clientY - clientY) < 2
        ) {
            return cached.result
        }

        const result = hitTestAnnotationsFromPoint(clientX, clientY, {
            ignoreElement: overlayRef.current
        })

        lastHitTestRef.current = { clientX, clientY, result, timestamp: now }
        return result
    }, [])

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
    const [watermarkBounds, setWatermarkBounds] = useState<SelectionBounds | null>(null)

    const canInteractWatermark =
        canInteract &&
        activeSidebarTab === SidebarTabId.Watermark &&
        Boolean(project) &&
        !getWatermarkGate().customizationLocked

    const updateWatermarkBounds = useCallback(() => {
        const overlayEl = overlayRef.current
        if (!overlayEl || !canInteractWatermark) {
            setWatermarkBounds(null)
            return
        }

        const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-watermark="true"]'))
        const watermarkEl = candidates.find((el) => !overlayEl.contains(el)) ?? candidates[0]
        if (!watermarkEl) {
            setWatermarkBounds(null)
            return
        }

        const overlayRect = overlayEl.getBoundingClientRect()
        const rect = watermarkEl.getBoundingClientRect()

        setWatermarkBounds({
            x: rect.left - overlayRect.left,
            y: rect.top - overlayRect.top,
            width: rect.width,
            height: rect.height,
        })
    }, [canInteractWatermark])

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
    }, [selectedAnnotation])

    useEffect(() => {
        // Cancel any existing RAF to prevent accumulation when deps change
        if (selectionBoundsRafRef.current) {
            window.cancelAnimationFrame(selectionBoundsRafRef.current)
            selectionBoundsRafRef.current = 0
        }

        if (!selectedAnnotation) {
            setSelectionBounds(null)
            return
        }

        // PERF: Only run RAF loop when actively dragging/resizing
        // When IDLE, update once and stop - saves ~20% CPU
        if (mode === 'IDLE') {
            updateSelectionBounds()
            return
        }

        const tick = () => {
            updateSelectionBounds()
            selectionBoundsRafRef.current = window.requestAnimationFrame(tick)
        }

        selectionBoundsRafRef.current = window.requestAnimationFrame(tick)
        return () => {
            if (selectionBoundsRafRef.current) {
                window.cancelAnimationFrame(selectionBoundsRafRef.current)
                selectionBoundsRafRef.current = 0
            }
        }
    }, [selectedAnnotation, updateSelectionBounds, mode])

    // PERF: Watermark bounds - update once on change, use ResizeObserver for dynamic updates
    // Previously used 60Hz RAF loop which drained battery when watermark tab was open
    useEffect(() => {
        if (!canInteractWatermark) {
            setWatermarkBounds(null)
            return
        }

        // Update once immediately
        updateWatermarkBounds()

        // Use ResizeObserver for event-driven updates (no polling)
        const overlayEl = overlayRef.current
        if (!overlayEl) return

        const observer = new ResizeObserver(() => {
            updateWatermarkBounds()
        })
        observer.observe(overlayEl)
        return () => observer.disconnect()
    }, [canInteractWatermark, updateWatermarkBounds])

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

        if (initial?.kind === 'watermark' && type === 'move') {
            if (!project) return
            const compWidth = project.settings?.resolution?.width ?? 0
            const compHeight = project.settings?.resolution?.height ?? 0
            if (compWidth <= 0 || compHeight <= 0) return

            const containerScale = videoRect.width > 0 ? (videoRect.width / compWidth) : 1
            const minDim = Math.max(1, Math.min(compWidth, compHeight))
            const uiScale = clampNumber(minDim / 1080, 0.5, 2)

            const deltaCompPx = {
                x: delta.x / containerScale,
                y: delta.y / containerScale,
            }
            const deltaDesignPx = {
                x: deltaCompPx.x / uiScale,
                y: deltaCompPx.y / uiScale,
            }

            const initialOffsets = initial.data as { offsetX: number; offsetY: number }
            const maxOffsetX = compWidth / uiScale
            const maxOffsetY = compHeight / uiScale

            const nextOffsetX = clampNumber(initialOffsets.offsetX - deltaDesignPx.x, 0, maxOffsetX)
            const nextOffsetY = clampNumber(initialOffsets.offsetY - deltaDesignPx.y, 0, maxOffsetY)

            updateProjectData((p) => ({
                ...p,
                watermark: normalizeWatermarkEffectData({
                    ...(p.watermark ?? {}),
                    offsetX: nextOffsetX,
                    offsetY: nextOffsetY,
                })
            }))
            return
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
            const sizePercent = (initial as any).sizePercent as PercentSize | undefined
            const overlayEl = overlayRef.current
            const bounds = overlayEl
                ? getContainerPercentBounds(snapshot, { width: overlayEl.clientWidth, height: overlayEl.clientHeight })
                : { minX: 0, maxX: 100, minY: 0, maxY: 100 }

            if (type === 'move') {
                const pos = base.position || { x: 50, y: 50 }
                if (base.type === AnnotationType.Arrow) {
                    const end = base.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }
                    const nextPos = { x: pos.x + percentDelta.x, y: pos.y + percentDelta.y }
                    const nextEnd = { x: end.x + percentDelta.x, y: end.y + percentDelta.y }
                    newData = {
                        position: clampAnnotationPointToBounds(nextPos, bounds),
                        endPosition: clampAnnotationPointToBounds(nextEnd, bounds)
                    }
                } else {
                    const unclamped = { x: pos.x + percentDelta.x, y: pos.y + percentDelta.y }
                    newData = { position: clampAnnotationPosition(base, unclamped, sizePercent, bounds) }
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

                if (base.type === AnnotationType.Highlight || base.type === AnnotationType.Blur || base.type === AnnotationType.Redaction) {
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

                    const clamped = clampTopLeftRectToBounds(
                        { x: newPos.x, y: newPos.y, width: newPos.width, height: newPos.height },
                        bounds
                    )

                    newData = {
                        position: { x: clamped.x, y: clamped.y },
                        width: clamped.width,
                        height: clamped.height
                    }
                } else if (base.type === AnnotationType.Arrow) {
                    const pos = base.position || { x: 50, y: 50 }
                    const end = base.endPosition || { x: pos.x + 10, y: pos.y + 10 }

                    if (type === 'arrow-start') {
                        newData = {
                            position: clampAnnotationPointToBounds({ x: pos.x + percentDelta.x, y: pos.y + percentDelta.y }, bounds),
                            endPosition: end
                        }
                    } else if (type === 'arrow-end') {
                        newData = {
                            position: pos,
                            endPosition: clampAnnotationPointToBounds({ x: end.x + percentDelta.x, y: end.y + percentDelta.y }, bounds)
                        }
                    }
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
                        const nextCenter = clampCenterPosition({
                            x: basePosition.x + percentDelta.x / 2,
                            y: basePosition.y
                        }, { width: newWidthPercent, height: sizePercent?.height }, bounds)

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

    }, [mode, project, selectedEffect, snapshot, updateProjectData, videoRect, setTransientState, cameraTransform])

    const onDragEnd = useCallback(() => {
        setMode('IDLE')
        if (pendingUpdateRef.current && selectedEffectLayer?.id) {
            if (CommandExecutor.isInitialized()) {
                void CommandExecutor.getInstance().execute(UpdateEffectCommand, selectedEffectLayer.id, { data: pendingUpdateRef.current })
            } else {
                updateEffect(selectedEffectLayer.id, { data: pendingUpdateRef.current })
            }
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

        // PERF: Use cached hit test to avoid redundant DOM traversals
        const domHit = cachedHitTest(e.clientX, e.clientY)

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

        if (canInteractWatermark && watermarkBounds) {
            if (
                mouseX >= watermarkBounds.x &&
                mouseX <= watermarkBounds.x + watermarkBounds.width &&
                mouseY >= watermarkBounds.y &&
                mouseY <= watermarkBounds.y + watermarkBounds.height
            ) {
                setOverlayCursor('move')
                return
            }
        }

        setOverlayCursor('default')
    }, [canInteract, canInteractWatermark, interactablePlugins, mode, selectedEffect?.id, setOverlayCursor, snapshot, watermarkBounds])

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

        if (canInteractWatermark && watermarkBounds) {
            if (
                mouseX >= watermarkBounds.x &&
                mouseX <= watermarkBounds.x + watermarkBounds.width &&
                mouseY >= watermarkBounds.y &&
                mouseY <= watermarkBounds.y + watermarkBounds.height
            ) {
                const watermark = normalizeWatermarkEffectData(project?.watermark ?? null)
                startDrag({
                    startX: e.clientX,
                    startY: e.clientY,
                    type: 'move',
                    initialValue: {
                        kind: 'watermark',
                        data: { offsetX: watermark.offsetX, offsetY: watermark.offsetY }
                    },
                    activationDistance: 0
                })
                e.preventDefault()
                e.stopPropagation()
                return
            }
        }

        // PERF: Use cached hit test to avoid redundant DOM traversals
        const domHit = cachedHitTest(e.clientX, e.clientY)

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
                        const sizePercent = resolvePercentSize(data, startBounds, videoRect)
                        const pos = data.position ?? { x: 50, y: 50 }

                        // Calculate the ACTUAL center based on annotation type
                        // Highlight is top-left anchored, so center is pos + size/2
                        // Text/Keyboard are center-anchored, so pos IS the center
                        let annotationCenterPercent = { x: pos.x, y: pos.y }

                        if (data.type === AnnotationType.Highlight || data.type === AnnotationType.Blur || data.type === AnnotationType.Redaction) {
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
                                startVideoPoint,
                                sizePercent,
                            },
                            activationDistance: 0
                        })
                    } else {
                        if (effect.type === EffectType.Annotation) {
                            const data = effect.data as any
                            const sizePercent = resolvePercentSize(data as AnnotationData, startBounds, videoRect)
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
                                    sizePercent,
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
                        const data = effect.data as any
                        const sizePercent = resolvePercentSize(data as AnnotationData, startBounds, videoRect)
                        startDrag({
                            startX: e.clientX,
                            startY: e.clientY,
                            type: 'move',
                            initialValue: {
                                kind: 'annotation',
                                data: { ...data },
                                startContainer,
                                startVideoPoint,
                                startBounds,
                                sizePercent,
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
            canInteractWatermark,
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
	        toggleProperties,
	        videoRect,
            watermarkBounds,
            project
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

        // PERF: Use cached hit test to avoid redundant DOM traversals
        const domHit = cachedHitTest(e.clientX, e.clientY)
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

        // PERF: Use cached hit test to avoid redundant DOM traversals
        const domHit = cachedHitTest(e.clientX, e.clientY)
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
            {canInteractWatermark && watermarkBounds && !isInlineEditing && (
                <div
                    style={{
                        position: 'absolute',
                        left: watermarkBounds.x,
                        top: watermarkBounds.y,
                        width: watermarkBounds.width,
                        height: watermarkBounds.height,
                        border: '1px solid rgba(255,255,255,0.65)',
                        borderRadius: 10,
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                        pointerEvents: 'none',
                    }}
                />
            )}
            {selectedAnnotation && selectionBounds && !isInlineEditing && (
                <SelectionOverlay
                    annotationId={selectedAnnotation.id}
                    annotationType={(selectedAnnotation.data as AnnotationData).type ?? AnnotationType.Text}
                    bounds={selectionBounds}
                    borderRadius={
                        (selectedAnnotation.data as AnnotationData).type === AnnotationType.Blur ||
                            (selectedAnnotation.data as AnnotationData).type === AnnotationType.Redaction
                            ? 12
                            : ((selectedAnnotation.data as AnnotationData).style?.borderRadius ?? 4)
                    }
                    showHandles={(selectedAnnotation.data as AnnotationData).type !== AnnotationType.Arrow}
                    showRotation={(selectedAnnotation.data as AnnotationData).type !== AnnotationType.Arrow}
                />
            )}
        </div>
    )
}
