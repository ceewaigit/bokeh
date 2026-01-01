/**
 * SelectionOverlay - Renders selection box INSIDE the video transform container
 *
 * This component renders alongside annotations, inheriting all CSS transforms
 * (zoom, pan, rotation) naturally. No manual transform calculations needed.
 *
 * Handles are inverse-scaled to maintain constant visual size regardless of zoom.
 */

import React, { memo, useMemo } from 'react'
import type { Effect, AnnotationData } from '@/types/project'
import { AnnotationType } from '@/types/project'
import { measureAnnotationBox } from '@/lib/canvas-editor/annotation-utils'
import { useVideoPosition } from '@/remotion/context/layout/VideoPositionContext'
import { percentToPixels } from '@/lib/canvas-editor/coordinate-utils'

interface SelectionOverlayProps {
  effect: Effect
  videoWidth: number
  videoHeight: number
}

const HANDLE_SIZE = 10 // Base size in pixels
const ROTATION_HANDLE_DISTANCE = 24 // Distance above selection box

export const SelectionOverlay: React.FC<SelectionOverlayProps> = memo(({
  effect,
  videoWidth,
  videoHeight,
}) => {
  const videoPosition = useVideoPosition()
  const data = effect.data as AnnotationData

  // Identify anchor type - Highlight is top-left, everything else is center
  const isTopLeftAnchor = data.type === AnnotationType.Highlight

  // Calculate pixel bounds matching AnnotationElement logic
  const bounds = useMemo(() => {
    const pos = data.position ?? { x: 50, y: 50 }

    // 1. Calculate base size in pixels
    let width = 0
    let height = 0

    if (data.type === AnnotationType.Highlight) {
      width = ((data.width ?? 20) / 100) * videoWidth
      height = ((data.height ?? 10) / 100) * videoHeight
    } else if (data.type === AnnotationType.Arrow) {
      // Arrow logic mimicking ArrowAnnotation calculation
      const startX = (pos.x / 100) * videoWidth
      const startY = (pos.y / 100) * videoHeight

      const endPos = data.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }
      const endX = (endPos.x / 100) * videoWidth
      const endY = (endPos.y / 100) * videoHeight

      const padding = 10
      const minX = Math.min(startX, endX) - padding
      const minY = Math.min(startY, endY) - padding
      const boxW = Math.abs(endX - startX) + padding * 2
      const boxH = Math.abs(endY - startY) + padding * 2

      return {
        x: minX + boxW / 2, // Center X
        y: minY + boxH / 2, // Center Y
        width: boxW,
        height: boxH,
        rotation: data.rotation ?? 0
      }
    } else {
      // Text / Keyboard
      const measured = measureAnnotationBox(data)
      width = measured.width
      height = measured.height
    }

    // 2. Calculate position
    const videoRect = { x: 0, y: 0, width: videoWidth, height: videoHeight }
    const pixelPos = percentToPixels(pos.x, pos.y, videoRect)

    return {
      x: pixelPos.x,
      y: pixelPos.y,
      width,
      height,
      rotation: data.rotation ?? 0
    }
  }, [data, videoWidth, videoHeight])

  // Get zoom scale for inverse-scaling handles
  const zoomScale = (videoPosition.zoomTransform as any)?.scale ?? 1

  // Inverse scale - handles stay constant size regardless of zoom
  const inverseScale = 1 / zoomScale
  const handleSize = HANDLE_SIZE * inverseScale
  const borderWidth = 1.5 * inverseScale
  const rotationDistance = ROTATION_HANDLE_DISTANCE * inverseScale

  const borderColor = '#3b82f6'

  // Handle positions (relative to box)
  const handles = [
    { id: 'top-left', x: 0, y: 0, cursor: 'nwse-resize' },
    { id: 'top', x: '50%', y: 0, cursor: 'ns-resize' },
    { id: 'top-right', x: '100%', y: 0, cursor: 'nesw-resize' },
    { id: 'right', x: '100%', y: '50%', cursor: 'ew-resize' },
    { id: 'bottom-right', x: '100%', y: '100%', cursor: 'nwse-resize' },
    { id: 'bottom', x: '50%', y: '100%', cursor: 'ns-resize' },
    { id: 'bottom-left', x: 0, y: '100%', cursor: 'nesw-resize' },
    { id: 'left', x: 0, y: '50%', cursor: 'ew-resize' },
  ]

  // Position styles
  const positionStyles: React.CSSProperties = isTopLeftAnchor
    ? {
      // Highlight: postion is top-left corner
      left: bounds.x,
      top: bounds.y,
      transform: bounds.rotation !== 0 ? `rotate(${bounds.rotation}deg)` : undefined,
      transformOrigin: 'center center',
    }
    : {
      // Center anchor
      left: bounds.x,
      top: bounds.y,
      transform: `translate(-50%, -50%)${bounds.rotation !== 0 ? ` rotate(${bounds.rotation}deg)` : ''}`,
      transformOrigin: 'center center',
    }

  return (
    <div
      data-selection-overlay={effect.id}
      style={{
        position: 'absolute',
        ...positionStyles,
        width: bounds.width,
        height: bounds.height,
        border: `${borderWidth}px solid ${borderColor}`,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {/* Resize Handles */}
      {handles.map((handle) => (
        <div
          key={handle.id}
          data-handle={handle.id}
          style={{
            position: 'absolute',
            left: handle.x,
            top: handle.y,
            width: handleSize,
            height: handleSize,
            backgroundColor: 'white',
            border: `${inverseScale}px solid ${borderColor}`,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            cursor: handle.cursor,
            pointerEvents: 'auto',
            boxSizing: 'border-box',
          }}
        />
      ))}

      {/* Rotation Handle Connector */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: inverseScale,
          height: rotationDistance,
          backgroundColor: borderColor,
          transform: 'translateX(-50%) translateY(-100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Rotation Handle */}
      <div
        data-handle="rotate"
        style={{
          position: 'absolute',
          left: '50%',
          top: -rotationDistance,
          width: handleSize,
          height: handleSize,
          backgroundColor: 'white',
          border: `${inverseScale}px solid ${borderColor}`,
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          cursor: 'grab',
          pointerEvents: 'auto',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
})

SelectionOverlay.displayName = 'SelectionOverlay'
