import { AnnotationType, AnnotationStyle } from '@/types/project'
import { EffectLayerType } from '@/features/effects/types'

export const DEFAULT_ANNOTATION_SIZES: Record<AnnotationType, { width?: number; height?: number }> = {
  [AnnotationType.Text]: { width: 26, height: 10 },
  [AnnotationType.Arrow]: {},
  [AnnotationType.Highlight]: { width: 20, height: 12 },
  [AnnotationType.Blur]: { width: 20, height: 12 },
  [AnnotationType.Redaction]: { width: 20, height: 12 },
}

/** Single source of truth for default annotation styles by type */
export const DEFAULT_ANNOTATION_STYLES: Record<AnnotationType, Partial<AnnotationStyle>> = {
  [AnnotationType.Text]: {
    color: '#ffffff',
    fontSize: 18,
    textAlign: 'center',
  },
  [AnnotationType.Arrow]: {
    color: '#ffffff',
    strokeWidth: 3,
    arrowHeadSize: 12,
  },
  [AnnotationType.Highlight]: {
    color: '#ffeb3b',
    backgroundColor: 'rgba(255, 255, 0, 0.3)',
    borderRadius: 8,
    opacity: 55,
  },
  [AnnotationType.Blur]: {
    borderRadius: 8,
  },
  [AnnotationType.Redaction]: {
    backgroundColor: '#000000',
    borderRadius: 2,
  },
}

export function getDefaultAnnotationStyle(type: AnnotationType): Partial<AnnotationStyle> {
  return DEFAULT_ANNOTATION_STYLES[type] ?? {}
}

// Effect Track Configuration
export const annotationTrackConfig = {
  label: 'Notes',
  order: 4,
  colorKey: 'annotationBlock' as const,
  layerType: EffectLayerType.Annotation,
  getBlockLabel: (effect: any) => {
    const data = effect.data
    switch (data.type) {
      case AnnotationType.Blur:
        return 'Blur (legacy)'
      case AnnotationType.Redaction:
        return 'Redaction'
      case AnnotationType.Highlight:
        return 'Highlight'
      case AnnotationType.Arrow:
        return 'Arrow'
      case AnnotationType.Text:
        return 'Text'
      default:
        return 'Note'
    }
  }
}

export function getDefaultAnnotationSize(type: AnnotationType): { width?: number; height?: number } {
  return DEFAULT_ANNOTATION_SIZES[type]
}
