'use client'

import React, { useCallback, useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Check, RotateCcw } from 'lucide-react'
import type { CropEffectData } from '@/types/project'
import { clampCropData } from '@/remotion/compositions/utils/transforms/crop-transform'

interface CropOverlayProps {
  /** Current crop data (0-1 normalized) */
  cropData: CropEffectData
  /** Called when crop changes during drag */
  onCropChange: (cropData: CropEffectData) => void
  /** Called when user confirms the crop */
  onConfirm: () => void
  /** Called when user resets/cancels the crop */
  onReset: () => void
  /** Video display dimensions */
  videoRect: {
    x: number
    y: number
    width: number
    height: number
  }
}

type HandlePosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'

const HANDLE_SIZE = 12

export function CropOverlay({
  cropData,
  onCropChange,
  onConfirm,
  onReset,
  videoRect,
}: CropOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState<'move' | HandlePosition | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialCrop, setInitialCrop] = useState(cropData)

  // Convert crop data to pixel coordinates
  const cropRect = {
    x: videoRect.x + cropData.x * videoRect.width,
    y: videoRect.y + cropData.y * videoRect.height,
    width: cropData.width * videoRect.width,
    height: cropData.height * videoRect.height,
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, type: 'move' | HandlePosition) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      setDragType(type)
      setDragStart({ x: e.clientX, y: e.clientY })
      setInitialCrop(cropData)
    },
    [cropData]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragType) return

      const deltaX = (e.clientX - dragStart.x) / videoRect.width
      const deltaY = (e.clientY - dragStart.y) / videoRect.height

      let newCrop = { ...initialCrop }

      if (dragType === 'move') {
        // Move the entire crop region
        newCrop.x = initialCrop.x + deltaX
        newCrop.y = initialCrop.y + deltaY
      } else {
        // Resize based on handle position
        switch (dragType) {
          case 'top-left':
            newCrop.x = initialCrop.x + deltaX
            newCrop.y = initialCrop.y + deltaY
            newCrop.width = initialCrop.width - deltaX
            newCrop.height = initialCrop.height - deltaY
            break
          case 'top':
            newCrop.y = initialCrop.y + deltaY
            newCrop.height = initialCrop.height - deltaY
            break
          case 'top-right':
            newCrop.y = initialCrop.y + deltaY
            newCrop.width = initialCrop.width + deltaX
            newCrop.height = initialCrop.height - deltaY
            break
          case 'right':
            newCrop.width = initialCrop.width + deltaX
            break
          case 'bottom-right':
            newCrop.width = initialCrop.width + deltaX
            newCrop.height = initialCrop.height + deltaY
            break
          case 'bottom':
            newCrop.height = initialCrop.height + deltaY
            break
          case 'bottom-left':
            newCrop.x = initialCrop.x + deltaX
            newCrop.width = initialCrop.width - deltaX
            newCrop.height = initialCrop.height + deltaY
            break
          case 'left':
            newCrop.x = initialCrop.x + deltaX
            newCrop.width = initialCrop.width - deltaX
            break
        }
      }

      // Clamp to valid bounds
      newCrop = clampCropData(newCrop)
      onCropChange(newCrop)
    },
    [isDragging, dragType, dragStart, initialCrop, videoRect, onCropChange]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragType(null)
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

  // Handle cursor style based on handle position
  const getCursor = (position: HandlePosition): string => {
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

  // Render a drag handle
  const renderHandle = (position: HandlePosition) => {
    let left = 0
    let top = 0

    switch (position) {
      case 'top-left':
        left = cropRect.x - HANDLE_SIZE / 2
        top = cropRect.y - HANDLE_SIZE / 2
        break
      case 'top':
        left = cropRect.x + cropRect.width / 2 - HANDLE_SIZE / 2
        top = cropRect.y - HANDLE_SIZE / 2
        break
      case 'top-right':
        left = cropRect.x + cropRect.width - HANDLE_SIZE / 2
        top = cropRect.y - HANDLE_SIZE / 2
        break
      case 'right':
        left = cropRect.x + cropRect.width - HANDLE_SIZE / 2
        top = cropRect.y + cropRect.height / 2 - HANDLE_SIZE / 2
        break
      case 'bottom-right':
        left = cropRect.x + cropRect.width - HANDLE_SIZE / 2
        top = cropRect.y + cropRect.height - HANDLE_SIZE / 2
        break
      case 'bottom':
        left = cropRect.x + cropRect.width / 2 - HANDLE_SIZE / 2
        top = cropRect.y + cropRect.height - HANDLE_SIZE / 2
        break
      case 'bottom-left':
        left = cropRect.x - HANDLE_SIZE / 2
        top = cropRect.y + cropRect.height - HANDLE_SIZE / 2
        break
      case 'left':
        left = cropRect.x - HANDLE_SIZE / 2
        top = cropRect.y + cropRect.height / 2 - HANDLE_SIZE / 2
        break
    }

    return (
      <div
        key={position}
        className="absolute bg-white border-2 border-primary rounded-sm shadow-md z-20"
        style={{
          left,
          top,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          cursor: getCursor(position),
        }}
        onMouseDown={(e) => handleMouseDown(e, position)}
      />
    )
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-50"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Darkened regions outside crop */}
      {/* Top */}
      <div
        className="absolute bg-black/60"
        style={{
          left: videoRect.x,
          top: videoRect.y,
          width: videoRect.width,
          height: Math.max(0, cropRect.y - videoRect.y),
        }}
      />
      {/* Bottom */}
      <div
        className="absolute bg-black/60"
        style={{
          left: videoRect.x,
          top: cropRect.y + cropRect.height,
          width: videoRect.width,
          height: Math.max(0, videoRect.y + videoRect.height - (cropRect.y + cropRect.height)),
        }}
      />
      {/* Left */}
      <div
        className="absolute bg-black/60"
        style={{
          left: videoRect.x,
          top: cropRect.y,
          width: Math.max(0, cropRect.x - videoRect.x),
          height: cropRect.height,
        }}
      />
      {/* Right */}
      <div
        className="absolute bg-black/60"
        style={{
          left: cropRect.x + cropRect.width,
          top: cropRect.y,
          width: Math.max(0, videoRect.x + videoRect.width - (cropRect.x + cropRect.width)),
          height: cropRect.height,
        }}
      />

      {/* Crop region border */}
      <div
        className="absolute border-2 border-primary z-10"
        style={{
          left: cropRect.x,
          top: cropRect.y,
          width: cropRect.width,
          height: cropRect.height,
          cursor: 'move',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        {/* Grid lines for visual guidance */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Vertical thirds */}
          <div
            className="absolute top-0 bottom-0 border-l border-white/30"
            style={{ left: '33.33%' }}
          />
          <div
            className="absolute top-0 bottom-0 border-l border-white/30"
            style={{ left: '66.67%' }}
          />
          {/* Horizontal thirds */}
          <div
            className="absolute left-0 right-0 border-t border-white/30"
            style={{ top: '33.33%' }}
          />
          <div
            className="absolute left-0 right-0 border-t border-white/30"
            style={{ top: '66.67%' }}
          />
        </div>
      </div>

      {/* Resize handles */}
      {renderHandle('top-left')}
      {renderHandle('top')}
      {renderHandle('top-right')}
      {renderHandle('right')}
      {renderHandle('bottom-right')}
      {renderHandle('bottom')}
      {renderHandle('bottom-left')}
      {renderHandle('left')}

      {/* Crop info display */}
      <div
        className="absolute px-2 py-1 bg-black/80 text-white text-xs rounded font-mono z-30"
        style={{
          left: cropRect.x + cropRect.width / 2,
          top: cropRect.y - 28,
          transform: 'translateX(-50%)',
        }}
      >
        {Math.round(cropData.width * 100)}% x {Math.round(cropData.height * 100)}%
      </div>

      {/* Action buttons */}
      <div
        className="absolute flex gap-2 z-30"
        style={{
          left: '50%',
          bottom: 20,
          transform: 'translateX(-50%)',
        }}
      >
        <Button
          onClick={onConfirm}
          className="gap-2"
        >
          <Check className="w-4 h-4" />
          Confirm
        </Button>
        <Button
          variant="outline"
          onClick={onReset}
          className="gap-2 bg-background/80"
        >
          <RotateCcw className="w-4 h-4" />
          Reset crop
        </Button>
      </div>
    </div>
  )
}
