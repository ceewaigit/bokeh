import { AnnotationType } from '@/types/project'
import { EffectLayerType } from '@/types/effects'

export const DEFAULT_ANNOTATION_SIZES: Record<AnnotationType, { width?: number; height?: number }> = {
  [AnnotationType.Text]: { width: 26, height: 10 },
  [AnnotationType.Arrow]: {},
  [AnnotationType.Highlight]: { width: 20, height: 12 },
  [AnnotationType.Keyboard]: { width: 22, height: 9 },
}

export const DEFAULT_KEYBOARD_KEYS = ['Cmd', 'S']

// Effect Track Configuration
export const annotationTrackConfig = {
  label: 'Notes',
  order: 4,
  colorKey: 'annotationBlock' as const,
  layerType: EffectLayerType.Annotation,
  getBlockLabel: (effect: any) => {
    const data = effect.data
    return data.type
      ? data.type.charAt(0).toUpperCase() + data.type.slice(1)
      : 'Note'
  }
}

export function getDefaultAnnotationSize(type: AnnotationType): { width?: number; height?: number } {
  return DEFAULT_ANNOTATION_SIZES[type]
}
