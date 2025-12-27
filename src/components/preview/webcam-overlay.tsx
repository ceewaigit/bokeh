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

import React, { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Effect, WebcamEffectData } from '@/types/project'
import { getWebcamEffect } from '@/lib/effects/effect-filters'
import { DEFAULT_WEBCAM_DATA } from '@/lib/constants/default-effects'
import { getWebcamLayout } from '@/lib/effects/utils/webcam-layout'

interface WebcamOverlayProps {
  effects: Effect[]
  containerWidth: number
  containerHeight: number
  isSelected?: boolean
  onSelect?: () => void
  className?: string
}

export function WebcamOverlay({
  effects,
  containerWidth,
  containerHeight,
  isSelected = false,
  onSelect,
  className
}: WebcamOverlayProps) {
  // Get webcam effect data
  const webcamEffect = getWebcamEffect(effects)
  const data: WebcamEffectData = (webcamEffect?.data as WebcamEffectData) ?? DEFAULT_WEBCAM_DATA

  // Don't render if webcam effect is disabled
  if (!webcamEffect || webcamEffect.enabled === false) {
    return null
  }

  const layout = useMemo(() => {
    const next = getWebcamLayout(data, containerWidth, containerHeight)
    return {
      x: Math.round(next.x),
      y: Math.round(next.y),
      size: Math.round(next.size),
    }
  }, [data, containerWidth, containerHeight])

  const handleSize = Math.max(22, Math.round(layout.size * 0.22))
  const handleX = layout.x + layout.size / 2 - handleSize / 2
  const handleY = layout.y + layout.size / 2 - handleSize / 2

  return (
    <button
      type="button"
      className={cn("absolute select-none", className)}
      style={{
        left: handleX,
        top: handleY,
        width: handleSize,
        height: handleSize,
        zIndex: 60,
      }}
      aria-pressed={isSelected}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.()
      }}
    >
      <span className="sr-only">Select webcam overlay</span>
    </button>
  )
}
