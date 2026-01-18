/**
 * Preview Hover Hook - Manages hover state for preview layer selection
 *
 * Simplified from 8 separate states to a single HoverState object.
 * Hit testing logic extracted to hover-hit-testing.ts for testability.
 */

import { useState, useCallback, useMemo } from 'react'
import type { Effect, Clip } from '@/types/project'
import type { FrameSnapshot } from '@/features/rendering/renderer/engine/layout-engine'
import {
    getHoveredLayer,
    INITIAL_HOVER_STATE,
    type HoverState,
    type HitTestContext
} from '@/features/ui/editor/logic/hover-hit-testing'

interface UsePreviewHoverOptions {
    projectEffects: Effect[]
    webcamClip?: Clip | null
    canSelectBackground: boolean
    canSelectCursor: boolean
    canSelectWebcam: boolean
    canSelectVideo?: boolean
    aspectContainerRef: React.RefObject<HTMLDivElement | null>
    playerContainerRef?: React.RefObject<HTMLDivElement | null>
    snapshot: FrameSnapshot
}

// Threshold for position change detection to avoid unnecessary re-renders
const POSITION_THRESHOLD = 0.5

function hasOverlayChanged<T extends { x?: number; y?: number; width?: number; height?: number; left?: number; top?: number }>(
    prev: T | null,
    next: T | null
): boolean {
    if (!prev && !next) return false
    if (!prev || !next) return true

    // Handle cursor overlay (uses left/top)
    if ('left' in prev && 'left' in next) {
        return Math.abs((prev.left ?? 0) - (next.left ?? 0)) >= POSITION_THRESHOLD ||
            Math.abs((prev.top ?? 0) - (next.top ?? 0)) >= POSITION_THRESHOLD ||
            Math.abs((prev.width ?? 0) - (next.width ?? 0)) >= POSITION_THRESHOLD ||
            Math.abs((prev.height ?? 0) - (next.height ?? 0)) >= POSITION_THRESHOLD
    }

    // Handle other overlays (use x/y)
    return Math.abs((prev.x ?? 0) - (next.x ?? 0)) >= POSITION_THRESHOLD ||
        Math.abs((prev.y ?? 0) - (next.y ?? 0)) >= POSITION_THRESHOLD ||
        Math.abs((prev.width ?? 0) - (next.width ?? 0)) >= POSITION_THRESHOLD ||
        Math.abs((prev.height ?? 0) - (next.height ?? 0)) >= POSITION_THRESHOLD
}

function shouldUpdateState(prev: HoverState, next: HoverState): boolean {
    // Layer changed - always update
    if (prev.layer !== next.layer) return true

    // Check each overlay for meaningful changes
    if (hasOverlayChanged(prev.cursor, next.cursor)) return true
    if (hasOverlayChanged(prev.webcam, next.webcam)) return true
    if (hasOverlayChanged(prev.annotation, next.annotation)) return true
    if (hasOverlayChanged(prev.video, next.video)) return true
    if (hasOverlayChanged(prev.background, next.background)) return true
    if (hasOverlayChanged(prev.subtitle, next.subtitle)) return true
    if (hasOverlayChanged(prev.keystroke, next.keystroke)) return true

    // Check ID changes for overlays with IDs
    if (prev.annotation?.id !== next.annotation?.id) return true
    if (prev.subtitle?.id !== next.subtitle?.id) return true
    if (prev.keystroke?.id !== next.keystroke?.id) return true

    // Check border radius and clip path changes
    if (prev.webcam?.borderRadius !== next.webcam?.borderRadius) return true
    if (prev.video?.borderRadius !== next.video?.borderRadius) return true
    if (prev.video?.clipPath !== next.video?.clipPath) return true
    if (prev.background?.borderRadius !== next.background?.borderRadius) return true

    return false
}

export function usePreviewHover({
    canSelectBackground,
    canSelectCursor,
    canSelectWebcam,
    canSelectVideo = false,
    aspectContainerRef,
    playerContainerRef,
    projectEffects,
    webcamClip,
    snapshot,
}: UsePreviewHoverOptions) {
    const [hoverState, setHoverState] = useState<HoverState>(INITIAL_HOVER_STATE)

    const handlePreviewHover = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const aspectContainer = aspectContainerRef.current
        if (!aspectContainer) return

        // Early exit if nothing is selectable
        if (!canSelectBackground && !canSelectCursor && !canSelectWebcam && projectEffects.length === 0) return

        const containerRect = aspectContainer.getBoundingClientRect()

        const ctx: HitTestContext = {
            containerRect,
            clientX: event.clientX,
            clientY: event.clientY,
            canSelectBackground,
            canSelectCursor,
            canSelectWebcam,
            canSelectVideo,
            webcamClip,
            snapshot,
            aspectContainer,
            playerContainer: playerContainerRef?.current ?? null,
        }

        const nextState = getHoveredLayer(ctx)

        // Only update state if there's a meaningful change
        setHoverState(prev => shouldUpdateState(prev, nextState) ? nextState : prev)
    }, [
        aspectContainerRef,
        canSelectBackground,
        canSelectCursor,
        canSelectWebcam,
        canSelectVideo,
        playerContainerRef,
        webcamClip,
        snapshot,
        projectEffects.length
    ])

    const handlePreviewLeave = useCallback(() => {
        setHoverState(prev => prev.layer === null ? prev : INITIAL_HOVER_STATE)
    }, [])

    // Memoize the return value to maintain stable references
    return useMemo(() => ({
        hoveredLayer: hoverState.layer,
        cursorOverlay: hoverState.cursor,
        webcamOverlay: hoverState.webcam,
        annotationOverlay: hoverState.annotation,
        videoOverlay: hoverState.video,
        backgroundOverlay: hoverState.background,
        subtitleOverlay: hoverState.subtitle,
        keystrokeOverlay: hoverState.keystroke,
        handlePreviewHover,
        handlePreviewLeave,
    }), [hoverState, handlePreviewHover, handlePreviewLeave])
}

// Re-export types for consumers
export type { HoverState } from '@/features/ui/editor/logic/hover-hit-testing'
