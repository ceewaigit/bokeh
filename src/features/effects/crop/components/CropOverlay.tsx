'use client'

import React, { useRef, useCallback, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import type { CropEffectData } from '@/types/project'
import { clampCropData } from '@/features/rendering/canvas/math/transforms/crop-transform'
import { useCanvasDrag, type DragType, type CanvasDragDelta, type HandlePosition, getHandleCursorStyle } from '@/features/ui/editor/hooks/use-canvas-drag'

interface CropOverlayProps {
  /** Current crop data (0-1 normalized) */
  cropData: CropEffectData
  /** Called when crop changes - only called on drag end for performance */
  onCropChange: (cropData: CropEffectData) => void
  /** Called during drag for real-time preview (optional) */
  onCropPreview?: (cropData: CropEffectData) => void
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
  /** Show confirm/reset actions */
  showActions?: boolean
  /** Show crop info badge */
  showInfo?: boolean
}

const HANDLE_SIZE = 8
const PRIMARY_COLOR = 'hsl(var(--primary))'

// Very crisp, subtle shadow
const HANDLE_SHADOW = '0 1px 2px rgba(0,0,0,0.2)'

export function CropOverlay({
  cropData,
  onCropChange,
  onCropPreview,
  onConfirm,
  onReset,
  videoRect,
  showActions = true,
  showInfo = true,
}: CropOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // PERFORMANCE: Local transient state during drag operations
  // This prevents expensive store updates on every mouse move
  const [localCropData, setLocalCropData] = useState<CropEffectData>(cropData)
  const [isDragging, setIsDragging] = useState(false)
  const pendingCropRef = useRef<CropEffectData | null>(null)

  // Sync local state with prop when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalCropData(cropData)
    }
  }, [cropData, isDragging])

  // Use local state for visual rendering (smooth during drag)
  const displayCropData = localCropData

  // Convert crop data to pixel coordinates
  const cropRect = {
    x: videoRect.x + displayCropData.x * videoRect.width,
    y: videoRect.y + displayCropData.y * videoRect.height,
    width: displayCropData.width * videoRect.width,
    height: displayCropData.height * videoRect.height,
  }

  const handleDrag = useCallback(
    (delta: CanvasDragDelta, dragType: DragType, initialCrop: CropEffectData | null) => {
      if (!initialCrop) return

      setIsDragging(true)

      const deltaX = delta.x / videoRect.width
      const deltaY = delta.y / videoRect.height

      let newCrop = { ...initialCrop }

      if (dragType === 'move') {
        newCrop.x = initialCrop.x + deltaX
        newCrop.y = initialCrop.y + deltaY
      } else {
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

      newCrop = clampCropData(newCrop)
      // PERFORMANCE: Update local state only (no store update during drag)
      setLocalCropData(newCrop)
      pendingCropRef.current = newCrop
      // Fire preview callback for real-time visual feedback
      onCropPreview?.(newCrop)
    },
    [videoRect, onCropPreview]
  )

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    // Commit to store only once when drag ends
    if (pendingCropRef.current) {
      onCropChange(pendingCropRef.current)
      pendingCropRef.current = null
    }
  }, [onCropChange])

  const { startDrag } = useCanvasDrag<CropEffectData>({
    onDrag: handleDrag,
    onDragEnd: handleDragEnd,
  })

  const handleMouseDown = (e: React.MouseEvent, type: DragType) => {
    startDrag({
      startX: e.clientX,
      startY: e.clientY,
      type,
      initialValue: cropData,
      activationDistance: 0,
    })
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
        className="absolute z-20 transition-transform hover:scale-125"
        style={{
          left,
          top,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          backgroundColor: 'white',
          border: '1px solid rgba(0,0,0,0.15)',
          borderRadius: '50%',
          boxShadow: HANDLE_SHADOW,
          cursor: getHandleCursorStyle(position),
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
        className="absolute bg-black/50"
        style={{
          left: videoRect.x,
          top: videoRect.y,
          width: videoRect.width,
          height: Math.max(0, cropRect.y - videoRect.y),
        }}
      />
      {/* Bottom */}
      <div
        className="absolute bg-black/50"
        style={{
          left: videoRect.x,
          top: cropRect.y + cropRect.height,
          width: videoRect.width,
          height: Math.max(0, videoRect.y + videoRect.height - (cropRect.y + cropRect.height)),
        }}
      />
      {/* Left */}
      <div
        className="absolute bg-black/50"
        style={{
          left: videoRect.x,
          top: cropRect.y,
          width: Math.max(0, cropRect.x - videoRect.x),
          height: cropRect.height,
        }}
      />
      {/* Right */}
      <div
        className="absolute bg-black/50"
        style={{
          left: cropRect.x + cropRect.width,
          top: cropRect.y,
          width: Math.max(0, videoRect.x + videoRect.width - (cropRect.x + cropRect.width)),
          height: cropRect.height,
        }}
      />

      {/* Crop region border */}
      <div
        className="absolute z-10"
        style={{
          left: cropRect.x,
          top: cropRect.y,
          width: cropRect.width,
          height: cropRect.height,
          boxShadow: `inset 0 0 0 1px ${PRIMARY_COLOR}, 0 0 0 1px rgba(255,255,255,0.15)`,
          cursor: 'move',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        {/* Grid lines for visual guidance - minimal */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 bottom-0 border-l border-white/15" style={{ left: '33.33%' }} />
          <div className="absolute top-0 bottom-0 border-l border-white/15" style={{ left: '66.67%' }} />
          <div className="absolute left-0 right-0 border-t border-white/15" style={{ top: '33.33%' }} />
          <div className="absolute left-0 right-0 border-t border-white/15" style={{ top: '66.67%' }} />
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

      {showInfo && (
        <div
          className="absolute px-1.5 py-0.5 text-white/95 text-3xs rounded z-30 font-medium font-sans pointer-events-none"
          style={{
            left: cropRect.x + cropRect.width / 2,
            top: cropRect.y - 20,
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {Math.round(displayCropData.width * 100)} × {Math.round(displayCropData.height * 100)}
        </div>
      )}

      {showActions && (
        <div
          className="absolute flex items-center gap-1 z-30 p-0.5 rounded-lg border bg-[#1c1c1c] border-white/10 shadow-lg"
          style={{
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
          }}
        >
          <Button
            onClick={onConfirm}
            className="gap-2 h-6 text-2xs font-semibold px-3 rounded-md shadow-sm hover:brightness-110 active:scale-95 transition-all text-white border-0"
            style={{
              backgroundColor: PRIMARY_COLOR,
            }}
          >
            Confirm
          </Button>
          <Button
            variant="ghost"
            onClick={onReset}
            className="gap-2 h-6 text-2xs font-medium px-2 rounded-md text-white/80 hover:bg-white/10 hover:text-white active:scale-95 transition-all"
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  )
}
