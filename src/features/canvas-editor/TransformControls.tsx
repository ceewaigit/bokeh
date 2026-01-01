'use client'

import React, { useMemo } from 'react'
import type { Effect, AnnotationData, PluginEffectData } from '@/types/project'
import { EffectType, AnnotationType } from '@/types/project'
import { isResizableEffect, type HandlePosition } from '@/lib/canvas-editor/hit-testing'
import { measureAnnotationBox } from '@/lib/canvas-editor/annotation-utils'
import { useVideoPosition } from '@/remotion/context/layout/VideoPositionContext'

interface TransformControlsProps {
    effect: Effect
    containerRef?: React.RefObject<HTMLElement | null>
    isResizing: boolean
}

const HANDLE_SIZE = 12 // Visual size in pixels
const ROTATION_HANDLE_DISTANCE = 30 // Distance above the element

/**
 * Calculate annotation bounds from data (not DOM measurement)
 * This ensures the selection box tracks the annotation correctly during zoom/pan/rotation
 */
function calculateBoundsFromData(
    effect: Effect,
    videoWidth: number,
    videoHeight: number,
    offsetX: number,
    offsetY: number,
    scale: number,
    cameraTransform?: { scale: number; panX: number; panY: number } | null
): { x: number; y: number; width: number; height: number; centerX: number; centerY: number; rotation: number } | null {
    if (effect.type === EffectType.Annotation) {
        const data = effect.data as AnnotationData
        if (!data.position) return null

        const rotation = data.rotation ?? 0
        const pos = data.position

        // Convert percent to pixels (relative to video)
        let rawX = offsetX + (pos.x / 100) * videoWidth
        let rawY = offsetY + (pos.y / 100) * videoHeight

        // Apply camera transform if zoomed
        if (cameraTransform && cameraTransform.scale !== 1) {
            const centerX = offsetX + videoWidth / 2
            const centerY = offsetY + videoHeight / 2
            rawX = centerX + (rawX - centerX) * cameraTransform.scale + cameraTransform.panX
            rawY = centerY + (rawY - centerY) * cameraTransform.scale + cameraTransform.panY
        }

        const effectiveScale = scale * (cameraTransform?.scale ?? 1)

        if (data.type === AnnotationType.Highlight) {
            // Highlight uses top-left anchor
            const width = ((data.width ?? 20) / 100) * videoWidth * (cameraTransform?.scale ?? 1)
            const height = ((data.height ?? 10) / 100) * videoHeight * (cameraTransform?.scale ?? 1)
            return {
                x: rawX,
                y: rawY,
                width,
                height,
                centerX: rawX + width / 2,
                centerY: rawY + height / 2,
                rotation,
            }
        }

        if (data.type === AnnotationType.Arrow) {
            // Arrow bounds from start to end
            const endPos = data.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }
            let endX = offsetX + (endPos.x / 100) * videoWidth
            let endY = offsetY + (endPos.y / 100) * videoHeight

            // Apply camera transform to end point
            if (cameraTransform && cameraTransform.scale !== 1) {
                const centerX = offsetX + videoWidth / 2
                const centerY = offsetY + videoHeight / 2
                endX = centerX + (endX - centerX) * cameraTransform.scale + cameraTransform.panX
                endY = centerY + (endY - centerY) * cameraTransform.scale + cameraTransform.panY
            }

            const padding = 10
            const minX = Math.min(rawX, endX) - padding
            const minY = Math.min(rawY, endY) - padding
            const maxX = Math.max(rawX, endX) + padding
            const maxY = Math.max(rawY, endY) + padding

            return {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
                centerX: (rawX + endX) / 2,
                centerY: (rawY + endY) / 2,
                rotation,
            }
        }

        // Text/Keyboard: measure content and center-anchor
        const measured = measureAnnotationBox(data)
        const width = measured.width * effectiveScale
        const height = measured.height * effectiveScale

        return {
            x: rawX - width / 2,
            y: rawY - height / 2,
            width,
            height,
            centerX: rawX,
            centerY: rawY,
            rotation,
        }
    }

    if (effect.type === EffectType.Plugin) {
        const data = effect.data as PluginEffectData
        if (!data.position) return null

        const pos = data.position
        let rawX = offsetX + (pos.x / 100) * videoWidth
        let rawY = offsetY + (pos.y / 100) * videoHeight

        // Apply camera transform if zoomed
        if (cameraTransform && cameraTransform.scale !== 1) {
            const centerX = offsetX + videoWidth / 2
            const centerY = offsetY + videoHeight / 2
            rawX = centerX + (rawX - centerX) * cameraTransform.scale + cameraTransform.panX
            rawY = centerY + (rawY - centerY) * cameraTransform.scale + cameraTransform.panY
        }

        const width = (pos.width ?? 100) * (cameraTransform?.scale ?? 1)
        const height = (pos.height ?? 100) * (cameraTransform?.scale ?? 1)

        return {
            x: rawX - width / 2,
            y: rawY - height / 2,
            width,
            height,
            centerX: rawX,
            centerY: rawY,
            rotation: 0, // Plugins don't rotate
        }
    }

    return null
}

/**
 * TransformControls - Selection box overlay for annotations
 *
 * Calculates position from annotation data (not DOM measurement).
 * This ensures pixel-perfect tracking during zoom/pan/rotation.
 * Uses inverse-scaling for handles so they remain constant size visually.
 */
export const TransformControls: React.FC<TransformControlsProps> = ({
    effect,
    containerRef,
    isResizing,
}) => {
    const videoPosition = useVideoPosition()

    // Calculate scale from video dimensions
    const scale = useMemo(() => {
        // Assume original video is 1920 width if not specified
        const originalWidth = 1920
        return videoPosition.drawWidth / originalWidth
    }, [videoPosition.drawWidth])

    // Get camera transform for zoom
    const cameraTransform = useMemo(() => {
        if (!videoPosition.zoomTransform) return null
        const zt = videoPosition.zoomTransform
        if (zt.scale === 1 && zt.panX === 0 && zt.panY === 0) return null
        return { scale: zt.scale, panX: zt.panX, panY: zt.panY }
    }, [videoPosition.zoomTransform])

    const bounds = useMemo(() => calculateBoundsFromData(
        effect,
        videoPosition.drawWidth,
        videoPosition.drawHeight,
        videoPosition.offsetX,
        videoPosition.offsetY,
        scale,
        cameraTransform
    ), [effect, videoPosition, scale, cameraTransform])

    if (!bounds || bounds.width === 0 || bounds.height === 0) return null

    const canResize = isResizableEffect(effect)
    const rotation = bounds.rotation
    const zoomScale = cameraTransform?.scale ?? 1

    // Inverse scale for handles - they stay constant size regardless of zoom
    const inverseScale = 1 / zoomScale
    const handleVisualSize = HANDLE_SIZE * inverseScale
    const borderWidth = 1.5 * inverseScale
    const rotationDistance = ROTATION_HANDLE_DISTANCE * inverseScale

    // Visual style
    const borderColor = '#3b82f6' // Blue-500

    // Handle definitions
    const handles: { id: HandlePosition; x: string | number; y: string | number; cursor: string }[] = [
        { id: 'top-left', x: 0, y: 0, cursor: 'nwse-resize' },
        { id: 'top', x: '50%', y: 0, cursor: 'ns-resize' },
        { id: 'top-right', x: '100%', y: 0, cursor: 'nesw-resize' },
        { id: 'right', x: '100%', y: '50%', cursor: 'ew-resize' },
        { id: 'bottom-right', x: '100%', y: '100%', cursor: 'nwse-resize' },
        { id: 'bottom', x: '50%', y: '100%', cursor: 'ns-resize' },
        { id: 'bottom-left', x: 0, y: '100%', cursor: 'nesw-resize' },
        { id: 'left', x: 0, y: '50%', cursor: 'ew-resize' },
    ]

    // For rotated elements, position the container at center and use transform
    const useRotatedLayout = rotation !== 0

    return (
        <div
            data-transform-controls={effect.id}
            className="absolute pointer-events-none"
            style={useRotatedLayout ? {
                // Position at center and rotate
                left: bounds.centerX,
                top: bounds.centerY,
                width: bounds.width,
                height: bounds.height,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                border: `${borderWidth}px solid ${borderColor}`,
                boxSizing: 'border-box',
            } : {
                // Non-rotated: simple positioning
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                border: `${borderWidth}px solid ${borderColor}`,
                boxSizing: 'border-box',
            }}
        >
            {/* Resize Handles */}
            {canResize && handles.map((handle) => (
                <div
                    key={handle.id}
                    data-handle={handle.id}
                    className="absolute bg-white rounded-full box-border"
                    style={{
                        left: handle.x,
                        top: handle.y,
                        width: handleVisualSize,
                        height: handleVisualSize,
                        border: `${inverseScale}px solid ${borderColor}`,
                        transform: 'translate(-50%, -50%)',
                        cursor: handle.cursor,
                        pointerEvents: 'auto',
                    }}
                />
            ))}

            {/* Rotation Handle - only for annotations with rotation support */}
            {canResize && effect.type === EffectType.Annotation && (
                <>
                    {/* Connector line */}
                    <div
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: 0,
                            width: inverseScale,
                            height: rotationDistance,
                            backgroundColor: borderColor,
                            transform: 'translateX(-50%) translateY(-100%)',
                            pointerEvents: 'none',
                        }}
                    />
                    {/* Rotation handle */}
                    <div
                        data-handle="rotate"
                        className="absolute bg-white rounded-full box-border"
                        style={{
                            left: '50%',
                            top: -rotationDistance,
                            width: handleVisualSize,
                            height: handleVisualSize,
                            border: `${inverseScale}px solid ${borderColor}`,
                            transform: 'translate(-50%, -50%)',
                            cursor: 'grab',
                            pointerEvents: 'auto',
                        }}
                    />
                </>
            )}
        </div>
    )
}
