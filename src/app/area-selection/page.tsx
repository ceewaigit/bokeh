'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

export default function AreaSelectionPage() {
    const [isSelecting, setIsSelecting] = useState(false)
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })
    const overlayRef = useRef<HTMLDivElement>(null)
    const selectionRef = useRef<HTMLDivElement>(null)

    // Use refs to track state in event handlers to avoid stale closure issues
    const isSelectingRef = useRef(false)
    const startPointRef = useRef({ x: 0, y: 0 })

    // Sync refs with state
    useEffect(() => {
        isSelectingRef.current = isSelecting
    }, [isSelecting])

    useEffect(() => {
        startPointRef.current = startPoint
    }, [startPoint])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const start = { x: e.clientX, y: e.clientY }
        setIsSelecting(true)
        setStartPoint(start)

        // Update refs immediately for use in document-level handlers
        isSelectingRef.current = true
        startPointRef.current = start
    }, [])

    const handleCancel = useCallback(() => {
        if (window.electronAPI?.cancelAreaSelection) {
            window.electronAPI.cancelAreaSelection()
        } else {
            console.error('[AreaSelection] ERROR: cancelAreaSelection not available!')
        }
    }, [])

    // Use document-level event listeners for reliable mouse tracking
    useEffect(() => {
        const handleDocumentMouseMove = (e: MouseEvent) => {
            if (!isSelectingRef.current) return

            const start = startPointRef.current
            const x = Math.min(start.x, e.clientX)
            const y = Math.min(start.y, e.clientY)
            const width = Math.abs(e.clientX - start.x)
            const height = Math.abs(e.clientY - start.y)

            // Direct DOM manipulation for maximum performance
            if (selectionRef.current) {
                selectionRef.current.style.left = `${x}px`
                selectionRef.current.style.top = `${y}px`
                selectionRef.current.style.width = `${width}px`
                selectionRef.current.style.height = `${height}px`
                selectionRef.current.style.display = width > 0 && height > 0 ? 'block' : 'none'

                // Update dimensions display
                const dimEl = selectionRef.current.querySelector('[data-dimensions]')
                if (dimEl) {
                    dimEl.textContent = `${Math.round(width)} × ${Math.round(height)}`
                }
            }

            // Update state less frequently (for final bounds on mouseup)
        }

        const handleDocumentMouseUp = () => {
            if (!isSelectingRef.current) return

            setIsSelecting(false)
            isSelectingRef.current = false

            // Get final bounds from state
            const selection = selectionRef.current
            if (!selection) return

            const bounds = {
                x: parseInt(selection.style.left) || 0,
                y: parseInt(selection.style.top) || 0,
                width: parseInt(selection.style.width) || 0,
                height: parseInt(selection.style.height) || 0
            }

            // Validate minimum size (50x50)
            if (bounds.width < 50 || bounds.height < 50) {
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
            if (e.key === 'Escape') {
                handleCancel()
            }
        }

        // Add document-level listeners for reliable event capture
        document.addEventListener('mousemove', handleDocumentMouseMove, { passive: true })
        document.addEventListener('mouseup', handleDocumentMouseUp)
        document.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('mousemove', handleDocumentMouseMove)
            document.removeEventListener('mouseup', handleDocumentMouseUp)
            document.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [handleCancel])

    // Custom cursor SVG: Clean crosshair
    const cursorSvg = encodeURIComponent(`
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4V20M4 12H20" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M12 4V20M4 12H20" stroke="black" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
            <circle cx="12" cy="12" r="2" fill="white" stroke="black" stroke-width="0.5" opacity="0.8"/>
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
                    cursor: url('data:image/svg+xml;utf8,${cursorSvg}') 12 12, crosshair !important;
                }
            `}</style>

            {/* Semi-transparent overlay - NO blur for performance */}
            <div className="absolute inset-0 bg-black/30" />

            {/* Selection Rectangle - uses direct DOM updates for performance */}
            <div
                ref={selectionRef}
                className="absolute pointer-events-none"
                style={{ display: 'none' }}
            >
                {/* Clear selection area with refined border */}
                <div
                    className="absolute inset-0 rounded-lg"
                    style={{
                        background: 'transparent',
                        boxShadow: `
                            0 0 0 2px rgba(255, 255, 255, 0.9),
                            0 0 0 4px rgba(0, 0, 0, 0.2),
                            0 0 0 9999px rgba(0, 0, 0, 0.5)
                        `
                    }}
                />

                {/* Corner handles */}
                <div className="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-sm shadow-md" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-sm shadow-md" />
                <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white rounded-sm shadow-md" />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-sm shadow-md" />

                {/* Edge handles */}
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-1.5 h-6 bg-white rounded-full shadow-md" />
                <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-1.5 h-6 bg-white rounded-full shadow-md" />
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-1.5 bg-white rounded-full shadow-md" />
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1.5 bg-white rounded-full shadow-md" />

                {/* Dimensions Tag */}
                <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-black/80 text-white rounded-full shadow-lg whitespace-nowrap">
                    <span data-dimensions className="text-xs font-medium tabular-nums">
                        0 × 0
                    </span>
                </div>
            </div>

            {/* Instructions - Clean minimal design */}
            <div className="fixed top-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-3 bg-black/80 rounded-2xl shadow-2xl">
                <span className="text-sm text-white font-medium">
                    Drag to select recording area
                </span>
                <div className="w-px h-4 bg-white/20" />
                <div className="flex items-center gap-2">
                    <kbd className="text-3xs font-bold text-white/60 bg-white/10 px-2 py-1 rounded border border-white/10">ESC</kbd>
                    <span className="text-sm text-white/60">Cancel</span>
                </div>
            </div>
        </div>
    )
}
