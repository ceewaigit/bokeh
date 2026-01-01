'use client'

import React, { useState, useEffect, useRef } from 'react'
import type { Effect, AnnotationData } from '@/types/project'
import type { VideoRect } from '@/lib/canvas-editor/coordinate-utils'
import { percentToPixels } from '@/lib/canvas-editor/coordinate-utils'
import { useProjectStore } from '@/stores/project-store'
import { AnnotationStyle } from '@/types/project'

interface TextEditorOverlayProps {
    effect: Effect
    videoRect: VideoRect
    scale: number
    onClose: () => void
}

/**
 * TextEditorOverlay - Inline text editing
 * 
 * IMPORTANT: This only appears when camera is at 1x (zoomed out),
 * so we do NOT apply cameraTransform to position or styling.
 */
export const TextEditorOverlay: React.FC<TextEditorOverlayProps> = ({
    effect,
    videoRect,
    scale,
    onClose
}) => {
    const updateEffect = useProjectStore(s => s.updateEffect)
    const data = effect.data as AnnotationData
    // Initialize value from current content, reset when effect changes
    const [value, setValue] = useState(data.content ?? '')
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Reset value when editing a different annotation
    useEffect(() => {
        setValue(data.content ?? '')
    }, [effect.id])

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length)
        }
    }, [])

    const handleBlur = () => {
        commit()
        onClose()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            textareaRef.current?.blur()
        }
        if (e.key === 'Escape') {
            onClose()
        }
        e.stopPropagation()
    }

    const commit = () => {
        updateEffect(effect.id, {
            data: {
                ...effect.data,
                content: value
            } as any
        })
    }

    // --- Position (NO camera transform - editing only at 1x) ---
    const pos = data.position ?? { x: 50, y: 50 }
    const centerPx = percentToPixels(pos.x, pos.y, videoRect)

    // --- Styling (match AnnotationElement at 1x) ---
    const styleData = data.style || {} as AnnotationStyle
    const fontSize = (styleData.fontSize ?? 18) * scale  // Just scale, no camera
    const fontFamily = styleData.fontFamily ?? 'system-ui, -apple-system, sans-serif'
    const fontWeight = styleData.fontWeight ?? 'normal'
    const color = styleData.color ?? '#ffffff'
    const bgColor = styleData.backgroundColor
    const borderRadius = (styleData.borderRadius ?? 4) * scale

    const rawPadding = styleData.padding ?? 12
    const paddingVal = (typeof rawPadding === 'object' ? Math.max(rawPadding.top, rawPadding.right) : rawPadding) * scale
    const appliedPadding = bgColor ? paddingVal : 0

    const widthPx = data.width
        ? (data.width / 100) * videoRect.width
        : undefined

    // Apply rotation from annotation data
    const rotation = data.rotation ?? 0

    return (
        <div className="absolute inset-0 pointer-events-auto z-[60]">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                style={{
                    position: 'absolute',
                    left: centerPx.x,
                    top: centerPx.y,
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                    width: widthPx ? `${widthPx}px` : 'auto',
                    minWidth: '50px',
                    fontSize: `${fontSize}px`,
                    fontFamily,
                    fontWeight: fontWeight as any,
                    color,
                    padding: appliedPadding,
                    borderRadius: bgColor ? borderRadius : 0,
                    backgroundColor: bgColor ?? 'transparent',
                    border: 'none',
                    outline: '2px solid #577CFF',
                    resize: 'none',
                    overflow: 'hidden',
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                    display: 'block',
                    cursor: 'text',
                    boxSizing: 'border-box',
                }}
            />
        </div>
    )
}

