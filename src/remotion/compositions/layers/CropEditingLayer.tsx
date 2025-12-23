'use client'

/**
 * CropEditingLayer - Rendered inside the Remotion composition
 * 
 * Uses VideoPositionContext (SSOT) to get the exact video position,
 * matching the same coordinate system as CursorLayer and other overlays.
 * This ensures the crop overlay is positioned correctly relative to the video.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react'
import { AbsoluteFill, getRemotionEnvironment } from 'remotion'
import { useVideoPosition } from '../../context/VideoPositionContext'
import type { CropEffectData } from '@/types/project'
import { clampCropData, calculateCropTransform, getCropTransformString } from '../utils/crop-transform'

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

type HandlePosition =
    | 'top-left'
    | 'top'
    | 'top-right'
    | 'right'
    | 'bottom-right'
    | 'bottom'
    | 'bottom-left'
    | 'left'

const HANDLE_SIZE = 12

export const CropEditingLayer: React.FC<CropEditingLayerProps> = ({
    isEditingCrop,
    cropData,
    onCropChange,
    onCropConfirm,
    onCropReset,
}) => {
    const { isRendering } = getRemotionEnvironment()

    // Get video position from the SSOT (VideoPositionContext)
    const videoPosition = useVideoPosition()

    const overlayRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragType, setDragType] = useState<'move' | HandlePosition | null>(null)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [initialCrop, setInitialCrop] = useState<CropEffectData>({ x: 0, y: 0, width: 1, height: 1 })

    // Get the video rect from VideoPositionContext
    const videoRect = {
        x: videoPosition.offsetX,
        y: videoPosition.offsetY,
        width: videoPosition.drawWidth,
        height: videoPosition.drawHeight,
    }

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !dragType || !onCropChange || !cropData) return

        const deltaX = (e.clientX - dragStart.x) / videoRect.width
        const deltaY = (e.clientY - dragStart.y) / videoRect.height

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
    }, [isDragging, dragType, dragStart, initialCrop, videoRect.width, videoRect.height, onCropChange, cropData])

    const handleMouseUp = useCallback(() => {
        setIsDragging(false)
        setDragType(null)
    }, [])

    // Global mouse event listeners
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
            return () => {
                window.removeEventListener('mousemove', handleMouseMove)
                window.removeEventListener('mouseup', handleMouseUp)
            }
        }
    }, [isDragging, handleMouseMove, handleMouseUp])

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

    // Calculate the crop transform to show what the final result will look like
    // This uses the exact same math as the actual crop effect in SharedVideoController
    const cropTransform = calculateCropTransform(cropData, videoRect.width, videoRect.height)
    const cropTransformStr = getCropTransformString(cropTransform)

    const handleMouseDown = (e: React.MouseEvent, type: 'move' | HandlePosition) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
        setDragType(type)
        setDragStart({ x: e.clientX, y: e.clientY })
        setInitialCrop(cropData)
    }

    const getCursor = (position: HandlePosition): string => {
        switch (position) {
            case 'top-left':
            case 'bottom-right':
                return 'nwse-resize'
            case 'top-right':
            case 'bottom-left':
                return 'nesw-resize'
            case 'top':
            case 'bottom':
                return 'ns-resize'
            case 'left':
            case 'right':
                return 'ew-resize'
            default:
                return 'default'
        }
    }

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
                    border: '2px solid hsl(267.84 83.51% 60%)',
                    borderRadius: 2,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    cursor: getCursor(position),
                    zIndex: 20,
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
            {/* Top */}
            <div
                style={{
                    position: 'absolute',
                    left: videoRect.x,
                    top: videoRect.y,
                    width: videoRect.width,
                    height: Math.max(0, cropRect.y - videoRect.y),
                    backgroundColor: 'rgba(0,0,0,0.6)',
                }}
            />
            {/* Bottom */}
            <div
                style={{
                    position: 'absolute',
                    left: videoRect.x,
                    top: cropRect.y + cropRect.height,
                    width: videoRect.width,
                    height: Math.max(0, videoRect.y + videoRect.height - (cropRect.y + cropRect.height)),
                    backgroundColor: 'rgba(0,0,0,0.6)',
                }}
            />
            {/* Left */}
            <div
                style={{
                    position: 'absolute',
                    left: videoRect.x,
                    top: cropRect.y,
                    width: Math.max(0, cropRect.x - videoRect.x),
                    height: cropRect.height,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                }}
            />
            {/* Right */}
            <div
                style={{
                    position: 'absolute',
                    left: cropRect.x + cropRect.width,
                    top: cropRect.y,
                    width: Math.max(0, videoRect.x + videoRect.width - (cropRect.x + cropRect.width)),
                    height: cropRect.height,
                    backgroundColor: 'rgba(0,0,0,0.6)',
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
                    border: '2px solid hsl(267.84 83.51% 60%)',
                    cursor: 'move',
                    zIndex: 10,
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
                            borderLeft: '1px solid rgba(255,255,255,0.3)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: '66.67%',
                            borderLeft: '1px solid rgba(255,255,255,0.3)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '33.33%',
                            borderTop: '1px solid rgba(255,255,255,0.3)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '66.67%',
                            borderTop: '1px solid rgba(255,255,255,0.3)',
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
                    top: cropRect.y - 28,
                    transform: 'translateX(-50%)',
                    padding: '4px 8px',
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    color: 'white',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    borderRadius: 4,
                    zIndex: 30,
                }}
            >
                {Math.round(cropData.width * 100)}% x {Math.round(cropData.height * 100)}%
            </div>

            {/* Live preview indicator - shows the transform that will be applied */}
            {
                cropTransform.isActive && (
                    <div
                        style={{
                            position: 'absolute',
                            left: cropRect.x + cropRect.width / 2,
                            top: cropRect.y + cropRect.height + 8,
                            transform: 'translateX(-50%)',
                            padding: '4px 8px',
                            backgroundColor: 'hsl(267.84 83.51% 60% / 0.9)',
                            color: 'white',
                            fontSize: 11,
                            fontFamily: 'system-ui, sans-serif',
                            borderRadius: 4,
                            zIndex: 30,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <span style={{ opacity: 0.8 }}>🔍</span>
                        <span>{cropTransform.scale.toFixed(2)}x zoom</span>
                    </div>
                )
            }

            {/* Action buttons */}
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: 20,
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 8,
                    zIndex: 30,
                }}
            >
                <button
                    onClick={onCropConfirm}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        backgroundColor: 'hsl(267.84 83.51% 60%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    ✓ Confirm
                </button>
                <button
                    onClick={onCropReset}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    ↺ Reset crop
                </button>
            </div>
        </AbsoluteFill >
    )
}
