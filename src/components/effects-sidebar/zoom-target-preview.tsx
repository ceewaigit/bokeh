'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CropEffectData, ZoomEffectData } from '@/types/project'
import { ZoomFollowStrategy } from '@/types/project'
import { cn } from '@/shared/utils/utils'
import { getHalfWindows } from '@/features/camera'

type ZoomTargetPreviewProps = {
  zoomData: ZoomEffectData
  screenWidth: number
  screenHeight: number
  outputWidth: number
  outputHeight: number
  cropData?: CropEffectData | null
  onCommit: (updates: Pick<ZoomEffectData, 'targetX' | 'targetY' | 'screenWidth' | 'screenHeight' | 'followStrategy'>) => void
  className?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function ZoomTargetPreview({
  zoomData,
  screenWidth,
  screenHeight,
  outputWidth,
  outputHeight,
  cropData,
  onCommit,
  className,
}: ZoomTargetPreviewProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [localTarget, setLocalTarget] = useState<{ x: number; y: number } | null>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)
  const latestTargetRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 })

  const baseWidth = screenWidth
  const baseHeight = screenHeight
  const targetSourceWidth = zoomData.screenWidth ?? baseWidth
  const targetSourceHeight = zoomData.screenHeight ?? baseHeight
  const crop = cropData ?? { x: 0, y: 0, width: 1, height: 1 }
  const cropWidth = Math.max(0.0001, Math.min(1, crop.width))
  const cropHeight = Math.max(0.0001, Math.min(1, crop.height))
  const scale = Math.max(zoomData.scale ?? 1, 1)
  const { halfWindowX, halfWindowY } = getHalfWindows(
    scale,
    baseWidth,
    baseHeight,
    outputWidth,
    outputHeight
  )
  const halfWindowNormX = Math.min(0.5, Math.max(0, halfWindowX / cropWidth))
  const halfWindowNormY = Math.min(0.5, Math.max(0, halfWindowY / cropHeight))

  const clampTarget = useCallback((target: { x: number; y: number }) => ({
    x: clamp(target.x, halfWindowNormX, 1 - halfWindowNormX),
    y: clamp(target.y, halfWindowNormY, 1 - halfWindowNormY),
  }), [halfWindowNormX, halfWindowNormY])

  const targetFromData = useMemo(() => {
    if (zoomData.targetX == null || zoomData.targetY == null) return { x: 0.5, y: 0.5 }
    const sourceNorm = {
      x: zoomData.targetX / targetSourceWidth,
      y: zoomData.targetY / targetSourceHeight,
    }
    return {
      x: (sourceNorm.x - crop.x) / cropWidth,
      y: (sourceNorm.y - crop.y) / cropHeight,
    }
  }, [zoomData.targetX, zoomData.targetY, targetSourceWidth, targetSourceHeight, crop.x, crop.y, cropWidth, cropHeight])

  const target = clampTarget(localTarget ?? targetFromData)
  latestTargetRef.current = target
  const windowWidthPct = Math.min(100, halfWindowNormX * 200)
  const windowHeightPct = Math.min(100, halfWindowNormY * 200)
  const windowLeftPct = (target.x - halfWindowNormX) * 100
  const windowTopPct = (target.y - halfWindowNormY) * 100

  const queueTarget = useCallback((nextTarget: { x: number; y: number }) => {
    pendingRef.current = nextTarget
    latestTargetRef.current = nextTarget
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      if (pendingRef.current) {
        setLocalTarget(pendingRef.current)
      }
      pendingRef.current = null
      rafRef.current = null
    })
  }, [])

  useEffect(() => {
    if (isDragging) return
    setLocalTarget(null)
  }, [zoomData.targetX, zoomData.targetY, zoomData.scale, isDragging])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (scale <= 1.01) return
    const rect = event.currentTarget.getBoundingClientRect()
    rectRef.current = rect
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    const nextTarget = clampTarget({ x, y })
    queueTarget(nextTarget)
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
  }, [scale, clampTarget, queueTarget])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const rect = rectRef.current
    if (!rect) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    const nextTarget = clampTarget({ x, y })
    queueTarget(nextTarget)
  }, [isDragging, clampTarget, queueTarget])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setIsDragging(false)
    rectRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const sourceNorm = {
      x: crop.x + latestTargetRef.current.x * cropWidth,
      y: crop.y + latestTargetRef.current.y * cropHeight,
    }
    onCommit({
      targetX: sourceNorm.x * baseWidth,
      targetY: sourceNorm.y * baseHeight,
      screenWidth: baseWidth,
      screenHeight: baseHeight,
      followStrategy: ZoomFollowStrategy.Manual,
    })
  }, [isDragging, onCommit, baseWidth, baseHeight, crop.x, crop.y, cropWidth, cropHeight])

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-medium text-muted-foreground">Focus Target</div>
        <div className="text-[12px] font-mono text-muted-foreground/70">
          {Math.round(target.x * 100)}% / {Math.round(target.y * 100)}%
        </div>
      </div>
      <div
        className={cn(
          'relative w-full rounded-xl border border-border/40 bg-gradient-to-br from-background/80 via-background/60 to-background/40 shadow-[0_12px_30px_rgba(0,0,0,0.15)]',
          scale <= 1.01 && 'cursor-not-allowed opacity-60'
        )}
        style={{ aspectRatio: `${baseWidth * cropWidth} / ${baseHeight * cropHeight}`, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-0 rounded-xl border border-white/5 pointer-events-none" />
        <div
          className="absolute inset-0 rounded-xl opacity-70 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div
          className="absolute rounded-lg border border-primary/80 shadow-[0_0_0_1px_rgba(0,0,0,0.25)] pointer-events-none"
          style={{
            left: `${windowLeftPct}%`,
            top: `${windowTopPct}%`,
            width: `${windowWidthPct}%`,
            height: `${windowHeightPct}%`,
            background: 'rgba(0,0,0,0.12)',
            backdropFilter: 'blur(2px)',
          }}
        />
        <div
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_6px_rgba(255,255,255,0.18)] pointer-events-none"
          style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[12px] uppercase tracking-[0.2em] text-muted-foreground/60">
        <span className="font-sans">{scale <= 1.01 ? 'Scale above 1x to move' : 'Drag to reposition'}</span>
        {scale <= 1.01 && <span className="font-sans">Locked</span>}
      </div>
    </div>
  )
}
