'use client'

/**
 * OverlayEditor - Unified drag/resize for positioned elements
 *
 * Canva-style editor for plugins, annotations, and webcam overlays.
 * Refactored to use useCanvasDrag for shared drag logic.
 */

import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import { AbsoluteFill, getRemotionEnvironment } from 'remotion'
import { useVideoPosition } from '../../context/layout/VideoPositionContext'
import { useProjectStore } from '@/stores/project-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { EffectType, EffectLayerType } from '@/types/effects'
import type { Effect, AnnotationData, PluginEffectData } from '@/types/project'
import { AnnotationType } from '@/types/project'
import { getDefaultAnnotationSize } from '@/lib/annotations/annotation-defaults'
import {
  hitTestEffects,
  getEffectBounds,
  isPositionableEffect,
  isResizableEffect,
  type EffectBounds,
} from '@/lib/canvas-editor/hit-testing'
import {
  deltaToPercent,
  clampPosition,
  type PositionData,
  type VideoRect,
} from '@/lib/canvas-editor/coordinate-utils'
import { useCanvasDrag, type DragType, type CanvasDragDelta, type HandlePosition, getHandleCursorStyle } from '@/hooks/use-canvas-drag'

interface OverlayEditorProps {
  /** All effects at current time */
  effects: Effect[]
  /** Whether overlay editing is enabled */
  enabled?: boolean
}

const HANDLE_SIZE = 12
const PRIMARY_COLOR = 'hsl(var(--primary))'
const SURFACE_COLOR = 'hsl(var(--background))'
const MIN_HIGHLIGHT_SIZE = 4

type AnnotationDragState = {
  kind: 'annotation'
  data: {
    type: AnnotationType
    position: { x: number; y: number }
    endPosition?: { x: number; y: number }
    width?: number
    height?: number
  }
}

type PluginDragState = {
  kind: 'plugin'
  data: PositionData
}

type EditorDragState = AnnotationDragState | PluginDragState

const clampPercent = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))
const clampPoint = (point: { x: number; y: number }, min = 0, max = 100) => ({
  x: clampPercent(point.x, min, max),
  y: clampPercent(point.y, min, max),
})

const clampHighlightBox = (
  position: { x: number; y: number },
  width: number,
  height: number
) => {
  const maxX = 100 - MIN_HIGHLIGHT_SIZE
  const maxY = 100 - MIN_HIGHLIGHT_SIZE
  const clampedPosition = {
    x: clampPercent(position.x, 0, maxX),
    y: clampPercent(position.y, 0, maxY),
  }
  const clampedWidth = Math.max(MIN_HIGHLIGHT_SIZE, Math.min(width, 100 - clampedPosition.x))
  const clampedHeight = Math.max(MIN_HIGHLIGHT_SIZE, Math.min(height, 100 - clampedPosition.y))
  return {
    x: clampedPosition.x,
    y: clampedPosition.y,
    width: clampedWidth,
    height: clampedHeight,
  }
}

export const OverlayEditor: React.FC<OverlayEditorProps> = ({
  effects,
  enabled = true,
}) => {
  const { isRendering } = getRemotionEnvironment()
  const videoPosition = useVideoPosition()

  // Store state and actions
  const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer)
  const editingOverlayId = useProjectStore((s) => s.editingOverlayId)

  const selectEffectLayer = useProjectStore((s) => s.selectEffectLayer)
  const clearEffectSelection = useProjectStore((s) => s.clearEffectSelection)
  const startEditingOverlay = useProjectStore((s) => s.startEditingOverlay)
  const stopEditingOverlay = useProjectStore((s) => s.stopEditingOverlay)
  const updateEffect = useProjectStore((s) => s.updateEffect)

  const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen)
  const toggleProperties = useWorkspaceStore((s) => s.toggleProperties)

  const overlayRef = useRef<HTMLDivElement>(null)

  // Local drag preview state - prevents store updates during drag which cause remount/flicker
  const [dragPreviewBounds, setDragPreviewBounds] = useState<EffectBounds | null>(null)
  const pendingUpdateRef = useRef<{ id: string; data: unknown } | null>(null)

  // Get the video rect from VideoPositionContext
  const videoRect: VideoRect = useMemo(() => ({
    x: videoPosition.offsetX,
    y: videoPosition.offsetY,
    width: videoPosition.drawWidth,
    height: videoPosition.drawHeight,
  }), [videoPosition.offsetX, videoPosition.offsetY, videoPosition.drawWidth, videoPosition.drawHeight])

  // --- Derived State ---

  const pluginEditingPosition = useMemo(() => {
    if (!editingOverlayId) return null
    const effect = effects.find((e) => e.id === editingOverlayId)
    if (!effect || effect.type !== EffectType.Plugin) return null
    const bounds = getEffectBounds(effect, videoRect)
    if (!bounds) return null
    return {
      x: ((bounds.x + bounds.width / 2 - videoRect.x) / videoRect.width) * 100,
      y: ((bounds.y + bounds.height / 2 - videoRect.y) / videoRect.height) * 100,
      width: bounds.width,
      height: bounds.height,
    }
  }, [editingOverlayId, effects, videoRect])

  const selectedEffect = selectedEffectLayer?.id
    ? effects.find((e) => e.id === selectedEffectLayer.id)
    : null
  const selectedAnnotationData = selectedEffect?.type === EffectType.Annotation
    ? (selectedEffect.data as AnnotationData)
    : null

  const selectedBounds = selectedEffect
    ? getEffectBounds(selectedEffect, videoRect)
    : null

  const canResize = selectedEffect ? isResizableEffect(selectedEffect) : false

  const badgeText = useMemo(() => {
    if (selectedAnnotationData?.position) {
      return `${Math.round(selectedAnnotationData.position.x)}%, ${Math.round(selectedAnnotationData.position.y)}%`
    }
    if (pluginEditingPosition) {
      return `${Math.round(pluginEditingPosition.x)}%, ${Math.round(pluginEditingPosition.y)}%`
    }
    return 'Selected'
  }, [selectedAnnotationData, pluginEditingPosition])

  // Convert EffectType to EffectLayerType
  const effectTypeToLayerType = (type: EffectType): EffectLayerType => {
    switch (type) {
      case EffectType.Plugin:
        return EffectLayerType.Plugin
      case EffectType.Annotation:
        return EffectLayerType.Annotation
      default:
        return EffectLayerType.Plugin
    }
  }

  // --- Drag Handling ---
  // Computes new position data and pixel bounds from a drag delta
  const computeDragResult = useCallback(
    (
      delta: { x: number; y: number },
      dragType: DragType,
      initial: EditorDragState
    ): { data: unknown; bounds: EffectBounds } | null => {
      const percentDelta = deltaToPercent(delta.x, delta.y, videoRect)

      if (initial.kind === 'annotation') {
        const { type, position: basePosition, endPosition: baseEnd, width: baseWidth, height: baseHeight } = initial.data
        const safeWidth = baseWidth ?? 20
        const safeHeight = baseHeight ?? 10

        if (dragType === 'move') {
          if (type === AnnotationType.Arrow) {
            const safeEnd = baseEnd ?? { x: basePosition.x + 10, y: basePosition.y + 10 }
            const start = clampPoint({
              x: basePosition.x + percentDelta.x,
              y: basePosition.y + percentDelta.y,
            })
            const end = clampPoint({
              x: safeEnd.x + percentDelta.x,
              y: safeEnd.y + percentDelta.y,
            })
            const topLeft = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) }
            const bottomRight = { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y) }
            return {
              data: { position: start, endPosition: end },
              bounds: {
                x: videoRect.x + (topLeft.x / 100) * videoRect.width - 10,
                y: videoRect.y + (topLeft.y / 100) * videoRect.height - 10,
                width: ((bottomRight.x - topLeft.x) / 100) * videoRect.width + 20,
                height: ((bottomRight.y - topLeft.y) / 100) * videoRect.height + 20,
              },
            }
          }

          if (type === AnnotationType.Highlight) {
            const clamped = clampHighlightBox(
              { x: basePosition.x + percentDelta.x, y: basePosition.y + percentDelta.y },
              safeWidth,
              safeHeight
            )
            return {
              data: { position: { x: clamped.x, y: clamped.y }, width: clamped.width, height: clamped.height },
              bounds: {
                x: videoRect.x + (clamped.x / 100) * videoRect.width,
                y: videoRect.y + (clamped.y / 100) * videoRect.height,
                width: (clamped.width / 100) * videoRect.width,
                height: (clamped.height / 100) * videoRect.height,
              },
            }
          }

          // Text / Keyboard
          const next = clampPoint({
            x: basePosition.x + percentDelta.x,
            y: basePosition.y + percentDelta.y,
          })
          const fallbackSize = getDefaultAnnotationSize(type)
          const w = safeWidth ?? fallbackSize.width ?? 20
          const h = safeHeight ?? fallbackSize.height ?? 10
          return {
            data: { position: next },
            bounds: {
              x: videoRect.x + (next.x / 100) * videoRect.width,
              y: videoRect.y + (next.y / 100) * videoRect.height,
              width: (w / 100) * videoRect.width,
              height: (h / 100) * videoRect.height,
            },
          }
        }

        // Resize logic for highlight only
        if (type !== AnnotationType.Highlight) return null

        let nextX = basePosition.x
        let nextY = basePosition.y
        let nextWidth = safeWidth
        let nextHeight = safeHeight

        switch (dragType) {
          case 'bottom-right':
            nextWidth = safeWidth + percentDelta.x
            nextHeight = safeHeight + percentDelta.y
            break
          case 'bottom-left':
            nextX = basePosition.x + percentDelta.x
            nextWidth = safeWidth - percentDelta.x
            nextHeight = safeHeight + percentDelta.y
            break
          case 'top-right':
            nextY = basePosition.y + percentDelta.y
            nextWidth = safeWidth + percentDelta.x
            nextHeight = safeHeight - percentDelta.y
            break
          case 'top-left':
            nextX = basePosition.x + percentDelta.x
            nextY = basePosition.y + percentDelta.y
            nextWidth = safeWidth - percentDelta.x
            nextHeight = safeHeight - percentDelta.y
            break
          case 'right':
            nextWidth = safeWidth + percentDelta.x
            break
          case 'left':
            nextX = basePosition.x + percentDelta.x
            nextWidth = safeWidth - percentDelta.x
            break
          case 'bottom':
            nextHeight = safeHeight + percentDelta.y
            break
          case 'top':
            nextY = basePosition.y + percentDelta.y
            nextHeight = safeHeight - percentDelta.y
            break
        }

        const clamped = clampHighlightBox({ x: nextX, y: nextY }, nextWidth, nextHeight)
        return {
          data: { position: { x: clamped.x, y: clamped.y }, width: clamped.width, height: clamped.height },
          bounds: {
            x: videoRect.x + (clamped.x / 100) * videoRect.width,
            y: videoRect.y + (clamped.y / 100) * videoRect.height,
            width: (clamped.width / 100) * videoRect.width,
            height: (clamped.height / 100) * videoRect.height,
          },
        }
      }

      // Plugin
      if (initial.kind === 'plugin') {
        const initialPosition = initial.data
        let newPosition = { ...initialPosition }

        if (dragType === 'move') {
          newPosition.x = initialPosition.x + percentDelta.x
          newPosition.y = initialPosition.y + percentDelta.y
        } else {
          switch (dragType as HandlePosition) {
            case 'bottom-right':
              newPosition.width = (initialPosition.width ?? 100) + percentDelta.x
              newPosition.height = (initialPosition.height ?? 100) + percentDelta.y
              break
            case 'bottom-left':
              newPosition.x = initialPosition.x + percentDelta.x
              newPosition.width = (initialPosition.width ?? 100) - percentDelta.x
              newPosition.height = (initialPosition.height ?? 100) + percentDelta.y
              break
            case 'top-right':
              newPosition.y = initialPosition.y + percentDelta.y
              newPosition.width = (initialPosition.width ?? 100) + percentDelta.x
              newPosition.height = (initialPosition.height ?? 100) - percentDelta.y
              break
            case 'top-left':
              newPosition.x = initialPosition.x + percentDelta.x
              newPosition.y = initialPosition.y + percentDelta.y
              newPosition.width = (initialPosition.width ?? 100) - percentDelta.x
              newPosition.height = (initialPosition.height ?? 100) - percentDelta.y
              break
            case 'right':
              newPosition.width = (initialPosition.width ?? 100) + percentDelta.x
              break
            case 'left':
              newPosition.x = initialPosition.x + percentDelta.x
              newPosition.width = (initialPosition.width ?? 100) - percentDelta.x
              break
            case 'bottom':
              newPosition.height = (initialPosition.height ?? 100) + percentDelta.y
              break
            case 'top':
              newPosition.y = initialPosition.y + percentDelta.y
              newPosition.height = (initialPosition.height ?? 100) - percentDelta.y
              break
          }
        }

        newPosition = clampPosition(newPosition)
        const w = newPosition.width ?? 100
        const h = newPosition.height ?? 100
        return {
          data: {
            position: {
              x: newPosition.x,
              y: newPosition.y,
              width: w,
              height: h,
            },
          },
          bounds: {
            x: videoRect.x + (newPosition.x / 100) * videoRect.width - w / 2,
            y: videoRect.y + (newPosition.y / 100) * videoRect.height - h / 2,
            width: w,
            height: h,
          },
        }
      }

      return null
    },
    [videoRect]
  )

  // During drag, update local preview only (no store updates)
  const handleDrag = useCallback(
    (delta: CanvasDragDelta, dragType: DragType, initial: EditorDragState | null) => {
      if (!initial || !editingOverlayId) return

      const result = computeDragResult(delta, dragType, initial)
      if (!result) return

      // Update local preview bounds for smooth visual feedback
      setDragPreviewBounds(result.bounds)
      // Store pending update to commit on drag end
      pendingUpdateRef.current = { id: editingOverlayId, data: result.data }

    },
    [editingOverlayId, computeDragResult]
  )

  // Commit to store only on drag end
  const handleDragEnd = useCallback(() => {
    const pending = pendingUpdateRef.current
    if (pending) {
      updateEffect(pending.id, { data: pending.data } as Partial<Effect>)
      pendingUpdateRef.current = null
    }
    setDragPreviewBounds(null)
  }, [updateEffect])

  const { isDragging, startDrag } = useCanvasDrag<EditorDragState>({
    onDrag: handleDrag,
    onDragEnd: handleDragEnd,
  })

  // Keyboard shortcuts (unchanged)
  useEffect(() => {
    const effectId = selectedEffectLayer?.id
    if (!effectId || !selectedEffect) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const step = e.shiftKey ? 10 : 1
      const delta = { x: 0, y: 0 }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          updateEffect(effectId, { enabled: false })
          clearEffectSelection()
          stopEditingOverlay()
          break

        case 'ArrowUp':
          e.preventDefault()
          delta.y = -step
          break

        case 'ArrowDown':
          e.preventDefault()
          delta.y = step
          break

        case 'ArrowLeft':
          e.preventDefault()
          delta.x = -step
          break

        case 'ArrowRight':
          e.preventDefault()
          delta.x = step
          break

        case 'Escape':
          e.preventDefault()
          clearEffectSelection()
          stopEditingOverlay()
          break
        default:
          return
      }

      if (delta.x === 0 && delta.y === 0) return

      if (selectedEffect.type === EffectType.Annotation && selectedAnnotationData?.position) {
        const basePosition = selectedAnnotationData.position

        if (selectedAnnotationData.type === AnnotationType.Arrow) {
          const baseEnd = selectedAnnotationData.endPosition ?? {
            x: basePosition.x + 10,
            y: basePosition.y + 10,
          }
          const nextStart = clampPoint({
            x: basePosition.x + delta.x,
            y: basePosition.y + delta.y,
          })
          const nextEnd = clampPoint({
            x: baseEnd.x + delta.x,
            y: baseEnd.y + delta.y,
          })
          updateEffect(effectId, { data: { position: nextStart, endPosition: nextEnd } })
          return
        }

        if (selectedAnnotationData.type === AnnotationType.Highlight) {
          const fallback = getDefaultAnnotationSize(AnnotationType.Highlight)
          const width = selectedAnnotationData.width ?? fallback.width ?? 20
          const height = selectedAnnotationData.height ?? fallback.height ?? 10
          const clamped = clampHighlightBox(
            { x: basePosition.x + delta.x, y: basePosition.y + delta.y },
            width,
            height
          )
          updateEffect(effectId, {
            data: {
              position: { x: clamped.x, y: clamped.y },
              width: clamped.width,
              height: clamped.height,
            },
          })
          return
        }

        const next = clampPoint({
          x: basePosition.x + delta.x,
          y: basePosition.y + delta.y,
        })
        updateEffect(effectId, { data: { position: next } })
        return
      }

      if (selectedEffect.type !== EffectType.Plugin || !pluginEditingPosition) return

      const newPos = clampPosition({
        ...pluginEditingPosition,
        x: pluginEditingPosition.x + delta.x,
        y: pluginEditingPosition.y + delta.y,
      })
      updateEffect(effectId, {
        data: {
          position: {
            x: newPos.x,
            y: newPos.y,
            width: newPos.width,
            height: newPos.height,
          },
        },
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    selectedEffectLayer,
    selectedEffect,
    selectedAnnotationData,
    pluginEditingPosition,
    updateEffect,
    clearEffectSelection,
    stopEditingOverlay,
  ])

  // Handle mouse down on canvas (selection + immediate drag)
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left mouse button
      if (e.button !== 0) return

      const rect = overlayRef.current?.getBoundingClientRect()
      if (!rect) return

      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const hit = hitTestEffects(
        mouseX,
        mouseY,
        effects.filter(isPositionableEffect),
        videoRect,
        selectedEffectLayer?.id ?? null
      )

      if (hit) {
        const effect = effects.find((eff) => eff.id === hit.effectId)
        if (!effect) return

        // Select the effect
        selectEffectLayer(effectTypeToLayerType(effect.type), effect.id)
        startEditingOverlay(effect.id)
        if (!isPropertiesOpen) {
          toggleProperties()
        }

        // Setup drag state for immediate drag on body click
        if (hit.hitType === 'body' || hit.hitType === 'handle') {
          const dragType = hit.hitType === 'body' ? 'move' : (hit.handlePosition ?? 'move')

          // Prepare initial data
          let initialData: EditorDragState | undefined

          if (effect.type === EffectType.Annotation) {
            const data = effect.data as AnnotationData
            if (data.position) {
              const fallback = getDefaultAnnotationSize(data.type ?? AnnotationType.Text)
              initialData = {
                kind: 'annotation',
                data: {
                  type: data.type ?? AnnotationType.Text,
                  position: data.position,
                  endPosition: data.endPosition,
                  width: data.width ?? fallback.width,
                  height: data.height ?? fallback.height,
                }
              }
            }
          } else if (effect.type === EffectType.Plugin) {
            const pluginData = effect.data as PluginEffectData
            if (pluginData.position) {
              const bounds = getEffectBounds(effect, videoRect)
              if (bounds) {
                initialData = {
                  kind: 'plugin',
                  data: {
                    x: pluginData.position.x,
                    y: pluginData.position.y,
                    width: bounds.width,
                    height: bounds.height,
                  }
                }
              }
            }
          }

          if (initialData) {
            startDrag(e, dragType, initialData)
          }
        }
      } else {
        // Click on empty area - deselect
        clearEffectSelection()
        stopEditingOverlay()
      }
    },
    [
      effects,
      videoRect,
      selectedEffectLayer,
      selectEffectLayer,
      clearEffectSelection,
      startEditingOverlay,
      stopEditingOverlay,
      isPropertiesOpen,
      toggleProperties,
      startDrag
    ]
  )

  // Handle mouse down on selection box or handles
  const handleMouseDown = (e: React.MouseEvent, type: DragType) => {
    if (!selectedEffect) return

    let initialData: EditorDragState | undefined

    if (selectedEffect.type === EffectType.Annotation) {
      const data = selectedEffect.data as AnnotationData
      if (data.position) {
        const fallback = getDefaultAnnotationSize(data.type ?? AnnotationType.Text)
        initialData = {
          kind: 'annotation',
          data: {
            type: data.type ?? AnnotationType.Text,
            position: data.position,
            endPosition: data.endPosition,
            width: data.width ?? fallback.width,
            height: data.height ?? fallback.height,
          }
        }
      }
    } else if (pluginEditingPosition) {
      initialData = {
        kind: 'plugin',
        data: pluginEditingPosition
      }
    }

    if (initialData) {
      startDrag(e, type, initialData)
    }
  }

  // Get cursor for handle position
  const getCursor = (position: HandlePosition): string => getHandleCursorStyle(position)

  // Render a resize handle
  const renderHandle = (position: HandlePosition, bounds: EffectBounds) => {
    if (!canResize) return null

    let left = 0
    let top = 0

    switch (position) {
      case 'top-left':
        left = bounds.x - HANDLE_SIZE / 2
        top = bounds.y - HANDLE_SIZE / 2
        break
      case 'top':
        left = bounds.x + bounds.width / 2 - HANDLE_SIZE / 2
        top = bounds.y - HANDLE_SIZE / 2
        break
      case 'top-right':
        left = bounds.x + bounds.width - HANDLE_SIZE / 2
        top = bounds.y - HANDLE_SIZE / 2
        break
      case 'right':
        left = bounds.x + bounds.width - HANDLE_SIZE / 2
        top = bounds.y + bounds.height / 2 - HANDLE_SIZE / 2
        break
      case 'bottom-right':
        left = bounds.x + bounds.width - HANDLE_SIZE / 2
        top = bounds.y + bounds.height - HANDLE_SIZE / 2
        break
      case 'bottom':
        left = bounds.x + bounds.width / 2 - HANDLE_SIZE / 2
        top = bounds.y + bounds.height - HANDLE_SIZE / 2
        break
      case 'bottom-left':
        left = bounds.x - HANDLE_SIZE / 2
        top = bounds.y + bounds.height - HANDLE_SIZE / 2
        break
      case 'left':
        left = bounds.x - HANDLE_SIZE / 2
        top = bounds.y + bounds.height / 2 - HANDLE_SIZE / 2
        break
    }

    return (
      <div
        key={position}
        style={{
          position: 'absolute',
          left,
          top,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          backgroundColor: SURFACE_COLOR,
          border: `1.5px solid ${PRIMARY_COLOR}`,
          borderRadius: 6,
          boxShadow: '0 6px 14px rgba(0,0,0,0.18)',
          cursor: getCursor(position),
          zIndex: 20,
          transition: 'transform 100ms ease-out',
        }}
        onMouseDown={(e) => handleMouseDown(e, position)}
        onMouseEnter={(e) => {
          (e.target as HTMLDivElement).style.transform = 'scale(1.1)'
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLDivElement).style.transform = 'scale(1)'
        }}
      />
    )
  }

  // Don't render during export or when disabled
  if (isRendering || !enabled) {
    return null
  }

  // Filter positionable effects
  const positionableEffects = effects.filter(isPositionableEffect)

  // If no positionable effects, don't render editor layer but still capture clicks
  // to allow deselection
  if (positionableEffects.length === 0 && !selectedBounds) {
    return null
  }

  return (
    <AbsoluteFill
      ref={overlayRef}
      onMouseDown={handleCanvasMouseDown}
      style={{
        zIndex: 999,
        pointerEvents: 'auto',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Selection box for selected effect - use drag preview during drag for smooth movement */}
      {(dragPreviewBounds || selectedBounds) && selectedEffectLayer && (
        <>
          {/* Selection border */}
          <div
            style={{
              position: 'absolute',
              left: (dragPreviewBounds ?? selectedBounds!).x,
              top: (dragPreviewBounds ?? selectedBounds!).y,
              width: (dragPreviewBounds ?? selectedBounds!).width,
              height: (dragPreviewBounds ?? selectedBounds!).height,
              border: `2px solid ${PRIMARY_COLOR}`,
              cursor: 'move',
              zIndex: 10,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 10px 30px rgba(0,0,0,0.25)',
              pointerEvents: 'auto',
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
          />

          {/* Resize handles (only if resizable) */}
          {canResize && (
            <>
              {renderHandle('top-left', dragPreviewBounds ?? selectedBounds!)}
              {renderHandle('top', dragPreviewBounds ?? selectedBounds!)}
              {renderHandle('top-right', dragPreviewBounds ?? selectedBounds!)}
              {renderHandle('right', dragPreviewBounds ?? selectedBounds!)}
              {renderHandle('bottom-right', dragPreviewBounds ?? selectedBounds!)}
              {renderHandle('bottom', dragPreviewBounds ?? selectedBounds!)}
              {renderHandle('bottom-left', dragPreviewBounds ?? selectedBounds!)}
              {renderHandle('left', dragPreviewBounds ?? selectedBounds!)}
            </>
          )}

          {/* Position info badge */}
          <div
            style={{
              position: 'absolute',
              left: (dragPreviewBounds ?? selectedBounds!).x + (dragPreviewBounds ?? selectedBounds!).width / 2,
              top: (dragPreviewBounds ?? selectedBounds!).y - 28,
              transform: 'translateX(-50%)',
              padding: '4px 8px',
              backgroundColor: 'rgba(0,0,0,0.75)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 11,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(6px)',
              zIndex: 30,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {badgeText}
          </div>
        </>
      )}
    </AbsoluteFill>
  )
}
