/**
 * SelectionBox - CSS-based selection overlay with resize and rotation handles
 *
 * This component renders INSIDE the annotation wrapper, using CSS `inset: 0`
 * to exactly match the annotation's bounds. No coordinate calculation needed.
 *
 * Handles are inverse-scaled to maintain constant visual size regardless of zoom.
 */

import React, { memo } from 'react'
import { useVideoPosition } from '@/features/renderer/context/layout/VideoPositionContext'
import type { HandlePosition } from '@/features/editor/logic/hit-testing'

interface SelectionBoxProps {
    /** Whether to show resize handles */
    showHandles?: boolean
    /** Whether to show rotation handle */
    showRotation?: boolean
    /** Current annotation rotation in degrees (for positioning rotation handle) */
    rotation?: number
}

const HANDLE_SIZE = 10 // Base size in pixels
const ROTATION_HANDLE_DISTANCE = 24 // Distance above selection box
const BORDER_COLOR = '#3b82f6' // Blue-500

/**
 * Resize handle positions (relative to selection box)
 */
const HANDLE_POSITIONS: { id: HandlePosition; x: string | number; y: string | number; cursor: string }[] = [
    { id: 'top-left', x: 0, y: 0, cursor: 'nwse-resize' },
    { id: 'top', x: '50%', y: 0, cursor: 'ns-resize' },
    { id: 'top-right', x: '100%', y: 0, cursor: 'nesw-resize' },
    { id: 'right', x: '100%', y: '50%', cursor: 'ew-resize' },
    { id: 'bottom-right', x: '100%', y: '100%', cursor: 'nwse-resize' },
    { id: 'bottom', x: '50%', y: '100%', cursor: 'ns-resize' },
    { id: 'bottom-left', x: 0, y: '100%', cursor: 'nesw-resize' },
    { id: 'left', x: 0, y: '50%', cursor: 'ew-resize' },
]

export const SelectionBox: React.FC<SelectionBoxProps> = memo(({
    showHandles = true,
    showRotation = true,
    rotation = 0,
}) => {
    // Get zoom scale for inverse-scaling handles
    const videoPosition = useVideoPosition()
    const zoomScale = (videoPosition.zoomTransform as any)?.scale ?? 1

    // Inverse scale - handles stay constant size regardless of zoom
    const inverseScale = 1 / zoomScale
    const handleSize = HANDLE_SIZE * inverseScale
    const borderWidth = 1.5 * inverseScale
    const rotationDistance = ROTATION_HANDLE_DISTANCE * inverseScale
    const handleBorderWidth = inverseScale

    return (
        <div
            data-selection-box="true"
            style={{
                position: 'absolute',
                inset: 0, // Key: exactly matches parent bounds
                border: `${borderWidth}px solid ${BORDER_COLOR}`,
                boxSizing: 'border-box',
                pointerEvents: 'none',
                zIndex: 1000,
            }}
        >
            {/* Resize Handles */}
            {showHandles && HANDLE_POSITIONS.map((handle) => (
                <div
                    key={handle.id}
                    data-handle={handle.id}
                    style={{
                        position: 'absolute',
                        left: handle.x,
                        top: handle.y,
                        width: handleSize,
                        height: handleSize,
                        backgroundColor: 'white',
                        border: `${handleBorderWidth}px solid ${BORDER_COLOR}`,
                        borderRadius: '50%',
                        transform: 'translate(-50%, -50%)',
                        cursor: handle.cursor,
                        pointerEvents: 'auto',
                        boxSizing: 'border-box',
                    }}
                />
            ))}

            {/* Rotation Handle */}
            {showRotation && (
                <>
                    {/* Connector line */}
                    <div
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: 0,
                            width: handleBorderWidth,
                            height: rotationDistance,
                            backgroundColor: BORDER_COLOR,
                            transform: 'translateX(-50%) translateY(-100%)',
                            pointerEvents: 'none',
                        }}
                    />
                    {/* Rotation handle */}
                    <div
                        data-handle="rotate"
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: -rotationDistance,
                            width: handleSize,
                            height: handleSize,
                            backgroundColor: 'white',
                            border: `${handleBorderWidth}px solid ${BORDER_COLOR}`,
                            borderRadius: '50%',
                            transform: 'translate(-50%, -50%)',
                            cursor: 'grab',
                            pointerEvents: 'auto',
                            boxSizing: 'border-box',
                        }}
                    />
                </>
            )}
        </div>
    )
})

SelectionBox.displayName = 'SelectionBox'
