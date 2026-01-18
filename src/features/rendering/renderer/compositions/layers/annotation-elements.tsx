import React, { memo } from 'react'
import { AnnotationType } from '@/types/project'
import type { AnnotationData, AnnotationStyle } from '@/types/project'
import { useCoordinateMapping } from '@/features/rendering/renderer/hooks/layout/useCoordinateMapping'
import { RedactionPattern } from '@/features/effects/annotation/types'

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
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Resolve padding from style, handling both number and object formats
 */
function resolvePadding(padding?: AnnotationStyle['padding']): number {
    if (typeof padding === 'number') return padding
    if (!padding || typeof padding !== 'object') return 12
    const p = padding as { top: number; right: number; bottom: number; left: number }
    return Math.max(p.top, p.right, p.bottom, p.left)
}

// ============================================================================
// Text Annotation
// ============================================================================

const TextAnnotation = memo<BaseAnnotationProps>(({
    id,
    data,
    context,
}) => {
    const { mapPercentPoint } = useCoordinateMapping()
    const style = data.style ?? {}
    const position = mapPercentPoint(data.position ?? { x: 50, y: 50 })
    const rotation = data.rotation ?? 0

    // Hook provides transformed pixel coordinates, so we don't need manual cameraScale math
    const effectiveScale = context.scale ?? 1
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
}) => {
    const { mapPercentPoint, videoPosition } = useCoordinateMapping()
    const position = mapPercentPoint(data.position ?? { x: 50, y: 50 })
    const rotation = data.rotation ?? 0

    const width = ((data.width ?? 20) / 100) * videoPosition.drawWidth
    const height = ((data.height ?? 12) / 100) * videoPosition.drawHeight

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
}) => {
    const { mapPercentPoint, videoPosition } = useCoordinateMapping()
    const style = data.style ?? {}
    const position = mapPercentPoint(data.position ?? { x: 50, y: 50 })
    const rotation = data.rotation ?? 0

    const width = ((data.width ?? 20) / 100) * videoPosition.drawWidth
    const height = ((data.height ?? 10) / 100) * videoPosition.drawHeight

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
}) => {
    const { mapPercentPoint } = useCoordinateMapping()
    const style = data.style ?? {}
    const rotation = data.rotation ?? 0

    const pos = data.position ?? { x: 50, y: 50 }
    const rawEnd = data.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }

    // Map to relative pixels for inner SVG math
    const start = mapPercentPoint(pos, { applyTransform: false })
    const end = mapPercentPoint(rawEnd, { applyTransform: false })

    const color = style.color ?? '#ff0000'
    const strokeWidth = style.strokeWidth ?? 3
    const arrowHeadSize = style.arrowHeadSize ?? 10

    const padding = Math.max(strokeWidth, arrowHeadSize) + 4
    const minX = Math.min(start.x, end.x) - padding
    const minY = Math.min(start.y, end.y) - padding
    const maxX = Math.max(start.x, end.x) + padding
    const maxY = Math.max(start.y, end.y) + padding
    const boxWidth = maxX - minX
    const boxHeight = maxY - minY

    const svgStartX = start.x - minX
    const svgStartY = start.y - minY
    const svgEndX = end.x - minX
    const svgEndY = end.y - minY

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
                    refX={0}
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
// Redaction Annotation - Stylized block with multiple pattern options
// ============================================================================

/**
 * Generates inline SVG pattern for different redaction styles.
 * Returns either a background style object or JSX for SVG overlay.
 */
export function getRedactionPatternStyle(
    pattern: RedactionPattern,
    bgColor: string,
    width: number,
    height: number,
    id: string
): { background?: string; svgOverlay?: React.ReactNode } {
    switch (pattern) {
        case RedactionPattern.Noise: {
            // Film grain texture using feTurbulence
            return {
                svgOverlay: (
                    <svg
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                        }}
                    >
                        <defs>
                            <filter id={`noise-${id}`}>
                                <feTurbulence
                                    type="fractalNoise"
                                    baseFrequency="0.9"
                                    numOctaves="4"
                                    seed={42}
                                    result="noise"
                                />
                                <feColorMatrix
                                    type="matrix"
                                    values="0.15 0 0 0 0
                                            0 0.15 0 0 0
                                            0 0 0.15 0 0
                                            0 0 0 0.35 0"
                                />
                            </filter>
                        </defs>
                        <rect
                            width="100%"
                            height="100%"
                            fill={bgColor}
                        />
                        <rect
                            width="100%"
                            height="100%"
                            filter={`url(#noise-${id})`}
                        />
                    </svg>
                ),
            }
        }

        case RedactionPattern.Diagonal: {
            // Diagonal line hatching pattern
            const lineSpacing = 8
            const lineWidth = 2
            return {
                svgOverlay: (
                    <svg
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                        }}
                    >
                        <defs>
                            <pattern
                                id={`diagonal-${id}`}
                                patternUnits="userSpaceOnUse"
                                width={lineSpacing}
                                height={lineSpacing}
                                patternTransform="rotate(45)"
                            >
                                <line
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2={lineSpacing}
                                    stroke="rgba(255,255,255,0.15)"
                                    strokeWidth={lineWidth}
                                />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill={bgColor} />
                        <rect width="100%" height="100%" fill={`url(#diagonal-${id})`} />
                    </svg>
                ),
            }
        }

        case RedactionPattern.Mosaic: {
            // Pixelated/blocky pattern
            const cellSize = 12
            return {
                svgOverlay: (
                    <svg
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                        }}
                    >
                        <defs>
                            <pattern
                                id={`mosaic-${id}`}
                                patternUnits="userSpaceOnUse"
                                width={cellSize * 2}
                                height={cellSize * 2}
                            >
                                <rect x="0" y="0" width={cellSize} height={cellSize} fill={bgColor} />
                                <rect x={cellSize} y="0" width={cellSize} height={cellSize} fill="rgba(255,255,255,0.08)" />
                                <rect x="0" y={cellSize} width={cellSize} height={cellSize} fill="rgba(255,255,255,0.05)" />
                                <rect x={cellSize} y={cellSize} width={cellSize} height={cellSize} fill={bgColor} />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill={bgColor} />
                        <rect width="100%" height="100%" fill={`url(#mosaic-${id})`} />
                    </svg>
                ),
            }
        }

        case RedactionPattern.Marker: {
            // Hand-drawn marker/brush effect with irregular edges
            const wobble = Math.min(width, height) * 0.03
            return {
                svgOverlay: (
                    <svg
                        style={{
                            position: 'absolute',
                            inset: -wobble,
                            width: `calc(100% + ${wobble * 2}px)`,
                            height: `calc(100% + ${wobble * 2}px)`,
                            pointerEvents: 'none',
                        }}
                        viewBox={`0 0 ${width + wobble * 2} ${height + wobble * 2}`}
                        preserveAspectRatio="none"
                    >
                        <defs>
                            <filter id={`marker-rough-${id}`}>
                                <feTurbulence
                                    type="turbulence"
                                    baseFrequency="0.03"
                                    numOctaves="2"
                                    seed={17}
                                    result="turbulence"
                                />
                                <feDisplacementMap
                                    in="SourceGraphic"
                                    in2="turbulence"
                                    scale={wobble * 1.5}
                                    xChannelSelector="R"
                                    yChannelSelector="G"
                                />
                            </filter>
                        </defs>
                        <rect
                            x={wobble}
                            y={wobble}
                            width={width}
                            height={height}
                            fill={bgColor}
                            filter={`url(#marker-rough-${id})`}
                            rx={4}
                            ry={4}
                        />
                    </svg>
                ),
            }
        }

        case RedactionPattern.Solid:
        default:
            // Plain solid fill (current behavior)
            return { background: bgColor }
    }
}

const RedactionAnnotation = memo<BaseAnnotationProps>(({
    id,
    data,
}) => {
    const { mapPercentPoint, videoPosition } = useCoordinateMapping()
    const style = data.style ?? {}
    const position = mapPercentPoint(data.position ?? { x: 50, y: 50 })
    const rotation = data.rotation ?? 0

    const width = ((data.width ?? 20) / 100) * videoPosition.drawWidth
    const height = ((data.height ?? 10) / 100) * videoPosition.drawHeight

    const bgColor = style.backgroundColor ?? '#000000'
    const borderColor = style.borderColor
    const borderWidth = style.borderWidth ?? 0
    const borderRadius = style.borderRadius ?? 0
    const pattern = style.redactionPattern ?? RedactionPattern.Solid

    const patternStyle = getRedactionPatternStyle(pattern, bgColor, width, height, id)

    return (
        <div
            data-annotation-id={id}
            data-annotation-type="redaction"
            style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                width,
                height,
                transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                transformOrigin: 'center center',
                backgroundColor: patternStyle.background,
                border: borderColor && borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
                borderRadius,
                pointerEvents: 'auto',
                contain: 'layout style paint',
                willChange: 'transform',
                overflow: 'hidden',
            }}
        >
            {patternStyle.svgOverlay}
        </div>
    )
})
RedactionAnnotation.displayName = 'RedactionAnnotation'

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
        case AnnotationType.Redaction:
            return <RedactionAnnotation {...props} />
        default:
            return <TextAnnotation {...props} />
    }
})
AnnotationElement.displayName = 'AnnotationElement'
