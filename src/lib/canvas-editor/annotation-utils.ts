import { AnnotationData, AnnotationType, AnnotationStyle } from '@/types/project'

const DEFAULT_TEXT_BOX = { width: 160, height: 44 }
const DEFAULT_KEYBOARD_BOX = { width: 180, height: 48 }

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

export function getAnnotationLabel(data: AnnotationData): string {
    if (data.type === AnnotationType.Keyboard) {
        return (data.keys ?? []).join(' + ')
    }
    return data.content ?? ''
}

export function measureAnnotationBox(data: AnnotationData): { width: number; height: number } {
    const label = getAnnotationLabel(data)
    const fontSize = data.style?.fontSize ?? 18
    const fontFamily = data.style?.fontFamily ?? 'system-ui, -apple-system, sans-serif'
    const fontWeight = data.style?.fontWeight ?? 'normal'
    // Add extra padding to match DOM rendering nuances
    const padding = resolvePadding(data.style?.padding) + (data.type === AnnotationType.Keyboard ? 4 : 4)

    const ctx = getTextMeasureContext()
    if (!ctx || !label) {
        return data.type === AnnotationType.Keyboard ? DEFAULT_KEYBOARD_BOX : DEFAULT_TEXT_BOX
    }

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`

    // Handle multi-line text
    const lines = label.split('\n')
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
