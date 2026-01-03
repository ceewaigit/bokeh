/**
 * DOM-based annotation rendering components
 *
 * Replaces Canvas 2D rendering with performant DOM elements that support:
 * - GPU-accelerated CSS transforms
 * - Proper hit testing via data attributes
 * - Isolated updates without affecting video
 */

import React, { memo } from 'react'
import { AnnotationType } from '@/types/project'
import type { AnnotationData, AnnotationStyle } from '@/types/project'

// ============================================================================
// Types
// ============================================================================

export interface AnnotationRenderContext {
    /** Video container width in pixels */
    videoWidth: number
    /** Video container height in pixels */
    videoHeight: number
    /** Video offset X from composition edge */
    offsetX: number
    /** Video offset Y from composition edge */
    offsetY: number
    /** Scale factor (rendered / original) */
    scale?: number
    /** Camera transform for zoom/pan in preview mode */
    cameraTransform?: { scale: number; panX: number; panY: number }
}

interface BaseAnnotationProps {
    id: string
    data: AnnotationData
    context: AnnotationRenderContext
    // isSelected/isEditing props removed/ignored as they are handled by InteractionLayer now
}

// ============================================================================
// Utility Functions
// ============================================================================

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
 * Resolve padding from style, handling both number and object formats
 */
function resolvePadding(padding?: AnnotationStyle['padding']): number {
    if (typeof padding === 'number') return padding
    if (!padding || typeof padding !== 'object') return 12
    const p = padding as { top: number; right: number; bottom: number; left: number }
    return Math.max(p.top, p.right, p.bottom, p.left)
}

/**
 * Get computed position for an annotation in pixels.
 * Applies camera transform for proper zoom behavior in preview mode.
 */
function getComputedPosition(
    data: AnnotationData,
    context: AnnotationRenderContext
): { x: number; y: number } {
    const pos = data.position ?? { x: 50, y: 50 }
    const rawPos = {
        x: percentToPixel(pos.x, context.videoWidth, context.offsetX),
        y: percentToPixel(pos.y, context.videoHeight, context.offsetY),
    }

    // Apply camera transform if provided (for preview mode zooming)
    if (context.cameraTransform && context.cameraTransform.scale !== 1) {
        const centerX = context.offsetX + context.videoWidth / 2
        const centerY = context.offsetY + context.videoHeight / 2
        const { scale, panX, panY } = context.cameraTransform

        return {
            x: centerX + (rawPos.x - centerX) * scale + panX,
            y: centerY + (rawPos.y - centerY) * scale + panY
        }
    }

    return rawPos
}

// ============================================================================
// Text Annotation
// ============================================================================

const TextAnnotation = memo<BaseAnnotationProps>(({
    id,
    data,
    context,
}) => {
    const style = data.style ?? {}
    const position = getComputedPosition(data, context)
    const rotation = data.rotation ?? 0

    // Include camera scale in effective scale for proper zoom behavior
    const cameraScale = context.cameraTransform?.scale ?? 1
    const effectiveScale = (context.scale ?? 1) * cameraScale
    const fontSize = (style.fontSize ?? 18) * effectiveScale
    const fontFamily = style.fontFamily ?? 'system-ui, -apple-system, sans-serif'
    const fontWeight = style.fontWeight ?? 'normal'
    const fontStyle = style.fontStyle ?? 'normal'
    const textDecoration = style.textDecoration ?? 'none'
    const textAlign = style.textAlign ?? 'center'
    const color = style.color ?? '#ffffff'
    const bgColor = style.backgroundColor
    const padding = resolvePadding(style.padding) * effectiveScale
    const borderRadius = (style.borderRadius ?? 4) * effectiveScale

    return (
        <div
            data-annotation-id={id}
            data-annotation-type="text"
            style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                fontSize,
                fontFamily,
                fontWeight: fontWeight as React.CSSProperties['fontWeight'],
                fontStyle,
                textDecoration,
                textAlign,
                color,
                backgroundColor: bgColor,
                padding: bgColor ? padding : 0,
                borderRadius: bgColor ? borderRadius : 0,
                whiteSpace: 'pre-wrap',
                cursor: 'inherit',
                outline: 'none',
                contain: 'layout style paint',
                willChange: 'transform',
                userSelect: 'none',
                pointerEvents: 'auto',
            }}
        >
            {data.content ?? 'Text'}
        </div>
    )
})
TextAnnotation.displayName = 'TextAnnotation'

// ============================================================================
// Blur Annotation - Solid opaque mask for privacy
// ============================================================================

const BlurAnnotation = memo<BaseAnnotationProps>(({
    id,
    data,
    context,
}) => {
    const position = getComputedPosition(data, context)
    const rotation = data.rotation ?? 0

    // Width/height are percentages of video dimensions - scales with camera
    const cameraScale = context.cameraTransform?.scale ?? 1
    const width = ((data.width ?? 20) / 100) * context.videoWidth * cameraScale
    const height = ((data.height ?? 12) / 100) * context.videoHeight * cameraScale

    return (
        <div
            data-annotation-id={id}
            data-annotation-type="blur"
            style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                width,
                height,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                borderRadius: 8,
                pointerEvents: 'auto',
                contain: 'layout style paint',
                willChange: 'transform',
                // Solid opaque background for masking sensitive content
                background: '#888888',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}
        />
    )
})
BlurAnnotation.displayName = 'BlurAnnotation'

// ============================================================================
// Highlight Annotation
// ============================================================================

const HighlightAnnotation = memo<BaseAnnotationProps>(({
    id,
    data,
    context,
}) => {
    const style = data.style ?? {}
    const position = getComputedPosition(data, context)
    const rotation = data.rotation ?? 0

    // Width/height are percentages of video dimensions
    const width = ((data.width ?? 20) / 100) * context.videoWidth
    const height = ((data.height ?? 10) / 100) * context.videoHeight

    const bgColor = style.backgroundColor ?? 'rgba(255, 255, 0, 0.3)'
    const borderColor = style.borderColor
    const borderWidth = style.borderWidth ?? 0

    return (
        <div
            data-annotation-id={id}
            data-annotation-type="highlight"
            style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                width,
                height,
                transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                transformOrigin: 'center center',
                backgroundColor: bgColor,
                border: borderColor ? `${borderWidth}px solid ${borderColor}` : 'none',
                borderRadius: style.borderRadius ?? 0,
                pointerEvents: 'auto',
                contain: 'layout style paint',
                willChange: 'transform',
            }}
        />
    )
})
HighlightAnnotation.displayName = 'HighlightAnnotation'

// ============================================================================
// Arrow Annotation
// ============================================================================

const ArrowAnnotation = memo<BaseAnnotationProps>(({
    id,
    data,
    context,
}) => {
    const style = data.style ?? {}
    const rotation = data.rotation ?? 0

    const start = getComputedPosition(data, context)
    const rawEnd = data.endPosition ?? { x: (data.position?.x ?? 50) + 10, y: (data.position?.y ?? 50) + 10 }
    const end = {
        x: percentToPixel(rawEnd.x, context.videoWidth, context.offsetX),
        y: percentToPixel(rawEnd.y, context.videoHeight, context.offsetY),
    }

    const color = style.color ?? '#ff0000'
    const strokeWidth = style.strokeWidth ?? 3
    const arrowHeadSize = style.arrowHeadSize ?? 10

    // Calculate bounding box for the arrow (instead of 100% width/height)
    const padding = Math.max(strokeWidth, arrowHeadSize) + 4
    const minX = Math.min(start.x, end.x) - padding
    const minY = Math.min(start.y, end.y) - padding
    const maxX = Math.max(start.x, end.x) + padding
    const maxY = Math.max(start.y, end.y) + padding
    const boxWidth = maxX - minX
    const boxHeight = maxY - minY

    // Coordinates relative to the bounding box
    const svgStartX = start.x - minX
    const svgStartY = start.y - minY
    const svgEndX = end.x - minX
    const svgEndY = end.y - minY

    // Calculate midpoint for rotation origin (relative to the box)
    const midX = boxWidth / 2
    const midY = boxHeight / 2

    return (
        <svg
            data-annotation-id={id}
            data-annotation-type="arrow"
            style={{
                position: 'absolute',
                left: minX,
                top: minY,
                width: boxWidth,
                height: boxHeight,
                overflow: 'visible',
                pointerEvents: 'none',
                contain: 'layout style',
                transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                transformOrigin: `${midX}px ${midY}px`,
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
ArrowAnnotation.displayName = 'ArrowAnnotation'

// ============================================================================
// Main Annotation Element (Dispatcher)
// ============================================================================

export interface AnnotationElementProps extends BaseAnnotationProps { }

/**
 * Renders a single annotation as a DOM element.
 * Dispatches to the appropriate sub-component based on annotation type.
 */
export const AnnotationElement = memo<AnnotationElementProps>((props) => {
    const { data } = props

    switch (data.type) {
        case AnnotationType.Text:
            return <TextAnnotation {...props} />
        case AnnotationType.Blur:
            return <BlurAnnotation {...props} />
        case AnnotationType.Highlight:
            return <HighlightAnnotation {...props} />
        case AnnotationType.Arrow:
            return <ArrowAnnotation {...props} />
        default:
            // Fallback to text for unknown types
            return <TextAnnotation {...props} />
    }
})
AnnotationElement.displayName = 'AnnotationElement'
