/**
 * AnnotationWrapper - Unified container for annotation content and selection
 *
 * This wrapper renders:
 * 1. The positioned container (absolute position based on annotation data)
 * 2. The annotation content (TextAnnotation, KeyboardAnnotation, etc.)
 * 3. The selection overlay with handles (when selected)
 *
 * Key design principle: Selection is a CHILD of the annotation, not a separate overlay.
 * This eliminates all coordinate mismatches since CSS handles alignment automatically.
 */

import React, { memo, useCallback, useRef, useEffect } from 'react'
import { getRemotionEnvironment } from 'remotion'
import { AnnotationType } from '@/types/project'
import type { AnnotationData, AnnotationStyle } from '@/types/project'
import { SelectionBox } from './SelectionBox'
import type { AnnotationRenderContext } from './annotation-elements'

interface AnnotationWrapperProps {
    id: string
    data: AnnotationData
    context: AnnotationRenderContext
    isSelected: boolean
    isEditing: boolean
    onContentChange?: (content: string) => void
    onEditComplete?: () => void
}

/**
 * Convert percentage position to pixel position
 */
function percentToPixel(
    percent: number,
    containerSize: number,
    offset: number
): number {
    return offset + (percent / 100) * containerSize
}

/**
 * Resolve padding from style
 */
function resolvePadding(padding?: AnnotationStyle['padding']): number {
    if (typeof padding === 'number') return padding
    if (!padding || typeof padding !== 'object') return 12
    const p = padding as { top: number; right: number; bottom: number; left: number }
    return Math.max(p.top, p.right, p.bottom, p.left)
}

/**
 * Get computed position for annotation
 */
function getComputedPosition(
    data: AnnotationData,
    context: AnnotationRenderContext
): { x: number; y: number } {
    const pos = data.position ?? { x: 50, y: 50 }
    return {
        x: percentToPixel(pos.x, context.videoWidth, context.offsetX),
        y: percentToPixel(pos.y, context.videoHeight, context.offsetY),
    }
}

// ============================================================================
// Editable Text Content
// ============================================================================

interface EditableTextContentProps {
    data: AnnotationData
    context: AnnotationRenderContext
    isEditing: boolean
    onContentChange?: (content: string) => void
    onEditComplete?: () => void
}

const EditableTextContent: React.FC<EditableTextContentProps> = memo(({
    data,
    context,
    isEditing,
    onContentChange,
    onEditComplete,
}) => {
    const contentRef = useRef<HTMLDivElement>(null)
    const style = data.style ?? {}

    // Camera scale from context (for font sizing during zoom)
    const cameraScale = context.cameraTransform?.scale ?? 1
    const effectiveScale = (context.scale ?? 1) * cameraScale

    const fontSize = (style.fontSize ?? 18) * effectiveScale
    const fontFamily = style.fontFamily ?? 'system-ui, -apple-system, sans-serif'
    const fontWeight = style.fontWeight ?? 'normal'
    const color = style.color ?? '#ffffff'
    const bgColor = style.backgroundColor
    const padding = resolvePadding(style.padding) * effectiveScale
    const borderRadius = (style.borderRadius ?? 4) * effectiveScale

    // Focus on edit start
    useEffect(() => {
        if (isEditing && contentRef.current) {
            contentRef.current.focus()
            // Move cursor to end
            const range = document.createRange()
            range.selectNodeContents(contentRef.current)
            range.collapse(false)
            const sel = window.getSelection()
            sel?.removeAllRanges()
            sel?.addRange(range)
        }
    }, [isEditing])

    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
        onContentChange?.(e.currentTarget.textContent || '')
    }, [onContentChange])

    const handleBlur = useCallback(() => {
        onEditComplete?.()
    }, [onEditComplete])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            contentRef.current?.blur()
        }
        if (e.key === 'Escape') {
            onEditComplete?.()
        }
        // Don't propagate to prevent keyboard shortcuts during editing
        e.stopPropagation()
    }, [onEditComplete])

    return (
        <div
            ref={contentRef}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onInput={handleInput}
            onBlur={handleBlur}
            onKeyDown={isEditing ? handleKeyDown : undefined}
            style={{
                fontSize,
                fontFamily,
                fontWeight: fontWeight as React.CSSProperties['fontWeight'],
                color,
                backgroundColor: bgColor,
                padding: bgColor ? padding : 0,
                borderRadius: bgColor ? borderRadius : 0,
                whiteSpace: 'pre-wrap',
                cursor: isEditing ? 'text' : 'inherit',
                outline: 'none',
                contain: 'layout style paint',
                willChange: 'transform',
                userSelect: isEditing ? 'text' : 'none',
            }}
        >
            {data.content ?? 'Text'}
        </div>
    )
})
EditableTextContent.displayName = 'EditableTextContent'

// ============================================================================
// Keyboard Annotation Content
// ============================================================================

interface KeyboardContentProps {
    data: AnnotationData
    context: AnnotationRenderContext
}

const KeyboardContent: React.FC<KeyboardContentProps> = memo(({
    data,
    context,
}) => {
    const style = data.style ?? {}
    const keys = data.keys ?? ['Cmd', 'S']
    const displayLabel = keys.join(' + ')

    const cameraScale = context.cameraTransform?.scale ?? 1
    const effectiveScale = (context.scale ?? 1) * cameraScale

    const fontSize = (style.fontSize ?? 16) * effectiveScale
    const fontFamily = style.fontFamily ?? 'system-ui, -apple-system, sans-serif'
    const fontWeight = style.fontWeight ?? 600
    const color = style.color ?? '#ffffff'
    const bgColor = style.backgroundColor ?? 'rgba(0, 0, 0, 0.65)'
    const borderColor = style.borderColor ?? 'rgba(255, 255, 255, 0.15)'
    const padding = (resolvePadding(style.padding) || 10) * effectiveScale
    const borderRadius = (style.borderRadius ?? 8) * effectiveScale
    const gap = 4 * effectiveScale

    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap,
                fontSize,
                fontFamily,
                fontWeight: fontWeight as React.CSSProperties['fontWeight'],
                color,
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                padding: `${padding * 0.6}px ${padding}px`,
                borderRadius,
                whiteSpace: 'nowrap',
                cursor: 'inherit',
                outline: 'none',
                contain: 'layout style paint',
                willChange: 'transform',
                userSelect: 'none',
            }}
        >
            {displayLabel}
        </div>
    )
})
KeyboardContent.displayName = 'KeyboardContent'

// ============================================================================
// Highlight Annotation Content
// ============================================================================

interface HighlightContentProps {
    data: AnnotationData
    context: AnnotationRenderContext
}

const HighlightContent: React.FC<HighlightContentProps> = memo(({
    data,
    context,
}) => {
    const style = data.style ?? {}

    // Width/height are percentages of video dimensions
    const width = ((data.width ?? 20) / 100) * context.videoWidth
    const height = ((data.height ?? 10) / 100) * context.videoHeight

    const bgColor = style.backgroundColor ?? 'rgba(255, 255, 0, 0.3)'
    const borderColor = style.borderColor
    const borderWidth = style.borderWidth ?? 0

    return (
        <div
            style={{
                width,
                height,
                backgroundColor: bgColor,
                border: borderColor ? `${borderWidth}px solid ${borderColor}` : 'none',
                borderRadius: style.borderRadius ?? 0,
                contain: 'layout style paint',
                willChange: 'transform',
            }}
        />
    )
})
HighlightContent.displayName = 'HighlightContent'

// ============================================================================
// Arrow Annotation Content
// ============================================================================

interface ArrowContentProps {
    id: string
    data: AnnotationData
    context: AnnotationRenderContext
}

const ArrowContent: React.FC<ArrowContentProps> = memo(({
    id,
    data,
    context,
}) => {
    const style = data.style ?? {}
    const pos = data.position ?? { x: 50, y: 50 }

    // Arrow goes from start to end position
    const rawEnd = data.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }

    // Calculate positions relative to the wrapper (which is at start position)
    // For arrows, the wrapper is positioned at the bounding box min
    const startX = percentToPixel(pos.x, context.videoWidth, context.offsetX)
    const startY = percentToPixel(pos.y, context.videoHeight, context.offsetY)
    const endX = percentToPixel(rawEnd.x, context.videoWidth, context.offsetX)
    const endY = percentToPixel(rawEnd.y, context.videoHeight, context.offsetY)

    const color = style.color ?? '#ff0000'
    const strokeWidth = style.strokeWidth ?? 3
    const arrowHeadSize = style.arrowHeadSize ?? 10

    // Calculate bounds
    const padding = Math.max(strokeWidth, arrowHeadSize) + 4
    const minX = Math.min(startX, endX) - padding
    const minY = Math.min(startY, endY) - padding
    const maxX = Math.max(startX, endX) + padding
    const maxY = Math.max(startY, endY) + padding
    const boxW = maxX - minX
    const boxH = maxY - minY

    // Coordinates relative to SVG viewBox
    const svgStartX = startX - minX
    const svgStartY = startY - minY
    const svgEndX = endX - minX
    const svgEndY = endY - minY

    return (
        <svg
            style={{
                width: boxW,
                height: boxH,
                overflow: 'visible',
                pointerEvents: 'none',
                contain: 'layout style',
            }}
        >
            <defs>
                <marker
                    id={`arrowhead-${id}`}
                    markerWidth={arrowHeadSize}
                    markerHeight={arrowHeadSize}
                    refX={arrowHeadSize}
                    refY={arrowHeadSize / 2}
                    orient="auto"
                >
                    <polygon
                        points={`0,0 ${arrowHeadSize},${arrowHeadSize / 2} 0,${arrowHeadSize}`}
                        fill={color}
                    />
                </marker>
            </defs>
            <line
                x1={svgStartX}
                y1={svgStartY}
                x2={svgEndX}
                y2={svgEndY}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                markerEnd={`url(#arrowhead-${id})`}
                style={{ pointerEvents: 'visibleStroke', cursor: 'default' }}
            />
        </svg>
    )
})
ArrowContent.displayName = 'ArrowContent'

// ============================================================================
// Main Annotation Wrapper
// ============================================================================

export const AnnotationWrapper: React.FC<AnnotationWrapperProps> = memo(({
    id,
    data,
    context,
    isSelected,
    isEditing,
    onContentChange,
    onEditComplete,
}) => {
    const { isRendering } = getRemotionEnvironment()
    const position = getComputedPosition(data, context)
    const rotation = data.rotation ?? 0

    // Determine if this annotation type supports rotation handle
    const showRotation = data.type !== AnnotationType.Arrow

    // Determine anchor type - Highlight is top-left, others are center
    const isTopLeftAnchor = data.type === AnnotationType.Highlight

    // For Arrow, position at the bounding box min
    let wrapperPosition = position
    if (data.type === AnnotationType.Arrow) {
        const pos = data.position ?? { x: 50, y: 50 }
        const rawEnd = data.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }
        const startX = percentToPixel(pos.x, context.videoWidth, context.offsetX)
        const startY = percentToPixel(pos.y, context.videoHeight, context.offsetY)
        const endX = percentToPixel(rawEnd.x, context.videoWidth, context.offsetX)
        const endY = percentToPixel(rawEnd.y, context.videoHeight, context.offsetY)
        const padding = Math.max((data.style?.strokeWidth ?? 3), (data.style?.arrowHeadSize ?? 10)) + 4
        wrapperPosition = {
            x: Math.min(startX, endX) - padding,
            y: Math.min(startY, endY) - padding,
        }
    }

    // Position styles based on anchor type
    const positionStyles: React.CSSProperties = isTopLeftAnchor
        ? {
            // Highlight: position is top-left corner
            left: wrapperPosition.x,
            top: wrapperPosition.y,
            transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: 'center center',
        }
        : data.type === AnnotationType.Arrow
            ? {
                // Arrow: position at bounding box min (top-left)
                left: wrapperPosition.x,
                top: wrapperPosition.y,
                transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                transformOrigin: 'center center',
            }
            : {
                // Center anchor (Text, Keyboard)
                left: wrapperPosition.x,
                top: wrapperPosition.y,
                transform: `translate(-50%, -50%)${rotation !== 0 ? ` rotate(${rotation}deg)` : ''}`,
                transformOrigin: 'center center',
            }

    // Render the appropriate content based on type
    const renderContent = () => {
        switch (data.type) {
            case AnnotationType.Text:
                return (
                    <EditableTextContent
                        data={data}
                        context={context}
                        isEditing={isEditing}
                        onContentChange={onContentChange}
                        onEditComplete={onEditComplete}
                    />
                )
            case AnnotationType.Keyboard:
                return <KeyboardContent data={data} context={context} />
            case AnnotationType.Highlight:
                return <HighlightContent data={data} context={context} />
            case AnnotationType.Arrow:
                return <ArrowContent id={id} data={data} context={context} />
            default:
                return (
                    <EditableTextContent
                        data={data}
                        context={context}
                        isEditing={isEditing}
                        onContentChange={onContentChange}
                        onEditComplete={onEditComplete}
                    />
                )
        }
    }

    return (
        <div
            data-annotation-id={id}
            data-annotation-type={data.type}
            style={{
                position: 'absolute',
                ...positionStyles,
                pointerEvents: 'auto',
            }}
        >
            {/* Annotation Content */}
            {renderContent()}

            {/* Selection Box - only in preview mode, when selected */}
            {isSelected && !isRendering && (
                <SelectionBox
                    showHandles={true}
                    showRotation={showRotation}
                    rotation={rotation}
                />
            )}
        </div>
    )
})

AnnotationWrapper.displayName = 'AnnotationWrapper'
