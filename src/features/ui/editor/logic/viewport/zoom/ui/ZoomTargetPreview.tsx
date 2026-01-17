'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CropEffectData, ZoomEffectData } from '@/types/project'
import { ZoomFollowStrategy } from '@/types/project'
import { cn } from '@/shared/utils/utils'
import { getHalfWindows } from '@/features/ui/editor/logic/viewport'

type ZoomTargetPreviewProps = {
    zoomData: ZoomEffectData
    screenWidth: number
    screenHeight: number
    outputWidth: number
    outputHeight: number
    cropData?: CropEffectData | null
    /** When true, allow target to be placed at edges to reveal background padding */
    allowOverscanReveal?: boolean
    /** Padding ratio (0-1) representing how much of the output is padding on each side */
    paddingRatio?: number
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
    allowOverscanReveal = false,
    paddingRatio = 0,
    onCommit,
    className,
}: ZoomTargetPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [localTarget, setLocalTarget] = useState<{ x: number; y: number } | null>(null)
    const rectRef = useRef<DOMRect | null>(null)
    const rafRef = useRef<number | null>(null)
    const pendingRef = useRef<{ x: number; y: number } | null>(null)
    const latestTargetRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 })
    const activePointerIdRef = useRef<number | null>(null)

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

    // When allowOverscanReveal is true, allow target to go to edges (0 to 1)
    // This enables revealing background padding when zoomed and panned to edge
    const clampTarget = useCallback((target: { x: number; y: number }) => ({
        x: allowOverscanReveal ? clamp(target.x, 0, 1) : clamp(target.x, halfWindowNormX, 1 - halfWindowNormX),
        y: allowOverscanReveal ? clamp(target.y, 0, 1) : clamp(target.y, halfWindowNormY, 1 - halfWindowNormY),
    }), [halfWindowNormX, halfWindowNormY, allowOverscanReveal])

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

    // Calculate visible window position - clamp to stay within preview bounds
    const windowWidthPct = Math.min(100, halfWindowNormX * 200)
    const windowHeightPct = Math.min(100, halfWindowNormY * 200)
    // Clamp window position so it doesn't overflow the preview
    const rawWindowLeftPct = (target.x - halfWindowNormX) * 100
    const rawWindowTopPct = (target.y - halfWindowNormY) * 100
    const windowLeftPct = Math.max(0, Math.min(100 - windowWidthPct, rawWindowLeftPct))
    const windowTopPct = Math.max(0, Math.min(100 - windowHeightPct, rawWindowTopPct))

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
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        rectRef.current = rect
        const x = (event.clientX - rect.left) / rect.width
        const y = (event.clientY - rect.top) / rect.height
        const nextTarget = clampTarget({ x, y })
        queueTarget(nextTarget)
        activePointerIdRef.current = event.pointerId
        if (containerRef.current) {
            try {
                containerRef.current.setPointerCapture(event.pointerId)
            } catch {
                // Ignore capture errors
            }
        }
        setIsDragging(true)
    }, [scale, clampTarget, queueTarget])

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return
        event.preventDefault()
        const rect = rectRef.current
        if (!rect) return
        const x = (event.clientX - rect.left) / rect.width
        const y = (event.clientY - rect.top) / rect.height
        const nextTarget = clampTarget({ x, y })
        queueTarget(nextTarget)
    }, [isDragging, clampTarget, queueTarget])

    const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return
        event.preventDefault()
        setIsDragging(false)
        rectRef.current = null
        if (containerRef.current && activePointerIdRef.current !== null) {
            if (event.pointerId === activePointerIdRef.current) {
                try {
                    containerRef.current.releasePointerCapture(activePointerIdRef.current)
                } catch {
                    // Ignore release errors
                }
                activePointerIdRef.current = null
            }
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

    const handleLostPointerCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (isDragging && event.pointerId === activePointerIdRef.current) {
            setIsDragging(false)
            rectRef.current = null
            activePointerIdRef.current = null
            // Still commit the final position
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
        }
    }, [isDragging, onCommit, baseWidth, baseHeight, crop.x, crop.y, cropWidth, cropHeight])

    // Calculate video area inset when there's padding
    // paddingRatio is the fraction of output that is padding on each side
    const videoInsetPct = paddingRatio * 100

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">Focus Target</div>
                <div className="text-xs font-mono text-muted-foreground/70">
                    {Math.round(target.x * 100)}% / {Math.round(target.y * 100)}%
                </div>
            </div>
            <div
                ref={containerRef}
                className={cn(
                    'relative w-full rounded-xl border border-border/40 overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.15)]',
                    scale <= 1.01 && 'cursor-not-allowed opacity-60'
                )}
                style={{ aspectRatio: `${baseWidth * cropWidth} / ${baseHeight * cropHeight}`, touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={handleLostPointerCapture}
            >
                {/* Background/padding area - subtle grid pattern */}
                <div
                    className="absolute inset-0 opacity-50 pointer-events-none"
                    style={{
                        backgroundImage:
                            'linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                    }}
                />

                {/* Video content area - darker, represents the actual video */}
                <div
                    className="absolute rounded-lg pointer-events-none"
                    style={{
                        left: `${videoInsetPct}%`,
                        top: `${videoInsetPct}%`,
                        right: `${videoInsetPct}%`,
                        bottom: `${videoInsetPct}%`,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        border: paddingRatio > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                        borderRadius: paddingRatio > 0 ? '8px' : '0',
                    }}
                />

                {/* Visible window indicator - clamped to preview bounds */}
                <div
                    className="absolute rounded-lg border-2 border-primary/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_0_12px_rgba(139,92,246,0.3)] pointer-events-none"
                    style={{
                        left: `${windowLeftPct}%`,
                        top: `${windowTopPct}%`,
                        width: `${windowWidthPct}%`,
                        height: `${windowHeightPct}%`,
                        background: 'rgba(139,92,246,0.08)',
                    }}
                />

                {/* Target point */}
                <div
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_2px_rgba(0,0,0,0.5),0_0_0_4px_rgba(255,255,255,0.2)] pointer-events-none"
                    style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
                />
            </div>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground/60">
                <span className="font-sans">{scale <= 1.01 ? 'Scale above 1x to move' : 'Drag to reposition'}</span>
                {scale <= 1.01 && <span className="font-sans">Locked</span>}
            </div>
        </div>
    )
}
