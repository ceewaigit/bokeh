/**
 * usePanelResizer - Panel resize hook built on useCanvasDrag
 *
 * Consolidates window event handling for resizing utilities, properties, and timeline panels.
 * Uses useCanvasDrag for the core drag mechanics to avoid code duplication.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasDrag } from './use-canvas-drag'

const UTIL_MIN = 200
const PROPS_MIN = 300
const TIMELINE_MIN = 100

type PanelType = 'utilities' | 'properties' | 'timeline'

/**
 * Hook for resizing workspace panels using consolidated drag logic.
 * Replaces the previous manual window event listener approach.
 */
export function usePanelResizer() {
    const {
        isUtilitiesOpen,
        isPropertiesOpen,
        utilitiesPanelWidth,
        propertiesPanelWidth,
        setUtilitiesPanelWidth,
        setPropertiesPanelWidth,
        setTimelineHeight
    } = useWorkspaceStore(useShallow((s) => ({
        isUtilitiesOpen: s.isUtilitiesOpen,
        isPropertiesOpen: s.isPropertiesOpen,
        utilitiesPanelWidth: s.utilitiesPanelWidth,
        propertiesPanelWidth: s.propertiesPanelWidth,
        setUtilitiesPanelWidth: s.setUtilitiesPanelWidth,
        setPropertiesPanelWidth: s.setPropertiesPanelWidth,
        setTimelineHeight: s.setTimelineHeight
    })))

    // Live drag values for smooth visual feedback
    const [dragUtilitiesWidth, setDragUtilitiesWidth] = useState<number | null>(null)
    const [dragPropertiesWidth, setDragPropertiesWidth] = useState<number | null>(null)
    const [dragTimelineHeight, setDragTimelineHeight] = useState<number | null>(null)

    // Dynamic max width based on viewport
    const [panelMaxWidth, setPanelMaxWidth] = useState(() =>
        typeof window === 'undefined' ? 0 : window.innerWidth * 0.3
    )

    // Track which panel is being resized for cursor styling
    const activePanelRef = useRef<PanelType | null>(null)

    useEffect(() => {
        const updatePanelMaxWidth = () => {
            setPanelMaxWidth(window.innerWidth * 0.3)
        }
        updatePanelMaxWidth()
        window.addEventListener('resize', updatePanelMaxWidth)
        return () => window.removeEventListener('resize', updatePanelMaxWidth)
    }, [])

    // Clamp utility to avoid repetition
    const clamp = (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), max)

    // Single drag handler for all panels
    const handleDrag = useCallback((
        delta: { x: number; y: number },
        _type: unknown,
        initial: { panel: PanelType; startX: number; startY: number } | null
    ) => {
        if (!initial) return
        const maxWidth = window.innerWidth * 0.3

        switch (initial.panel) {
            case 'utilities': {
                const rawWidth = initial.startX + delta.x
                const utilMin = Math.min(UTIL_MIN, maxWidth)
                setDragUtilitiesWidth(clamp(rawWidth, utilMin, maxWidth))
                break
            }
            case 'properties': {
                const rawWidth = (window.innerWidth - initial.startX) - delta.x
                const propsMin = Math.min(PROPS_MIN, maxWidth)
                setDragPropertiesWidth(clamp(rawWidth, propsMin, maxWidth))
                break
            }
            case 'timeline': {
                const rawHeight = (window.innerHeight - initial.startY) - delta.y
                setDragTimelineHeight(Math.max(TIMELINE_MIN, rawHeight))
                break
            }
        }
    }, [])

    // Commit values to store on drag end
    const handleDragEnd = useCallback(() => {
        const panel = activePanelRef.current
        const maxWidth = window.innerWidth * 0.3

        // Reset cursor
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        if (panel === 'utilities' && dragUtilitiesWidth !== null && isUtilitiesOpen) {
            const utilMin = Math.min(UTIL_MIN, maxWidth)
            setUtilitiesPanelWidth(clamp(dragUtilitiesWidth, utilMin, maxWidth))
        }
        if (panel === 'properties' && dragPropertiesWidth !== null && isPropertiesOpen) {
            const propsMin = Math.min(PROPS_MIN, maxWidth)
            setPropertiesPanelWidth(clamp(dragPropertiesWidth, propsMin, maxWidth))
        }
        if (panel === 'timeline' && dragTimelineHeight !== null) {
            setTimelineHeight(dragTimelineHeight)
        }

        // Clear drag state
        setDragUtilitiesWidth(null)
        setDragPropertiesWidth(null)
        setDragTimelineHeight(null)
        activePanelRef.current = null
    }, [
        dragUtilitiesWidth,
        dragPropertiesWidth,
        dragTimelineHeight,
        isUtilitiesOpen,
        isPropertiesOpen,
        setUtilitiesPanelWidth,
        setPropertiesPanelWidth,
        setTimelineHeight
    ])

    // Use the consolidated drag hook
    const { startDrag } = useCanvasDrag<{ panel: PanelType; startX: number; startY: number }>({
        onDrag: handleDrag,
        onDragEnd: handleDragEnd
    })

    const startResizingUtilities = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        activePanelRef.current = 'utilities'
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        startDrag({
            startX: e.clientX,
            startY: e.clientY,
            type: 'move',
            initialValue: { panel: 'utilities', startX: e.clientX, startY: e.clientY }
        })
    }, [startDrag])

    const startResizingProperties = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        activePanelRef.current = 'properties'
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        startDrag({
            startX: e.clientX,
            startY: e.clientY,
            type: 'move',
            initialValue: { panel: 'properties', startX: e.clientX, startY: e.clientY }
        })
    }, [startDrag])

    const startResizingTimeline = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        activePanelRef.current = 'timeline'
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
        startDrag({
            startX: e.clientX,
            startY: e.clientY,
            type: 'move',
            initialValue: { panel: 'timeline', startX: e.clientX, startY: e.clientY }
        })
    }, [startDrag])

    return {
        panelMaxWidth,
        dragUtilitiesWidth,
        dragPropertiesWidth,
        dragTimelineHeight,
        startResizingUtilities,
        startResizingProperties,
        startResizingTimeline
    }
}
