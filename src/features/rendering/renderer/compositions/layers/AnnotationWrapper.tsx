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
import { type AnnotationRenderContext, getRedactionPatternStyle } from './annotation-elements'
import { RedactionPattern } from '@/features/effects/annotation/types'
import { clamp01 } from '@/features/rendering/canvas/math/clamp'
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext'

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
 * Resolve padding from style
 */
function resolvePadding(padding?: AnnotationStyle['padding']): number {
    if (typeof padding === 'number') return padding
    if (!padding || typeof padding !== 'object') return 12
    const p = padding as { top: number; right: number; bottom: number; left: number }
    return Math.max(p.top, p.right, p.bottom, p.left)
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
    const fontStyle = style.fontStyle ?? 'normal'
    const textDecoration = style.textDecoration ?? 'none'
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
                fontStyle,
                textDecoration,
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

export function areEditableTextContentPropsEqual(prev: EditableTextContentProps, next: EditableTextContentProps) {
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

    const prevStyle = prev.data.style ?? {}
    const nextStyle = next.data.style ?? {}

    return (
        prev.isEditing === next.isEditing &&
        prev.constrainWidth === next.constrainWidth &&
        (prev.data.content ?? '') === (next.data.content ?? '') &&
        (prevStyle.fontSize ?? 18) === (nextStyle.fontSize ?? 18) &&
        (prevStyle.fontFamily ?? 'system-ui, -apple-system, sans-serif') === (nextStyle.fontFamily ?? 'system-ui, -apple-system, sans-serif') &&
        (prevStyle.fontWeight ?? 'normal') === (nextStyle.fontWeight ?? 'normal') &&
        (prevStyle.fontStyle ?? 'normal') === (nextStyle.fontStyle ?? 'normal') &&
        (prevStyle.textDecoration ?? 'none') === (nextStyle.textDecoration ?? 'none') &&
        (prevStyle.color ?? '#ffffff') === (nextStyle.color ?? '#ffffff') &&
        (prevStyle.backgroundColor ?? '') === (nextStyle.backgroundColor ?? '') &&
        (prevStyle.borderRadius ?? 4) === (nextStyle.borderRadius ?? 4) &&
        (prevStyle.textAlign ?? 'center') === (nextStyle.textAlign ?? 'center') &&
        (prev.context.scale ?? 1) === (next.context.scale ?? 1)
    )
}

export const __testables = {
    areEditableTextContentPropsEqual,
}

const EditableTextContent = memo(EditableTextContentImpl, areEditableTextContentPropsEqual)
EditableTextContent.displayName = 'EditableTextContent'

// ============================================================================
// Highlight Annotation Content
// ============================================================================

interface HighlightContentProps {
    data: AnnotationData
    videoWidth: number
    videoHeight: number
}

const HighlightContent: React.FC<HighlightContentProps> = memo(({
    data,
    videoWidth,
    videoHeight
}) => {
    // Width/height are percentages of video dimensions
    const width = ((data.width ?? 20) / 100) * videoWidth
    const height = ((data.height ?? 10) / 100) * videoHeight

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
    videoWidth: number
    videoHeight: number
    scale?: number
}

const BlurContent: React.FC<BlurContentProps> = memo(({
    data,
    videoWidth,
    videoHeight,
    scale = 1
}) => {
    // Width/height are percentages of video dimensions
    const width = ((data.width ?? 20) / 100) * videoWidth
    const height = ((data.height ?? 12) / 100) * videoHeight
    const style = data.style ?? {}
    const radius = (style.borderRadius ?? 20) * scale

    // Opacity is 0-1 (renderer SSOT)
    const tintAlpha = clamp01(style.opacity ?? 0.2) * 0.35

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
    videoWidth: number
    videoHeight: number
    scale?: number
}

const RedactionContent: React.FC<RedactionContentProps> = memo(({
    id,
    data,
    videoWidth,
    videoHeight,
    scale = 1
}) => {
    const width = ((data.width ?? 20) / 100) * videoWidth
    const height = ((data.height ?? 12) / 100) * videoHeight
    const style = data.style ?? {}
    const radius = (style.borderRadius ?? 2) * scale
    const bgColor = style.backgroundColor ?? '#000000'
    const borderColor = style.borderColor
    const borderWidth = (style.borderWidth ?? 0) * scale

    const pattern = style.redactionPattern ?? RedactionPattern.Solid
    const patternStyle = getRedactionPatternStyle(pattern, bgColor, width, height, id)

    return (
        <div
            data-annotation-content="true"
            style={{
                width,
                height,
                position: 'relative',
                borderRadius: radius,
                overflow: 'hidden',
                background: patternStyle.background,
                border: borderColor && borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                isolation: 'isolate',
                contain: 'layout style paint',
            }}
        >
            {patternStyle.svgOverlay}
        </div>
    )
})
RedactionContent.displayName = 'RedactionContent'

// ============================================================================
// Arrow Annotation Content
// ============================================================================

interface ArrowContentProps {
    id: string
    data: AnnotationData
    isSelected: boolean
    mapPercentPoint: (p: { x: number; y: number }) => { x: number; y: number }
}

const ArrowContent: React.FC<ArrowContentProps> = memo(({
    id,
    data,
    isSelected,
    mapPercentPoint,
}) => {
    const style = data.style ?? {}
    const pos = data.position ?? { x: 50, y: 50 }
    const rawEnd = data.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }

    // Map coordinates to pixels in LOCAL video space.
    const start = mapPercentPoint(pos)
    const end = mapPercentPoint(rawEnd)

    const color = style.color ?? '#ff0000'
    const strokeWidth = style.strokeWidth ?? 1
    const arrowHeadSize = style.arrowHeadSize ?? 10

    // Calculate bounds
    const padding = Math.max(strokeWidth, arrowHeadSize) + 4
    const minX = Math.min(start.x, end.x) - padding
    const minY = Math.min(start.y, end.y) - padding
    const maxX = Math.max(start.x, end.x) + padding
    const maxY = Math.max(start.y, end.y) + padding
    const boxW = maxX - minX
    const boxH = maxY - minY

    // Coordinates relative to SVG viewBox (and now wrapper div)
    const svgStartX = start.x - minX
    const svgStartY = start.y - minY
    const svgEndX = end.x - minX
    const svgEndY = end.y - minY

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
    // PERF: This layer is rendered inside a video-bounds container with the same CSS transform as the video,
    // so we want LOCAL coordinates (0..drawWidth/height), not composition coordinates.
    const videoPosition = useVideoPosition()
    
    const pos = data.position ?? { x: 50, y: 50 }
    const rotation = data.rotation ?? 0
    const constrainTextWidth = data.type === AnnotationType.Text && typeof data.width === 'number'
    const textWidthPx = constrainTextWidth ? (data.width! / 100) * videoPosition.drawWidth : undefined

    const toLocalPoint = (percent: { x: number; y: number }) => ({
        x: (percent.x / 100) * videoPosition.drawWidth,
        y: (percent.y / 100) * videoPosition.drawHeight
    })

    // Determine anchor type
    const isTopLeftAnchor = data.type === AnnotationType.Highlight ||
        data.type === AnnotationType.Blur ||
        data.type === AnnotationType.Redaction

    // For Arrow, position at the bounding box min
    let wrapperPosition: { x: number; y: number }
    if (data.type === AnnotationType.Arrow) {
        const rawEnd = data.endPosition ?? { x: pos.x + 10, y: pos.y + 10 }
        const start = toLocalPoint(pos)
        const end = toLocalPoint(rawEnd)
        
        const padding = Math.max((data.style?.strokeWidth ?? 3), (data.style?.arrowHeadSize ?? 10)) + 4
        wrapperPosition = {
            x: Math.min(start.x, end.x) - padding,
            y: Math.min(start.y, end.y) - padding,
        }
    } else {
        wrapperPosition = toLocalPoint(pos)
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

    // Position styles
    const positionStyles: React.CSSProperties = (isTopLeftAnchor || data.type === AnnotationType.Arrow)
        ? {
            left: wrapperPosition.x,
            top: wrapperPosition.y,
            transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: 'center center',
            opacity: fadeOpacity,
            filter: filterStyle || undefined
        }
        : {
            left: wrapperPosition.x,
            top: wrapperPosition.y,
            transform: `translate(-50%, -50%)${rotation !== 0 ? ` rotate(${rotation}deg)` : ''}`,
            transformOrigin: 'center center',
            opacity: fadeOpacity,
            filter: filterStyle || undefined
        }

    // Render dispatcher
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
                return <HighlightContent data={data} videoWidth={videoPosition.drawWidth} videoHeight={videoPosition.drawHeight} />
            case AnnotationType.Blur:
                return <BlurContent data={data} videoWidth={videoPosition.drawWidth} videoHeight={videoPosition.drawHeight} scale={context.scale} />
            case AnnotationType.Redaction:
                return <RedactionContent id={id} data={data} videoWidth={videoPosition.drawWidth} videoHeight={videoPosition.drawHeight} scale={context.scale} />
            case AnnotationType.Arrow:
                return (
                    <ArrowContent
                        id={id}
                        data={data}
                        isSelected={isSelected}
                        mapPercentPoint={toLocalPoint}
                    />
                )
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
            {renderContent()}
        </div>
    )
})

AnnotationWrapper.displayName = 'AnnotationWrapper'
