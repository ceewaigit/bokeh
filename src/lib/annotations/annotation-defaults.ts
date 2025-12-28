import { AnnotationType } from '@/types/project'

export const DEFAULT_ANNOTATION_SIZES: Record<AnnotationType, { width?: number; height?: number }> = {
  [AnnotationType.Text]: { width: 26, height: 10 },
  [AnnotationType.Arrow]: {},
  [AnnotationType.Highlight]: { width: 20, height: 12 },
  [AnnotationType.Keyboard]: { width: 22, height: 9 },
}

export const DEFAULT_KEYBOARD_KEYS = ['Cmd', 'S']

export function getDefaultAnnotationSize(type: AnnotationType): { width?: number; height?: number } {
  return DEFAULT_ANNOTATION_SIZES[type]
}
