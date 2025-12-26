'use client'

/**
 * WebcamOverlay - Interactive webcam position/size editor for preview
 *
 * Features:
 * - Draggable positioning
 * - Visual representation of webcam shape, border, and shadow
 * - Shows edit handles when webcam effect is selected
 * - Smooth animations with Framer Motion
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Effect, WebcamEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import { getWebcamEffect } from '@/lib/effects/effect-filters'
import { DEFAULT_WEBCAM_DATA, WEBCAM_POSITION_PRESETS } from '@/lib/constants/default-effects'
import { Video, Move, Maximize2 } from 'lucide-react'

interface WebcamOverlayProps {
  effects: Effect[]
  containerWidth: number
  containerHeight: number
  isSelected?: boolean
  onSelect?: () => void
  onUpdatePosition?: (position: WebcamEffectData['position']) => void
  onUpdateSize?: (size: number) => void
  className?: string
}

export function WebcamOverlay({
  effects,
  containerWidth,
  containerHeight,
  isSelected = false,
  onSelect,
  onUpdatePosition,
  onUpdateSize,
  className
}: WebcamOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Get webcam effect data
  const webcamEffect = getWebcamEffect(effects)
  const data: WebcamEffectData = (webcamEffect?.data as WebcamEffectData) ?? DEFAULT_WEBCAM_DATA

  // Don't render if webcam effect is disabled
  if (!webcamEffect || webcamEffect.enabled === false) {
    return null
  }

  // Calculate dimensions
  const webcamWidth = (data.size / 100) * containerWidth
  const webcamHeight = webcamWidth // Square aspect

  // Calculate position
  let left = (data.position.x / 100) * containerWidth
  let top = (data.position.y / 100) * containerHeight

  // Adjust based on anchor
  switch (data.position.anchor) {
    case 'top-center':
      left -= webcamWidth / 2
      break
    case 'top-right':
      left -= webcamWidth
      break
    case 'center-left':
      top -= webcamHeight / 2
      break
    case 'center':
      left -= webcamWidth / 2
      top -= webcamHeight / 2
      break
    case 'center-right':
      left -= webcamWidth
      top -= webcamHeight / 2
      break
    case 'bottom-left':
      top -= webcamHeight
      break
    case 'bottom-center':
      left -= webcamWidth / 2
      top -= webcamHeight
      break
    case 'bottom-right':
      left -= webcamWidth
      top -= webcamHeight
      break
  }

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    e.preventDefault()
    e.stopPropagation()

    const rect = containerRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setIsDragging(true)
    onSelect?.()
  }, [onSelect])

  // Handle drag
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current?.parentElement) return

      const parentRect = containerRef.current.parentElement.getBoundingClientRect()
      let newX = e.clientX - parentRect.left - dragOffset.x + webcamWidth / 2
      let newY = e.clientY - parentRect.top - dragOffset.y + webcamHeight / 2

      // Clamp to container bounds
      newX = Math.max(0, Math.min(containerWidth, newX))
      newY = Math.max(0, Math.min(containerHeight, newY))

      // Convert to percentage
      const xPercent = (newX / containerWidth) * 100
      const yPercent = (newY / containerHeight) * 100

      // Snap to grid if close
      const snapThreshold = 5
      let anchor = data.position.anchor

      // Check for anchor snapping
      for (const [key, preset] of Object.entries(WEBCAM_POSITION_PRESETS)) {
        if (Math.abs(xPercent - preset.x) < snapThreshold && Math.abs(yPercent - preset.y) < snapThreshold) {
          anchor = preset.anchor
          onUpdatePosition?.({ x: preset.x, y: preset.y, anchor })
          return
        }
      }

      onUpdatePosition?.({ x: xPercent, y: yPercent, anchor: 'center' })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset, containerWidth, containerHeight, webcamWidth, webcamHeight, data.position.anchor, onUpdatePosition])

  // Build styles based on effect data
  const shapeStyle: React.CSSProperties = {
    borderRadius: data.shape === 'circle' ? '50%' :
      data.shape === 'squircle' ? Math.min(data.cornerRadius, webcamWidth / 2) :
        data.cornerRadius,
  }

  const borderStyle: React.CSSProperties = data.borderEnabled ? {
    border: `${data.borderWidth}px solid ${data.borderColor}`,
  } : {}

  const shadowStyle: React.CSSProperties = data.shadowEnabled ? {
    boxShadow: `${data.shadowOffsetX}px ${data.shadowOffsetY}px ${data.shadowBlur}px ${data.shadowColor}`,
  } : {}

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        "absolute cursor-move select-none",
        isSelected && "ring-2 ring-primary ring-offset-2",
        className
      )}
      style={{
        left,
        top,
        width: webcamWidth,
        height: webcamHeight,
        ...shapeStyle,
        ...borderStyle,
        ...shadowStyle,
        opacity: data.opacity,
        overflow: 'hidden',
        zIndex: 50,
      }}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: data.opacity }}
      whileHover={{ scale: 1.02 }}
      onMouseDown={handleDragStart}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.()
      }}
    >
      {/* Placeholder content */}
      <div
        className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/30 to-pink-500/30"
        style={{
          transform: data.mirror ? 'scaleX(-1)' : 'none',
        }}
      >
        <Video className="w-8 h-8 text-white/60" />
      </div>

      {/* Edit handles (visible when selected) */}
      {isSelected && (
        <>
          {/* Move handle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-2 bg-primary/80 rounded-full text-white shadow-lg">
            <Move className="w-4 h-4" />
          </div>

          {/* Corner resize handles */}
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
            <div
              key={corner}
              className={cn(
                "absolute w-3 h-3 bg-white border-2 border-primary rounded-sm cursor-se-resize",
                corner === 'top-left' && "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
                corner === 'top-right' && "top-0 right-0 translate-x-1/2 -translate-y-1/2",
                corner === 'bottom-left' && "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
                corner === 'bottom-right' && "bottom-0 right-0 translate-x-1/2 translate-y-1/2"
              )}
              onMouseDown={(e) => {
                e.stopPropagation()
                // Resize handling would go here
              }}
            />
          ))}
        </>
      )}

      {/* Shape indicator */}
      {!isSelected && (
        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/50 rounded text-[9px] text-white/80 font-medium">
          {data.shape}
        </div>
      )}
    </motion.div>
  )
}
