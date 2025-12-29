'use client'

/**
 * WebcamOverlay - Interactive webcam selection affordance for preview
 *
 * Uses DOM-based positioning by querying the actual rendered webcam element.
 * This ensures the overlay always matches the webcam's visual position,
 * regardless of zoom, pan, or animation transforms.
 */

import React, { useMemo } from 'react'
import { cn } from '@/shared/utils/utils'
import type { Effect } from '@/types/project'
import { getWebcamEffect } from '@/features/effects/effect-filters'

interface WebcamOverlayProps {
  effects: Effect[]
  containerWidth: number
  containerHeight: number
  isSelected?: boolean
  onSelect?: () => void
  className?: string
  /** Ref to player container for DOM-based positioning */
  playerContainerRef?: React.RefObject<HTMLDivElement>
}

export function WebcamOverlay({
  effects,
  containerWidth,
  containerHeight,
  isSelected = false,
  onSelect,
  className,
  playerContainerRef,
}: WebcamOverlayProps) {
  // Get webcam effect to check if enabled
  const webcamEffect = getWebcamEffect(effects)

  // Don't render if webcam effect is disabled
  if (!webcamEffect || webcamEffect.enabled === false) {
    return null
  }

  // For now, we use a transparent button that covers where the webcam should be
  // The actual visual representation is the webcam layer itself
  // This is just for click affordance when the webcam is already visible

  // We don't need to calculate position - the DOM-based hit testing in 
  // preview-interactions.tsx handles detection. This component is purely
  // for visual affordance (e.g., selected state ring).

  // If we need to show a visual ring around the webcam when selected,
  // we can query the DOM for the webcam element position
  const webcamBounds = useMemo(() => {
    if (!playerContainerRef?.current) return null;
    const webcamEl = playerContainerRef.current.querySelector('[data-webcam-overlay="true"]');
    if (!webcamEl) return null;

    const containerEl = playerContainerRef.current.parentElement;
    if (!containerEl) return null;

    const webcamRect = webcamEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    return {
      x: webcamRect.left - containerRect.left,
      y: webcamRect.top - containerRect.top,
      width: webcamRect.width,
      height: webcamRect.height,
    };
  }, [playerContainerRef, containerWidth, containerHeight]); // Re-compute when container size changes

  // Only render selection ring when selected and we have bounds
  if (!isSelected || !webcamBounds) {
    return null;
  }

  return (
    <div
      className={cn("pointer-events-none absolute z-50", className)}
      style={{
        left: webcamBounds.x,
        top: webcamBounds.y,
        width: webcamBounds.width,
        height: webcamBounds.height,
        borderRadius: '50%', // Webcam is typically circular
        boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.8), 0 0 0 4px rgba(59, 130, 246, 0.3)',
      }}
      aria-hidden="true"
    />
  )
}
