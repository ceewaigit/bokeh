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
import { AnnotationType } from '@/types/project'
import type { AnnotationData, AnnotationStyle } from '@/types/project'
import type { AnnotationRenderContext } from './annotation-elements'
import { clamp01 } from '@/features/rendering/canvas/math/clamp'

interface AnnotationWrapperProps {
    id: string
    data: AnnotationData
    context: AnnotationRenderContext
    isSelected: boolean
    isEditing: boolean
    onContentChange?: (content: string) => void
    onEditComplete?: () => void
    fadeOpacity?: number
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
    constrainWidth?: boolean
    onContentChange?: (content: string) => void
    onEditComplete?: () => void
}

const EditableTextContentImpl: React.FC<EditableTextContentProps> = ({
    data,
    context,
    isEditing,
    constrainWidth = false,
    onContentChange,
    onEditComplete,
}) => {
    const contentRef = useRef<HTMLDivElement>(null)
    const wasEditingRef = useRef(false)
    const didCompleteEditRef = useRef(false)
    const style = data.style ?? {}

    const effectiveScale = context.scale ?? 1

    const fontSize = (style.fontSize ?? 18) * effectiveScale
    const fontFamily = style.fontFamily ?? 'system-ui, -apple-system, sans-serif'
    const fontWeight = style.fontWeight ?? 'normal'
    const color = style.color ?? '#ffffff'
    const bgColor = style.backgroundColor
    const padding = resolvePadding(style.padding) * effectiveScale
    const borderRadius = (style.borderRadius ?? 4) * effectiveScale
    const textAlign = style.textAlign ?? 'center'

    // Initialize + focus on edit start.
    // Important: keep contentEditable uncontrolled during editing to preserve selection/caret.
    useEffect(() => {
        const el = contentRef.current
        if (isEditing && el) {
            // Seed the editable DOM once on entry (React will not re-control children while editing).
            if (!wasEditingRef.current) {
                didCompleteEditRef.current = false
                el.textContent = data.content ?? 'Text'
                el.focus()
                // Place cursor at end on entry, but don't fight user selection while editing.
                const range = document.createRange()
                range.selectNodeContents(el)
                range.collapse(false)
                const sel = window.getSelection()
                sel?.removeAllRanges()
                sel?.addRange(range)
            }
        }
        wasEditingRef.current = isEditing
    }, [isEditing, data.content])

    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
        onContentChange?.(e.currentTarget.textContent || '')
    }, [onContentChange])

    // Click outside to finish editing (single-click exit).
    // Without this, users get "stuck" in edit mode and can't re-select/drag.
    useEffect(() => {
        if (!isEditing) return

        const onDocPointerDownCapture = (e: PointerEvent) => {
            const el = contentRef.current
            if (!el) return

            const target = e.target as Node | null
            if (target && el.contains(target)) return

            if (didCompleteEditRef.current) return
            didCompleteEditRef.current = true
            onEditComplete?.()
        }

        document.addEventListener('pointerdown', onDocPointerDownCapture, true)
        return () => document.removeEventListener('pointerdown', onDocPointerDownCapture, true)
    }, [isEditing, onEditComplete])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onEditComplete?.()
        }
        if (e.key === 'Escape') {
            onEditComplete?.()
        }
        // Don't propagate to prevent keyboard shortcuts during editing
        e.stopPropagation()
    }, [onEditComplete])

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isEditing) return
        // Prevent preview click handlers / selection logic from stealing the click.
        e.stopPropagation()
    }, [isEditing])

    return (
        <div
            ref={contentRef}
            data-annotation-content="true"
            contentEditable={isEditing}
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={isEditing ? handleKeyDown : undefined}
            onPointerDown={handlePointerDown}
            onClick={isEditing ? (e) => e.stopPropagation() : undefined}
            style={{
                display: constrainWidth ? 'block' : 'inline-block',
                width: constrainWidth ? '100%' : undefined,
                fontSize,
                fontFamily,
                fontWeight: fontWeight as React.CSSProperties['fontWeight'],
                color,
                backgroundColor: bgColor,
                padding: bgColor ? padding : 0,
                borderRadius: bgColor ? borderRadius : 0,
                textAlign: constrainWidth ? textAlign : undefined,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                cursor: isEditing ? 'text' : 'inherit',
                outline: 'none',
                contain: 'layout style paint',
                userSelect: isEditing ? 'text' : 'none',
                // Avoid stealing pointer events when the editor overlay is active.
                pointerEvents: isEditing ? 'auto' : 'none',
            }}
        >
            {/* Intentionally uncontrolled during editing to preserve selection/caret position. */}
            {!isEditing ? (data.content ?? 'Text') : null}
        </div>
    )
}

const EditableTextContent = memo(
    EditableTextContentImpl,
    (prev, next) => {
        // Keep DOM stable while editing so the caret/selection doesn't get reset by re-renders,
        // but still allow style changes (color, font) to apply.
        if (prev.isEditing && next.isEditing) {
            const prevStyle = prev.data.style ?? {}
            const nextStyle = next.data.style ?? {}
            return (
                (prevStyle.fontSize ?? 18) === (nextStyle.fontSize ?? 18) &&
                (prevStyle.fontFamily ?? 'system-ui, -apple-system, sans-serif') === (nextStyle.fontFamily ?? 'system-ui, -apple-system, sans-serif') &&
                (prevStyle.fontWeight ?? 'normal') === (nextStyle.fontWeight ?? 'normal') &&
                (prevStyle.fontStyle ?? 'normal') === (nextStyle.fontStyle ?? 'normal') &&
                (prevStyle.textDecoration ?? 'none') === (nextStyle.textDecoration ?? 'none') &&
                (prevStyle.color ?? '#ffffff') === (nextStyle.color ?? '#ffffff') &&
                (prevStyle.backgroundColor ?? '') === (nextStyle.backgroundColor ?? '') &&
                (prevStyle.borderRadius ?? 4) === (nextStyle.borderRadius ?? 4) &&
                (prevStyle.textAlign ?? 'center') === (nextStyle.textAlign ?? 'center')
            )
        }

        return (
            prev.isEditing === next.isEditing &&
            prev.constrainWidth === next.constrainWidth &&
            (prev.data.content ?? '') === (next.data.content ?? '') &&
            (prev.data.style?.fontSize ?? 18) === (next.data.style?.fontSize ?? 18) &&
            (prev.data.style?.fontFamily ?? 'system-ui, -apple-system, sans-serif') === (next.data.style?.fontFamily ?? 'system-ui, -apple-system, sans-serif') &&
            (prev.data.style?.fontWeight ?? 'normal') === (next.data.style?.fontWeight ?? 'normal') &&
            (prev.data.style?.color ?? '#ffffff') === (next.data.style?.color ?? '#ffffff') &&
            (prev.data.style?.backgroundColor ?? '') === (next.data.style?.backgroundColor ?? '') &&
            (prev.data.style?.borderRadius ?? 4) === (next.data.style?.borderRadius ?? 4) &&
            (prev.data.style?.textAlign ?? 'center') === (next.data.style?.textAlign ?? 'center') &&
            (prev.context.scale ?? 1) === (next.context.scale ?? 1)
        )
    }
)
EditableTextContent.displayName = 'EditableTextContent'

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
    // Width/height are percentages of video dimensions
    const width = ((data.width ?? 20) / 100) * context.videoWidth
    const height = ((data.height ?? 10) / 100) * context.videoHeight

    return (
        <div
            data-annotation-content="true"
            style={{
                width,
                height,
                contain: 'layout style paint',
            }}
        />
    )
})
HighlightContent.displayName = 'HighlightContent'

// ============================================================================
// Blur Annotation Content - Privacy material (blurred glass)
// ============================================================================

interface BlurContentProps {
    data: AnnotationData
    context: AnnotationRenderContext
}

const BlurContent: React.FC<BlurContentProps> = memo(({
    data,
    context,
}) => {
    // Width/height are percentages of video dimensions
    const width = ((data.width ?? 20) / 100) * context.videoWidth
    const height = ((data.height ?? 12) / 100) * context.videoHeight
    const effectiveScale = context.scale ?? 1
    const style = data.style ?? {}
    const radius = (style.borderRadius ?? 20) * effectiveScale

    const tintPercent = typeof style.opacity === 'number' ? style.opacity : 20
    const tintAlpha = clamp01(tintPercent / 100) * 0.35

    return (
        <div
            data-annotation-content="true"
            style={{
                width,
                height,
                position: 'relative',
                borderRadius: radius,
                overflow: 'hidden',
                contain: 'layout style',
                background: `rgba(255, 255, 255, ${0.10 + tintAlpha})`,
                border: `1px solid rgba(255, 255, 255, ${0.22 + tintAlpha * 0.5})`,
                boxShadow: [
                    '0 8px 32px rgba(31, 38, 135, 0.20)',
                    '0 2px 16px rgba(31, 38, 135, 0.10)',
                    'inset 0 1px 0 rgba(255, 255, 255, 0.40)',
                    'inset 0 -1px 0 rgba(255, 255, 255, 0.20)',
                ].join(', '),
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    backdropFilter: 'blur(14px) saturate(1.6) brightness(1.08)',
                    WebkitBackdropFilter: 'blur(14px) saturate(1.6) brightness(1.08)',
                }}
            />
            <div
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    backgroundImage: [
                        'radial-gradient(rgba(255,255,255,0.10) 1px, rgba(0,0,0,0) 0)',
                        'radial-gradient(rgba(0,0,0,0.10) 1px, rgba(0,0,0,0) 0)',
                    ].join(', '),
                    backgroundSize: '3px 3px, 4px 4px',
                    backgroundPosition: '0 0, 1px 1px',
                    opacity: 0.10,
                    mixBlendMode: 'overlay',
                }}
            />
        </div>
    )
})
BlurContent.displayName = 'BlurContent'

interface RedactionContentProps {
    id: string
    data: AnnotationData
    context: AnnotationRenderContext
}

const RedactionContent: React.FC<RedactionContentProps> = memo(({
    data,
    context,
}) => {
    // Redaction is privacy material (strong blur + obscure)
    // We used to have a flickering grid, but user requested a static blur.

    const width = ((data.width ?? 20) / 100) * context.videoWidth
    const height = ((data.height ?? 12) / 100) * context.videoHeight
    const effectiveScale = context.scale ?? 1
    const style = data.style ?? {}
    const radius = (style.borderRadius ?? 2) * effectiveScale
    const bgColor = style.backgroundColor ?? '#000000'
    const borderColor = style.borderColor
    const borderWidth = (style.borderWidth ?? 0) * effectiveScale

    return (
        <div
            data-annotation-content="true"
            style={{
                width,
                height,
                position: 'relative',
                borderRadius: radius,
                overflow: 'hidden',
                // Solid background to fully obscure text
                background: bgColor,
                border: borderColor && borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                isolation: 'isolate',
                contain: 'layout style paint',
            }}
        />
    )
})
RedactionContent.displayName = 'RedactionContent'

// ============================================================================
// Arrow Annotation Content
// ============================================================================

interface ArrowContentProps {
    id: string
    data: AnnotationData
    context: AnnotationRenderContext
    isSelected: boolean
}

const ArrowContent: React.FC<ArrowContentProps> = memo(({
    id,
    data,
    context,
    isSelected,
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
    const strokeWidth = style.strokeWidth ?? 1
    const arrowHeadSize = style.arrowHeadSize ?? 10

    // Calculate bounds
    const padding = Math.max(strokeWidth, arrowHeadSize) + 4
    const minX = Math.min(startX, endX) - padding
    const minY = Math.min(startY, endY) - padding
    const maxX = Math.max(startX, endX) + padding
    const maxY = Math.max(startY, endY) + padding
    const boxW = maxX - minX
    const boxH = maxY - minY

    // Coordinates relative to SVG viewBox (and now wrapper div)
    const svgStartX = startX - minX
    const svgStartY = startY - minY
    const svgEndX = endX - minX
    const svgEndY = endY - minY

    // Styles matching standard SelectionOverlay
    const SELECTION_HANDLE_SIZE = 8
    const BORDER_COLOR = 'hsl(var(--accent))'
    const HANDLE_SHADOW = '0 1px 3px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)'

    return (
        <div
            data-annotation-content="true"
            style={{
                width: boxW,
                height: boxH,
                position: 'relative',
                // Important: allow pointer events on handles
            }}
        >
            <svg
                style={{
                    width: '100%',
                    height: '100%',
                    overflow: 'visible',
                    pointerEvents: isSelected ? 'auto' : 'none',
                    contain: 'layout style',
                    display: 'block',
                }}
            >
                <defs>
                    <marker
                        id={`arrowhead-${id}`}
                        markerWidth={arrowHeadSize}
                        markerHeight={arrowHeadSize}
                        // Shift tip slightly forward to cover line end (prevent round cap protrusion)
                        refX={arrowHeadSize - 1}
                        refY={arrowHeadSize / 2}
                        markerUnits="userSpaceOnUse"
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
                    strokeLinecap="butt"
                    markerEnd={`url(#arrowhead-${id})`}
                    style={{ pointerEvents: 'visibleStroke', cursor: 'default' }}
                />
            </svg>

            {isSelected && (
                <>
                    {/* Start Handle */}
                    <div
                        data-handle="arrow-start"
                        style={{
                            position: 'absolute',
                            left: svgStartX,
                            top: svgStartY,
                            width: SELECTION_HANDLE_SIZE,
                            height: SELECTION_HANDLE_SIZE,
                            backgroundColor: 'white',
                            border: `1px solid ${BORDER_COLOR}`,
                            borderRadius: '50%',
                            transform: 'translate(-50%, -50%)',
                            cursor: 'grab',
                            pointerEvents: 'auto',
                            boxShadow: HANDLE_SHADOW,
                            boxSizing: 'border-box',
                            zIndex: 10,
                        }}
                    />
                    {/* End Handle */}
                    <div
                        data-handle="arrow-end"
                        style={{
                            position: 'absolute',
                            left: svgEndX,
                            top: svgEndY,
                            width: SELECTION_HANDLE_SIZE,
                            height: SELECTION_HANDLE_SIZE,
                            backgroundColor: 'white',
                            border: `1px solid ${BORDER_COLOR}`,
                            borderRadius: '50%',
                            transform: 'translate(-50%, -50%)',
                            cursor: 'grab',
                            pointerEvents: 'auto',
                            boxShadow: HANDLE_SHADOW,
                            boxSizing: 'border-box',
                            zIndex: 10,
                        }}
                    />
                </>
            )}
        </div>
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
    fadeOpacity = 1,
}) => {
    const position = getComputedPosition(data, context)
    const rotation = data.rotation ?? 0
    const constrainTextWidth =
        data.type === AnnotationType.Text && typeof data.width === 'number'
    const textWidthPx = constrainTextWidth ? (data.width! / 100) * context.videoWidth : undefined

    // Determine anchor type - Highlight, Glass and Redaction are top-left, others are center
    const isTopLeftAnchor = data.type === AnnotationType.Highlight ||
        data.type === AnnotationType.Blur ||
        data.type === AnnotationType.Redaction

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

    // Shadow logic
    const shadowIntensity = data.style?.shadowIntensity ?? 0
    let filterStyle = ''
    if (shadowIntensity > 0) {
        const alpha = Math.min(0.8, shadowIntensity / 100 * 0.8)
        const blur = Math.max(2, shadowIntensity / 100 * 20)
        const dist = Math.max(1, shadowIntensity / 100 * 8)
        filterStyle = `drop-shadow(0px ${dist}px ${blur}px rgba(0,0,0,${alpha}))`
    }

    // Position styles based on anchor type
    const positionStyles: React.CSSProperties = isTopLeftAnchor
        ? {
            // Highlight: position is top-left corner
            left: wrapperPosition.x,
            top: wrapperPosition.y,
            transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: 'center center',
            opacity: fadeOpacity,
            filter: filterStyle || undefined
        }
        : data.type === AnnotationType.Arrow
            ? {
                // Arrow: position at bounding box min (top-left)
                left: wrapperPosition.x,
                top: wrapperPosition.y,
                transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                transformOrigin: 'center center',
                opacity: fadeOpacity,
                filter: filterStyle || undefined
            }
            : {
                // Center anchor (Text, Keyboard)
                left: wrapperPosition.x,
                top: wrapperPosition.y,
                transform: `translate(-50%, -50%)${rotation !== 0 ? ` rotate(${rotation}deg)` : ''}`,
                transformOrigin: 'center center',
                opacity: fadeOpacity,
                filter: filterStyle || undefined
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
                        constrainWidth={constrainTextWidth}
                        onContentChange={onContentChange}
                        onEditComplete={onEditComplete}
                    />
                )
            case AnnotationType.Highlight:
                return <HighlightContent data={data} context={context} />
            case AnnotationType.Blur:
                return <BlurContent data={data} context={context} />
            case AnnotationType.Redaction:
                return <RedactionContent id={id} data={data} context={context} />
            case AnnotationType.Arrow:
                return <ArrowContent id={id} data={data} context={context} isSelected={isSelected} />
            default:
                return (
                    <EditableTextContent
                        data={data}
                        context={context}
                        isEditing={isEditing}
                        constrainWidth={constrainTextWidth}
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
                display: 'inline-block',
                width: constrainTextWidth ? textWidthPx : 'fit-content',
                ...positionStyles,
                pointerEvents: 'auto',
            }}
        >
            {/* Annotation Content */}
            {renderContent()}

        </div>
    )
})

AnnotationWrapper.displayName = 'AnnotationWrapper'
