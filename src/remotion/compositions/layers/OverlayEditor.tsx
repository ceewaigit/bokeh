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
import { EffectType, EffectLayerType } from '@/types/effects'
import type { Effect } from '@/types/project'
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

  // Drag state
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState<'move' | HandlePosition | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialPosition, setInitialPosition] = useState<PositionData | null>(null)

  // Get the video rect from VideoPositionContext
  const videoRect: VideoRect = {
    x: videoPosition.offsetX,
    y: videoPosition.offsetY,
    width: videoPosition.drawWidth,
    height: videoPosition.drawHeight,
  }

  const editingOverlayPosition = useMemo(() => {
    if (!editingOverlayId) return null
    const effect = effects.find((e) => e.id === editingOverlayId)
    if (!effect) return null
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

  // Get bounds of selected effect
  const selectedBounds = selectedEffect
    ? getEffectBounds(selectedEffect, videoRect)
    : null

  // Check if selected effect is resizable
  const canResize = selectedEffect ? isResizableEffect(selectedEffect) : false

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
      if (!isDragging || !dragType || !initialPosition || !editingOverlayId) return

      const delta = deltaToPercent(
        e.clientX - dragStart.x,
        e.clientY - dragStart.y,
        videoRect
      )

      let newPosition = { ...initialPosition }

      if (dragType === 'move') {
        // Move: update x and y
        newPosition.x = initialPosition.x + delta.x
        newPosition.y = initialPosition.y + delta.y
      } else {
        // Resize: update based on handle
        // For now, we'll handle resize by adjusting width/height
        // This is a simplified version - full implementation would need
        // to handle each handle direction properly
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
      // Update effect position in store
      updateEffect(editingOverlayId, {
        data: { position: { x: newPosition.x, y: newPosition.y, width: newPosition.width, height: newPosition.height } },
      })
    },
    [isDragging, dragType, dragStart, initialPosition, editingOverlayId, videoRect, updateEffect]
  )

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragType(null)
    setInitialPosition(null)
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
          if (!effectId || !editingOverlayPosition) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const step = e.shiftKey ? 10 : 1

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
          {
            const newPos = clampPosition({
              ...editingOverlayPosition,
              y: editingOverlayPosition.y - step
            })
            updateEffect(effectId, {
              data: { position: { x: newPos.x, y: newPos.y, width: newPos.width, height: newPos.height } }
            })
          }
          break

        case 'ArrowDown':
          e.preventDefault()
          {
            const newPos = clampPosition({
              ...editingOverlayPosition,
              y: editingOverlayPosition.y + step
            })
            updateEffect(effectId, {
              data: { position: { x: newPos.x, y: newPos.y, width: newPos.width, height: newPos.height } }
            })
          }
          break

        case 'ArrowLeft':
          e.preventDefault()
          {
            const newPos = clampPosition({
              ...editingOverlayPosition,
              x: editingOverlayPosition.x - step
            })
            updateEffect(effectId, {
              data: { position: { x: newPos.x, y: newPos.y, width: newPos.width, height: newPos.height } }
            })
          }
          break

        case 'ArrowRight':
          e.preventDefault()
          {
            const newPos = clampPosition({
              ...editingOverlayPosition,
              x: editingOverlayPosition.x + step
            })
            updateEffect(effectId, {
              data: { position: { x: newPos.x, y: newPos.y, width: newPos.width, height: newPos.height } }
            })
          }
          break

        case 'Escape':
          e.preventDefault()
          clearEffectSelection()
          stopEditingOverlay()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedEffectLayer, editingOverlayPosition, updateEffect, clearEffectSelection, stopEditingOverlay])

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

          // Get effect position for editing
          const bounds = getEffectBounds(effect, videoRect)
          if (bounds) {
            const position: PositionData = {
              x: ((bounds.x + bounds.width / 2 - videoRect.x) / videoRect.width) * 100,
              y: ((bounds.y + bounds.height / 2 - videoRect.y) / videoRect.height) * 100,
              width: bounds.width,
              height: bounds.height,
            }
            startEditingOverlay(effect.id)
          }
        }
      } else {
        // Click on empty area - deselect
        clearEffectSelection()
        stopEditingOverlay()
      }
    },
    [effects, videoRect, selectedEffectLayer, isDragging, selectEffectLayer, clearEffectSelection, startEditingOverlay, stopEditingOverlay]
  )

  // Handle mouse down on selection box or handles
  const handleMouseDown = (e: React.MouseEvent, type: 'move' | HandlePosition) => {
    e.preventDefault()
    e.stopPropagation()

    if (!editingOverlayPosition) return

    setIsDragging(true)
    setDragType(type)
    setDragStart({ x: e.clientX, y: e.clientY })
    setInitialPosition(editingOverlayPosition)
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
            {editingOverlayPosition
              ? `${Math.round(editingOverlayPosition.x)}%, ${Math.round(editingOverlayPosition.y)}%`
              : 'Selected'
            }
          </div>
        </>
      )}
    </AbsoluteFill>
  )
}
