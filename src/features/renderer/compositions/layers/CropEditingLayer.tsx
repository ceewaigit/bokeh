'use client'

/**
 * CropEditingLayer - Rendered inside the Remotion composition
 * 
 * Uses VideoPositionContext (SSOT) to get the exact video position.
 * Refactored to use useCanvasDrag for consistent drag behavior.
 */

import React, { useRef, useCallback } from 'react'
import { AbsoluteFill, getRemotionEnvironment } from 'remotion'
import { useVideoPosition } from '../../context/layout/VideoPositionContext'
import type { CropEffectData } from '@/types/project'
import { clampCropData, calculateCropTransform } from '@/features/canvas/math/transforms/crop-transform'
import { useCanvasDrag, type DragType, type CanvasDragDelta, type HandlePosition, getHandleCursorStyle } from '@/features/editor/hooks/use-canvas-drag'

interface CropEditingLayerProps {
    /** Whether crop editing is active */
    isEditingCrop: boolean
    /** Current crop data (0-1 normalized) */
    cropData: CropEffectData | null
    /** Called when crop changes during drag */
    onCropChange?: (cropData: CropEffectData) => void
    /** Called when user confirms the crop */
    onCropConfirm?: () => void
    /** Called when user resets/cancels the crop */
    onCropReset?: () => void
}

const HANDLE_SIZE = 10
const OVERLAY_SHADE = 'rgba(0, 0, 0, 0.6)'
const PRIMARY_COLOR = 'hsl(var(--primary))'
const ACCENT_COLOR = 'hsl(var(--accent))'

// Shadow similar to SelectionOverlay but slightly elevated for crop context
const HANDLE_SHADOW = '0 2px 5px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.1)'

export const CropEditingLayer: React.FC<CropEditingLayerProps> = ({
    isEditingCrop,
    cropData,
    onCropChange,
    onCropConfirm,
    onCropReset,
}) => {
    const { isRendering } = getRemotionEnvironment()
    const videoPosition = useVideoPosition()
    const overlayRef = useRef<HTMLDivElement>(null)

    // Get the video rect from VideoPositionContext
    const videoRect = {
        x: videoPosition.offsetX,
        y: videoPosition.offsetY,
        width: videoPosition.drawWidth,
        height: videoPosition.drawHeight,
    }

    const handleDrag = useCallback(
        (delta: CanvasDragDelta, dragType: DragType, initialCrop: CropEffectData | null) => {
            if (!initialCrop || !onCropChange || !cropData) return

            const deltaX = delta.x / videoRect.width
            const deltaY = delta.y / videoRect.height

            let newCrop = { ...initialCrop }

            if (dragType === 'move') {
                newCrop.x = initialCrop.x + deltaX
                newCrop.y = initialCrop.y + deltaY
            } else {
                switch (dragType) {
                    case 'top-left':
                        newCrop.x = initialCrop.x + deltaX
                        newCrop.y = initialCrop.y + deltaY
                        newCrop.width = initialCrop.width - deltaX
                        newCrop.height = initialCrop.height - deltaY
                        break
                    case 'top':
                        newCrop.y = initialCrop.y + deltaY
                        newCrop.height = initialCrop.height - deltaY
                        break
                    case 'top-right':
                        newCrop.y = initialCrop.y + deltaY
                        newCrop.width = initialCrop.width + deltaX
                        newCrop.height = initialCrop.height - deltaY
                        break
                    case 'right':
                        newCrop.width = initialCrop.width + deltaX
                        break
                    case 'bottom-right':
                        newCrop.width = initialCrop.width + deltaX
                        newCrop.height = initialCrop.height + deltaY
                        break
                    case 'bottom':
                        newCrop.height = initialCrop.height + deltaY
                        break
                    case 'bottom-left':
                        newCrop.x = initialCrop.x + deltaX
                        newCrop.width = initialCrop.width - deltaX
                        newCrop.height = initialCrop.height + deltaY
                        break
                    case 'left':
                        newCrop.x = initialCrop.x + deltaX
                        newCrop.width = initialCrop.width - deltaX
                        break
                }
            }

            newCrop = clampCropData(newCrop)
            onCropChange(newCrop)
        },
        [onCropChange, cropData, videoRect.width, videoRect.height]
    )

    const { startDrag } = useCanvasDrag<CropEffectData>({
        onDrag: handleDrag,
    })

    const handleMouseDown = (e: React.MouseEvent, type: DragType) => {
        if (!cropData) return
        startDrag({
            startX: e.clientX,
            startY: e.clientY,
            type,
            initialValue: cropData,
            activationDistance: 0,
        })
    }

    // Don't render during export or when not editing
    if (isRendering || !isEditingCrop || !cropData) {
        return null
    }

    // Convert crop data to pixel coordinates
    const cropRect = {
        x: videoRect.x + cropData.x * videoRect.width,
        y: videoRect.y + cropData.y * videoRect.height,
        width: cropData.width * videoRect.width,
        height: cropData.height * videoRect.height,
    }

    const cropTransform = calculateCropTransform(cropData, videoRect.width, videoRect.height)

    const renderHandle = (position: HandlePosition) => {
        let left = 0
        let top = 0

        switch (position) {
            case 'top-left':
                left = cropRect.x - HANDLE_SIZE / 2
                top = cropRect.y - HANDLE_SIZE / 2
                break
            case 'top':
                left = cropRect.x + cropRect.width / 2 - HANDLE_SIZE / 2
                top = cropRect.y - HANDLE_SIZE / 2
                break
            case 'top-right':
                left = cropRect.x + cropRect.width - HANDLE_SIZE / 2
                top = cropRect.y - HANDLE_SIZE / 2
                break
            case 'right':
                left = cropRect.x + cropRect.width - HANDLE_SIZE / 2
                top = cropRect.y + cropRect.height / 2 - HANDLE_SIZE / 2
                break
            case 'bottom-right':
                left = cropRect.x + cropRect.width - HANDLE_SIZE / 2
                top = cropRect.y + cropRect.height - HANDLE_SIZE / 2
                break
            case 'bottom':
                left = cropRect.x + cropRect.width / 2 - HANDLE_SIZE / 2
                top = cropRect.y + cropRect.height - HANDLE_SIZE / 2
                break
            case 'bottom-left':
                left = cropRect.x - HANDLE_SIZE / 2
                top = cropRect.y + cropRect.height - HANDLE_SIZE / 2
                break
            case 'left':
                left = cropRect.x - HANDLE_SIZE / 2
                top = cropRect.y + cropRect.height / 2 - HANDLE_SIZE / 2
                break
        }

        return (
            <div
                key={position}
                style={{
                    position: 'absolute',
                    left,
                    top,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    backgroundColor: 'white',
                    border: `1px solid ${ACCENT_COLOR}`,
                    borderRadius: '50%',
                    boxShadow: HANDLE_SHADOW,
                    cursor: getHandleCursorStyle(position),
                    zIndex: 20,
                    boxSizing: 'border-box',
                }}
                onMouseDown={(e) => handleMouseDown(e, position)}
            />
        )
    }

    return (
        <AbsoluteFill
            ref={overlayRef}
            style={{
                zIndex: 1000,
                pointerEvents: 'auto',
            }}
        >
            {/* Darkened regions outside crop */}
            <div
                style={{
                    position: 'absolute',
                    left: videoRect.x,
                    top: videoRect.y,
                    width: videoRect.width,
                    height: Math.max(0, cropRect.y - videoRect.y),
                    backgroundColor: OVERLAY_SHADE,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    left: videoRect.x,
                    top: cropRect.y + cropRect.height,
                    width: videoRect.width,
                    height: Math.max(0, videoRect.y + videoRect.height - (cropRect.y + cropRect.height)),
                    backgroundColor: OVERLAY_SHADE,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    left: videoRect.x,
                    top: cropRect.y,
                    width: Math.max(0, cropRect.x - videoRect.x),
                    height: cropRect.height,
                    backgroundColor: OVERLAY_SHADE,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    left: cropRect.x + cropRect.width,
                    top: cropRect.y,
                    width: Math.max(0, videoRect.x + videoRect.width - (cropRect.x + cropRect.width)),
                    height: cropRect.height,
                    backgroundColor: OVERLAY_SHADE,
                }}
            />

            {/* Crop region border */}
            <div
                style={{
                    position: 'absolute',
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.width,
                    height: cropRect.height,
                    border: `1px solid ${ACCENT_COLOR}`,
                    cursor: 'move',
                    zIndex: 10,
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
                }}
                onMouseDown={(e) => handleMouseDown(e, 'move')}
            >
                {/* Grid lines for thirds */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: '33.33%',
                            borderLeft: '1px solid rgba(255,255,255,0.25)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: '66.67%',
                            borderLeft: '1px solid rgba(255,255,255,0.25)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '33.33%',
                            borderTop: '1px solid rgba(255,255,255,0.25)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '66.67%',
                            borderTop: '1px solid rgba(255,255,255,0.25)',
                        }}
                    />
                </div>
            </div>

            {/* Resize handles */}
            {renderHandle('top-left')}
            {renderHandle('top')}
            {renderHandle('top-right')}
            {renderHandle('right')}
            {renderHandle('bottom-right')}
            {renderHandle('bottom')}
            {renderHandle('bottom-left')}
            {renderHandle('left')}

            {/* Crop info display */}
            <div
                style={{
                    position: 'absolute',
                    left: cropRect.x + cropRect.width / 2,
                    top: cropRect.y - 32,
                    transform: 'translateX(-50%)',
                    padding: '4px 8px',
                    backgroundColor: 'rgba(20,20,20,0.9)',
                    color: 'rgba(255,255,255,0.95)',
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: 'system-ui, sans-serif',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 30,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
            >
                {Math.round(cropData.width * 100)}% x {Math.round(cropData.height * 100)}%
            </div>

            {/* Live preview indicator */}
            {
                cropTransform.isActive && (
                    <div
                        style={{
                            position: 'absolute',
                            left: cropRect.x + cropRect.width / 2,
                            top: cropRect.y + cropRect.height + 12,
                            transform: 'translateX(-50%)',
                            padding: '4px 10px',
                            backgroundColor: 'rgba(20,20,20,0.85)',
                            color: 'rgba(255,255,255,0.95)',
                            fontSize: 12,
                            fontWeight: 500,
                            fontFamily: 'system-ui, sans-serif',
                            borderRadius: 999,
                            border: `1px solid ${ACCENT_COLOR}`,
                            backdropFilter: 'blur(8px)',
                            zIndex: 40,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        }}
                    >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: ACCENT_COLOR, boxShadow: `0 0 6px ${ACCENT_COLOR}` }} />
                        <span>Live Preview {cropTransform.scale.toFixed(1)}x</span>
                    </div>
                )
            }

            {/* Action buttons */}
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: 24,
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 8,
                    zIndex: 30,
                    padding: 6,
                    borderRadius: 14,
                    backgroundColor: 'rgba(20,20,20,0.6)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                }}
            >
                <button
                    onClick={onCropConfirm}
                    className="hover:brightness-110 active:scale-95 transition-all"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        backgroundColor: PRIMARY_COLOR,
                        color: 'hsl(var(--primary-foreground))',
                        border: 'none',
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Confirm
                </button>
                <button
                    onClick={onCropReset}
                    className="hover:bg-white/10 active:scale-95 transition-all"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        backgroundColor: 'transparent',
                        color: 'rgba(255,255,255,0.9)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                    </svg>
                    Reset
                </button>
            </div>
        </AbsoluteFill >
    )
}
