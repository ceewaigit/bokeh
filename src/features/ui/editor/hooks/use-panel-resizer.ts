import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'

const UTIL_MIN = 200
const PROPS_MIN = 300

export function usePanelResizer() {
    const isUtilitiesOpen = useWorkspaceStore((s) => s.isUtilitiesOpen)
    const isPropertiesOpen = useWorkspaceStore((s) => s.isPropertiesOpen)
    const utilitiesPanelWidth = useWorkspaceStore((s) => s.utilitiesPanelWidth)
    const propertiesPanelWidth = useWorkspaceStore((s) => s.propertiesPanelWidth)

    const setUtilitiesPanelWidth = useWorkspaceStore((s) => s.setUtilitiesPanelWidth)
    const setPropertiesPanelWidth = useWorkspaceStore((s) => s.setPropertiesPanelWidth)
    const setTimelineHeight = useWorkspaceStore((s) => s.setTimelineHeight)

    const isResizingUtilitiesRef = useRef(false)
    const isResizingPropertiesRef = useRef(false)
    const isResizingTimelineRef = useRef(false)

    const [dragUtilitiesWidth, setDragUtilitiesWidth] = useState<number | null>(null)
    const [dragPropertiesWidth, setDragPropertiesWidth] = useState<number | null>(null)
    const [dragTimelineHeight, setDragTimelineHeight] = useState<number | null>(null)

    const [panelMaxWidth, setPanelMaxWidth] = useState(() =>
        typeof window === 'undefined' ? 0 : window.innerWidth * 0.3
    )

    useEffect(() => {
        const updatePanelMaxWidth = () => {
            setPanelMaxWidth(window.innerWidth * 0.3)
        }
        updatePanelMaxWidth()
        window.addEventListener('resize', updatePanelMaxWidth)
        return () => window.removeEventListener('resize', updatePanelMaxWidth)
    }, [])

    useEffect(() => {
        const getPanelMaxWidth = () => window.innerWidth * 0.3

        const handleMouseMove = (event: MouseEvent) => {
            requestAnimationFrame(() => {
                if (isResizingUtilitiesRef.current) {
                    const rawWidth = Math.max(0, event.clientX)
                    const panelMaxWidth = getPanelMaxWidth()
                    const utilMin = Math.min(UTIL_MIN, panelMaxWidth)
                    const clampedWidth = Math.min(Math.max(rawWidth, utilMin), panelMaxWidth)
                    setDragUtilitiesWidth(clampedWidth)
                }
                if (isResizingPropertiesRef.current) {
                    const rawWidth = Math.max(0, window.innerWidth - event.clientX)
                    const panelMaxWidth = getPanelMaxWidth()
                    const propsMin = Math.min(PROPS_MIN, panelMaxWidth)
                    const clampedWidth = Math.min(Math.max(rawWidth, propsMin), panelMaxWidth)
                    setDragPropertiesWidth(clampedWidth)
                }
                if (isResizingTimelineRef.current) {
                    // Calculate height from bottom of viewport
                    const newHeight = window.innerHeight - event.clientY
                    // Don't commit to store yet, just update local drag state
                    setDragTimelineHeight(Math.max(100, newHeight))
                }
            })
        }

        const handleMouseUp = () => {
            if (isResizingUtilitiesRef.current || isResizingPropertiesRef.current || isResizingTimelineRef.current) {
                const wasResizingTimeline = isResizingTimelineRef.current
                const utilitiesWidth = dragUtilitiesWidth ?? utilitiesPanelWidth
                const propertiesWidth = dragPropertiesWidth ?? propertiesPanelWidth
                const maxWidth = getPanelMaxWidth()
                const utilMin = Math.min(UTIL_MIN, maxWidth)
                const propsMin = Math.min(PROPS_MIN, maxWidth)
                const nextTimelineHeight = dragTimelineHeight

                isResizingUtilitiesRef.current = false
                isResizingPropertiesRef.current = false
                isResizingTimelineRef.current = false

                document.body.style.cursor = ''
                document.body.style.userSelect = ''

                if (wasResizingTimeline && nextTimelineHeight !== null) {
                    setTimelineHeight(nextTimelineHeight)
                }

                setDragUtilitiesWidth(null)
                setDragPropertiesWidth(null)
                setDragTimelineHeight(null)

                if (isUtilitiesOpen) {
                    setUtilitiesPanelWidth(Math.min(Math.max(utilMin, utilitiesWidth), maxWidth))
                }
                if (isPropertiesOpen) {
                    setPropertiesPanelWidth(Math.min(Math.max(propsMin, propertiesWidth), maxWidth))
                }
            }
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [
        setUtilitiesPanelWidth,
        setPropertiesPanelWidth,
        setTimelineHeight,
        utilitiesPanelWidth,
        propertiesPanelWidth,
        isUtilitiesOpen,
        isPropertiesOpen,
        dragUtilitiesWidth,
        dragPropertiesWidth,
        dragTimelineHeight
    ])

    const startResizingUtilities = (e: React.MouseEvent) => {
        e.preventDefault()
        isResizingUtilitiesRef.current = true
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }

    const startResizingProperties = (e: React.MouseEvent) => {
        e.preventDefault()
        isResizingPropertiesRef.current = true
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }

    const startResizingTimeline = (e: React.MouseEvent) => {
        e.preventDefault()
        isResizingTimelineRef.current = true
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
    }

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
