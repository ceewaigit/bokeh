'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

interface SelectionBounds {
    x: number
    y: number
    width: number
    height: number
}

export default function AreaSelectionPage() {
    const [isSelecting, setIsSelecting] = useState(false)
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })
    const [currentBounds, setCurrentBounds] = useState<SelectionBounds | null>(null)
    const overlayRef = useRef<HTMLDivElement>(null)

    // Use refs to track state in event handlers to avoid stale closure issues
    const isSelectingRef = useRef(false)
    const startPointRef = useRef({ x: 0, y: 0 })
    const currentBoundsRef = useRef<SelectionBounds | null>(null)

    // Sync refs with state
    useEffect(() => {
        isSelectingRef.current = isSelecting
    }, [isSelecting])

    useEffect(() => {
        startPointRef.current = startPoint
    }, [startPoint])

    useEffect(() => {
        currentBoundsRef.current = currentBounds
    }, [currentBounds])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const start = { x: e.clientX, y: e.clientY }
        const bounds = { x: e.clientX, y: e.clientY, width: 0, height: 0 }

        setIsSelecting(true)
        setStartPoint(start)
        setCurrentBounds(bounds)

        // Update refs immediately for use in document-level handlers
        isSelectingRef.current = true
        startPointRef.current = start
        currentBoundsRef.current = bounds
    }, [])

    const handleCancel = useCallback(() => {
        if (window.electronAPI?.cancelAreaSelection) {
            window.electronAPI.cancelAreaSelection()
        } else {
            console.error('[AreaSelection] ERROR: cancelAreaSelection not available!')
        }
    }, [])

    // Use document-level event listeners for reliable mouse tracking
    // React synthetic events can fail in Electron transparent overlay windows
    useEffect(() => {
        const handleDocumentMouseMove = (e: MouseEvent) => {
            if (!isSelectingRef.current) return

            const start = startPointRef.current
            const x = Math.min(start.x, e.clientX)
            const y = Math.min(start.y, e.clientY)
            const width = Math.abs(e.clientX - start.x)
            const height = Math.abs(e.clientY - start.y)

            const bounds = { x, y, width, height }
            setCurrentBounds(bounds)
            currentBoundsRef.current = bounds
        }

        const handleDocumentMouseUp = () => {
            if (!isSelectingRef.current) return

            const bounds = currentBoundsRef.current

            setIsSelecting(false)
            isSelectingRef.current = false

            if (!bounds) {
                return
            }

            // Validate minimum size (50x50)
            if (bounds.width < 50 || bounds.height < 50) {
                setCurrentBounds(null)
                currentBoundsRef.current = null
                return
            }

            // Send selection to main process via IPC
            if (window.electronAPI?.sendAreaSelection) {
                window.electronAPI.sendAreaSelection({
                    x: Math.round(bounds.x),
                    y: Math.round(bounds.y),
                    width: Math.round(bounds.width),
                    height: Math.round(bounds.height)
                })
            } else {
                console.error('[AreaSelection] ERROR: sendAreaSelection not available!')
            }
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            console.log('[AreaSelection] Key pressed:', e.key)
            if (e.key === 'Escape') {
                handleCancel()
            }
        }

        // Add document-level listeners for reliable event capture
        document.addEventListener('mousemove', handleDocumentMouseMove)
        document.addEventListener('mouseup', handleDocumentMouseUp)
        document.addEventListener('keydown', handleKeyDown)

        // Also listen on window for keyboard events (fallback)
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('mousemove', handleDocumentMouseMove)
            document.removeEventListener('mouseup', handleDocumentMouseUp)
            document.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [handleCancel])

    // Custom cursor SVG: White crosshair with black shadow for visibility on all backgrounds
    const cursorSvg = encodeURIComponent(`
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <filter id="shadow" x="0" y="0" width="32" height="32">
                <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.5"/>
            </filter>
            <g filter="url(#shadow)">
                <path d="M16 6V26M6 16H26" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <circle cx="16" cy="16" r="1.5" fill="white"/>
            </g>
        </svg>
    `.trim().replace(/\s+/g, ' '))

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[9999] font-sans select-none"
            onMouseDown={handleMouseDown}
        >
            <style>{`
                :root, html, body, * {
                    cursor: url('data:image/svg+xml;utf8,${cursorSvg}') 16 16, crosshair !important;
                }
            `}</style>
            {/* Background with Grid Pattern */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
            <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
                    `,
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Selection Rectangle */}
            {currentBounds && currentBounds.width > 0 && currentBounds.height > 0 && (
                <div
                    className={cn(
                        "absolute rounded-xl border border-white/20",
                        "bg-teal-500/10 backdrop-blur-md",
                        "shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_20px_50px_rgba(0,0,0,0.5)]",
                        "transition-all duration-75 ease-out will-change-[width,height,left,top]"
                    )}
                    style={{
                        left: currentBounds.x,
                        top: currentBounds.y,
                        width: currentBounds.width,
                        height: currentBounds.height,
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
                    }}
                >
                    {/* Corners */}
                    <div className="absolute -top-[2px] -left-[2px] w-4 h-4 border-l-2 border-t-2 border-teal-500 rounded-tl-lg" />
                    <div className="absolute -top-[2px] -right-[2px] w-4 h-4 border-r-2 border-t-2 border-teal-500 rounded-tr-lg" />
                    <div className="absolute -bottom-[2px] -left-[2px] w-4 h-4 border-l-2 border-b-2 border-teal-500 rounded-bl-lg" />
                    <div className="absolute -bottom-[2px] -right-[2px] w-4 h-4 border-r-2 border-b-2 border-teal-500 rounded-br-lg" />

                    {/* Dimensions Tag */}
                    <div className="absolute left-1/2 -bottom-12 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-zinc-900/90 text-white rounded-full border border-white/10 shadow-xl select-none whitespace-nowrap z-50">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.5)]" />
                        <span className="text-xs font-medium tabular-nums tracking-wide">
                            {Math.round(currentBounds.width)} × {Math.round(currentBounds.height)}
                        </span>
                    </div>
                </div>
            )}

            {/* Instructions Pill */}
            <div className="fixed top-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-2.5 bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl select-none z-50">
                <span className="text-xs text-zinc-400 font-medium">
                    Drag to select area
                </span>
                <div className="w-px h-3 bg-white/10" />
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">ESC</span>
                    <span className="text-xs text-zinc-400 font-medium">to cancel</span>
                </div>
            </div>

            {/* Footer */}
            <div className="fixed bottom-6 right-8 text-[10px] font-bold tracking-widest text-white/20 select-none uppercase pointer-events-none">
                Area Selection
            </div>
        </div>
    )
}
