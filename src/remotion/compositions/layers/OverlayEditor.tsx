'use client'

/**
 * OverlayEditor - Unified drag/resize for positioned elements
 *
 * Canva-style editor for plugins, annotations, and webcam overlays.
 * Based on CropEditingLayer pattern: uses VideoPositionContext,
 * window-level mouse listeners, and normalized 0-100% coordinates.
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { AbsoluteFill, getRemotionEnvironment } from 'remotion'
import { useVideoPosition } from '../../context/layout/VideoPositionContext'
import { useProjectStore } from '@/stores/project-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { EffectType, EffectLayerType } from '@/types/effects'
import type { Effect, AnnotationData } from '@/types/project'
import { AnnotationType } from '@/types/project'
import { getDefaultAnnotationSize } from '@/lib/annotations/annotation-defaults'
import {
  hitTestEffects,
  getEffectBounds,
  isPositionableEffect,
  isResizableEffect,
  getHandleCursor,
  type HandlePosition,
  type EffectBounds,
} from '@/lib/canvas-editor/hit-testing'
import {
  deltaToPercent,
  clampPosition,
  type PositionData,
  type VideoRect,
} from '@/lib/canvas-editor/coordinate-utils'

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
  type: AnnotationType
  position: { x: number; y: number }
  endPosition?: { x: number; y: number }
  width?: number
  height?: number
}

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

  // Drag state
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState<'move' | HandlePosition | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialPosition, setInitialPosition] = useState<PositionData | null>(null)
  const [initialAnnotation, setInitialAnnotation] = useState<AnnotationDragState | null>(null)
  const [dragEffectType, setDragEffectType] = useState<EffectType | null>(null)

  // Get the video rect from VideoPositionContext
  const videoRect: VideoRect = {
    x: videoPosition.offsetX,
    y: videoPosition.offsetY,
    width: videoPosition.drawWidth,
    height: videoPosition.drawHeight,
  }

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

  // Get the selected effect
  const selectedEffect = selectedEffectLayer?.id
    ? effects.find((e) => e.id === selectedEffectLayer.id)
    : null
  const selectedAnnotationData = selectedEffect?.type === EffectType.Annotation
    ? (selectedEffect.data as AnnotationData)
    : null

  // Get bounds of selected effect
  const selectedBounds = selectedEffect
    ? getEffectBounds(selectedEffect, videoRect)
    : null

  // Check if selected effect is resizable
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
  // Note: Webcam is handled separately via WebcamLayer, not OverlayEditor
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

  // Handle mouse move during drag
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragType || !editingOverlayId || !dragEffectType) return

      const delta = deltaToPercent(
        e.clientX - dragStart.x,
        e.clientY - dragStart.y,
        videoRect
      )

      if (dragEffectType === EffectType.Annotation && initialAnnotation) {
        const basePosition = initialAnnotation.position
        const fallback = getDefaultAnnotationSize(initialAnnotation.type)
        const baseWidth = initialAnnotation.width ?? fallback.width ?? 20
        const baseHeight = initialAnnotation.height ?? fallback.height ?? 10

        if (dragType === 'move') {
          if (initialAnnotation.type === AnnotationType.Arrow) {
            const baseEnd = initialAnnotation.endPosition ?? {
              x: basePosition.x + 10,
              y: basePosition.y + 10,
            }
            const start = clampPoint({
              x: basePosition.x + delta.x,
              y: basePosition.y + delta.y,
            })
            const end = clampPoint({
              x: baseEnd.x + delta.x,
              y: baseEnd.y + delta.y,
            })
            updateEffect(editingOverlayId, {
              data: { position: start, endPosition: end },
            })
            return
          }

          if (initialAnnotation.type === AnnotationType.Highlight) {
            const clamped = clampHighlightBox(
              { x: basePosition.x + delta.x, y: basePosition.y + delta.y },
              baseWidth,
              baseHeight
            )
            updateEffect(editingOverlayId, {
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
          updateEffect(editingOverlayId, { data: { position: next } })
          return
        }

        if (initialAnnotation.type !== AnnotationType.Highlight) return

        let nextX = basePosition.x
        let nextY = basePosition.y
        let nextWidth = baseWidth
        let nextHeight = baseHeight

        switch (dragType) {
          case 'bottom-right':
            nextWidth = baseWidth + delta.x
            nextHeight = baseHeight + delta.y
            break
          case 'bottom-left':
            nextX = basePosition.x + delta.x
            nextWidth = baseWidth - delta.x
            nextHeight = baseHeight + delta.y
            break
          case 'top-right':
            nextY = basePosition.y + delta.y
            nextWidth = baseWidth + delta.x
            nextHeight = baseHeight - delta.y
            break
          case 'top-left':
            nextX = basePosition.x + delta.x
            nextY = basePosition.y + delta.y
            nextWidth = baseWidth - delta.x
            nextHeight = baseHeight - delta.y
            break
          case 'right':
            nextWidth = baseWidth + delta.x
            break
          case 'left':
            nextX = basePosition.x + delta.x
            nextWidth = baseWidth - delta.x
            break
          case 'bottom':
            nextHeight = baseHeight + delta.y
            break
          case 'top':
            nextY = basePosition.y + delta.y
            nextHeight = baseHeight - delta.y
            break
        }

        const clamped = clampHighlightBox({ x: nextX, y: nextY }, nextWidth, nextHeight)
        updateEffect(editingOverlayId, {
          data: {
            position: { x: clamped.x, y: clamped.y },
            width: clamped.width,
            height: clamped.height,
          },
        })
        return
      }

      if (!initialPosition) return

      let newPosition = { ...initialPosition }

      if (dragType === 'move') {
        newPosition.x = initialPosition.x + delta.x
        newPosition.y = initialPosition.y + delta.y
      } else {
        switch (dragType) {
          case 'bottom-right':
            newPosition.width = (initialPosition.width ?? 100) + delta.x
            newPosition.height = (initialPosition.height ?? 100) + delta.y
            break
          case 'bottom-left':
            newPosition.x = initialPosition.x + delta.x
            newPosition.width = (initialPosition.width ?? 100) - delta.x
            newPosition.height = (initialPosition.height ?? 100) + delta.y
            break
          case 'top-right':
            newPosition.y = initialPosition.y + delta.y
            newPosition.width = (initialPosition.width ?? 100) + delta.x
            newPosition.height = (initialPosition.height ?? 100) - delta.y
            break
          case 'top-left':
            newPosition.x = initialPosition.x + delta.x
            newPosition.y = initialPosition.y + delta.y
            newPosition.width = (initialPosition.width ?? 100) - delta.x
            newPosition.height = (initialPosition.height ?? 100) - delta.y
            break
          case 'right':
            newPosition.width = (initialPosition.width ?? 100) + delta.x
            break
          case 'left':
            newPosition.x = initialPosition.x + delta.x
            newPosition.width = (initialPosition.width ?? 100) - delta.x
            break
          case 'bottom':
            newPosition.height = (initialPosition.height ?? 100) + delta.y
            break
          case 'top':
            newPosition.y = initialPosition.y + delta.y
            newPosition.height = (initialPosition.height ?? 100) - delta.y
            break
        }
      }

      newPosition = clampPosition(newPosition)
      updateEffect(editingOverlayId, {
        data: {
          position: {
            x: newPosition.x,
            y: newPosition.y,
            width: newPosition.width,
            height: newPosition.height,
          },
        },
      })
    },
    [
      isDragging,
      dragType,
      dragStart,
      initialAnnotation,
      initialPosition,
      editingOverlayId,
      dragEffectType,
      videoRect,
      updateEffect,
    ]
  )

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragType(null)
    setInitialPosition(null)
    setInitialAnnotation(null)
    setDragEffectType(null)
  }, [])

  // Global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Keyboard shortcuts (only when element selected)
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

  // Handle click on canvas (selection)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return

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
        // Select the effect
        const effect = effects.find((e) => e.id === hit.effectId)
        if (effect) {
          selectEffectLayer(effectTypeToLayerType(effect.type), effect.id)
          startEditingOverlay(effect.id)
          if (!isPropertiesOpen) {
            toggleProperties()
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
      isDragging,
      selectEffectLayer,
      clearEffectSelection,
      startEditingOverlay,
      stopEditingOverlay,
      isPropertiesOpen,
      toggleProperties,
    ]
  )

  // Handle mouse down on selection box or handles
  const handleMouseDown = (e: React.MouseEvent, type: 'move' | HandlePosition) => {
    e.preventDefault()
    e.stopPropagation()

    if (!selectedEffect) return

    if (selectedEffect.type === EffectType.Annotation) {
      const data = selectedEffect.data as AnnotationData
      if (!data.position) return
      const fallback = getDefaultAnnotationSize(data.type ?? AnnotationType.Text)
      setInitialAnnotation({
        type: data.type ?? AnnotationType.Text,
        position: data.position,
        endPosition: data.endPosition,
        width: data.width ?? fallback.width,
        height: data.height ?? fallback.height,
      })
      setInitialPosition(null)
    } else {
      if (!pluginEditingPosition) return
      setInitialPosition(pluginEditingPosition)
      setInitialAnnotation(null)
    }

    setIsDragging(true)
    setDragType(type)
    setDragStart({ x: e.clientX, y: e.clientY })
    setDragEffectType(selectedEffect.type)
  }

  // Get cursor for handle position
  const getCursor = (position: HandlePosition): string => getHandleCursor(position)

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
      onClick={handleCanvasClick}
      style={{
        zIndex: 999,
        pointerEvents: 'auto',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Selection box for selected effect */}
      {selectedBounds && selectedEffectLayer && (
        <>
          {/* Selection border */}
          <div
            style={{
              position: 'absolute',
              left: selectedBounds.x,
              top: selectedBounds.y,
              width: selectedBounds.width,
              height: selectedBounds.height,
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
              {renderHandle('top-left', selectedBounds)}
              {renderHandle('top', selectedBounds)}
              {renderHandle('top-right', selectedBounds)}
              {renderHandle('right', selectedBounds)}
              {renderHandle('bottom-right', selectedBounds)}
              {renderHandle('bottom', selectedBounds)}
              {renderHandle('bottom-left', selectedBounds)}
              {renderHandle('left', selectedBounds)}
            </>
          )}

          {/* Position info badge */}
          <div
            style={{
              position: 'absolute',
              left: selectedBounds.x + selectedBounds.width / 2,
              top: selectedBounds.y - 28,
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
