import { AnnotationData, AnnotationType, AnnotationStyle } from '@/types/project'

// These are pixel-based dimensions for measurement, not % based like the registry
const DEFAULT_TEXT_BOX_PX = { width: 160, height: 44 }
const DEFAULT_BLUR_BOX_PX = { width: 200, height: 120 }

let textMeasureCtx: CanvasRenderingContext2D | null = null

function getTextMeasureContext(): CanvasRenderingContext2D | null {
    if (textMeasureCtx) return textMeasureCtx
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    textMeasureCtx = canvas.getContext('2d')
    return textMeasureCtx
}

export function resolvePadding(padding?: AnnotationStyle['padding']): number {
    if (typeof padding === 'number') return padding
    if (!padding || typeof padding !== 'object') return 12
    const { top, right, bottom, left } = padding as { top: number; right: number; bottom: number; left: number }
    return (top + right + bottom + left) / 4
}

/**
 * Get the text content of an annotation (not the type label).
 * For type labels, use getAnnotationLabel from the annotation registry.
 */
export function getAnnotationTextContent(data: AnnotationData): string {
    if (data.type === AnnotationType.Blur || data.type === AnnotationType.Redaction) {
        return '' // Glass/Redaction have no text content
    }
    return data.content ?? ''
}

export function measureAnnotationBox(data: AnnotationData): { width: number; height: number } {
    const content = getAnnotationTextContent(data)
    const fontSize = data.style?.fontSize ?? 18
    const fontFamily = data.style?.fontFamily ?? 'system-ui, -apple-system, sans-serif'
    const fontWeight = data.style?.fontWeight ?? 'normal'
    // Add extra padding to match DOM rendering nuances
    const padding = resolvePadding(data.style?.padding) + 4

    // Blur uses fixed dimensions based on width/height properties
    if (data.type === AnnotationType.Blur || data.type === AnnotationType.Redaction) {
        return DEFAULT_BLUR_BOX_PX
    }

    const ctx = getTextMeasureContext()
    if (!ctx || !content) {
        return DEFAULT_TEXT_BOX_PX
    }

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`

    // Handle multi-line text
    const lines = content.split('\n')
    let maxWidth = 0

    lines.forEach(line => {
        const metrics = ctx.measureText(line)
        maxWidth = Math.max(maxWidth, metrics.width)
    })

    const lineHeight = fontSize * 1.2 // Approximate line-height for DOM
    const totalHeight = Math.max(lineHeight, lines.length * lineHeight)

    const width = Math.max(40, maxWidth + padding * 2)
    const height = Math.max(24, totalHeight + padding * 2)

    return { width, height }
}
