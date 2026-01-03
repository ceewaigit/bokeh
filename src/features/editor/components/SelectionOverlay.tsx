import React from 'react'
import type { HandlePosition } from '@/features/editor/logic/hit-testing'
import { AnnotationType } from '@/types/project'

interface SelectionBounds {
    x: number
    y: number
    width: number
    height: number
}

interface SelectionOverlayProps {
    annotationId: string
    annotationType: AnnotationType
    bounds: SelectionBounds
    borderRadius?: number | string
    showHandles?: boolean
    showRotation?: boolean
}

export const SELECTION_HANDLE_SIZE = 8
const ROTATION_HANDLE_DISTANCE = 14
const BORDER_COLOR = 'hsl(var(--accent))'
const HANDLE_SHADOW = `0 1px 3px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)`

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

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
    annotationId,
    annotationType,
    bounds,
    borderRadius = 0,
    showHandles = true,
    showRotation = true,
}) => {
    return (
        <div
            data-selection-overlay="true"
            data-annotation-id={annotationId}
            data-annotation-type={annotationType}
            style={{
                position: 'absolute',
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                pointerEvents: 'none',
                zIndex: 10,
                boxSizing: 'border-box',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius,
                    border: `1px solid ${BORDER_COLOR}`,
                    pointerEvents: 'none',
                    boxSizing: 'border-box',
                }}
            />

            {showHandles && HANDLE_POSITIONS.map((handle) => (
                <div
                    key={handle.id}
                    data-handle={handle.id}
                    style={{
                        position: 'absolute',
                        left: handle.x,
                        top: handle.y,
                        width: SELECTION_HANDLE_SIZE,
                        height: SELECTION_HANDLE_SIZE,
                        backgroundColor: 'white',
                        border: `1px solid ${BORDER_COLOR}`,
                        borderRadius: '50%',
                        transform: 'translate3d(-50%, -50%, 0)',
                        cursor: handle.cursor,
                        pointerEvents: 'auto',
                        boxShadow: HANDLE_SHADOW,
                        boxSizing: 'border-box',
                    }}
                />
            ))}

            {showRotation && (
                <>
                    <div
                        data-handle="rotate"
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: -ROTATION_HANDLE_DISTANCE,
                            width: SELECTION_HANDLE_SIZE * 2,
                            height: SELECTION_HANDLE_SIZE * 2,
                            backgroundColor: 'white',
                            border: `1px solid ${BORDER_COLOR}`,
                            borderRadius: '50%',
                            transform: 'translate3d(-50%, -50%, 0)',
                            cursor: 'grab',
                            pointerEvents: 'auto',
                            boxShadow: HANDLE_SHADOW,
                            boxSizing: 'border-box',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <svg
                            width={SELECTION_HANDLE_SIZE * 1.4}
                            height={SELECTION_HANDLE_SIZE * 1.4}
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66M17 4v4h-4M7 20v-4h4"
                                fill="none"
                                stroke={BORDER_COLOR}
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                </>
            )}
        </div>
    )
}
