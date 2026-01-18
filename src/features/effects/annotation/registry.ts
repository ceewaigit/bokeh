/**
 * Annotation Registry - Single source of truth for annotation type configuration
 *
 * This centralizes all annotation-related defaults, labels, and configuration
 * that were previously scattered across multiple files.
 */

import { AnnotationType, AnnotationStyle } from '@/types/project'

export interface AnnotationTypeConfig {
  label: string
  defaultSize: { width?: number; height?: number }
  defaultStyle: Partial<AnnotationStyle>
  /** Anchor determines how position is interpreted: 'center' = position is center, 'top-left' = position is top-left corner */
  anchor: 'center' | 'top-left'
  defaultContent?: string
}

/**
 * Single source of truth for all annotation type configuration.
 * Use this instead of scattered DEFAULT_* constants and getLabel switch statements.
 */
export const ANNOTATION_REGISTRY: Record<AnnotationType, AnnotationTypeConfig> = {
  [AnnotationType.Text]: {
    label: 'Text',
    defaultSize: { width: 26, height: 10 },
    defaultStyle: {
      color: '#ffffff',
      fontSize: 18,
      textAlign: 'center',
    },
    anchor: 'center',
    defaultContent: 'New text',
  },
  [AnnotationType.Arrow]: {
    label: 'Arrow',
    defaultSize: {},
    defaultStyle: {
      color: '#ffffff',
      strokeWidth: 3,
      arrowHeadSize: 12,
    },
    anchor: 'center',
  },
  [AnnotationType.Highlight]: {
    label: 'Highlight',
    defaultSize: { width: 20, height: 12 },
    defaultStyle: {
      color: '#ffeb3b',
      backgroundColor: 'rgba(255, 255, 0, 0.3)',
      borderRadius: 8,
      opacity: 55,
    },
    anchor: 'top-left',
  },
  [AnnotationType.Blur]: {
    label: 'Blur (legacy)',
    defaultSize: { width: 20, height: 12 },
    defaultStyle: {
      borderRadius: 8,
    },
    anchor: 'top-left',
  },
  [AnnotationType.Redaction]: {
    label: 'Redaction',
    defaultSize: { width: 20, height: 12 },
    defaultStyle: {
      backgroundColor: '#000000',
      borderRadius: 2,
    },
    anchor: 'top-left',
  },
}

/**
 * Get the display label for an annotation type.
 * Replaces: getBlockLabel switch, getAnnotationTypeLabel, getAnnotationLabel
 */
export function getAnnotationLabel(type: AnnotationType | undefined): string {
  if (!type) return 'Note'
  return ANNOTATION_REGISTRY[type]?.label ?? 'Note'
}

/**
 * Get the full config for an annotation type.
 */
export function getAnnotationConfig(type: AnnotationType): AnnotationTypeConfig {
  return ANNOTATION_REGISTRY[type]
}

/**
 * Get default size for an annotation type.
 * Replaces: DEFAULT_ANNOTATION_SIZES, getDefaultAnnotationSize
 */
export function getAnnotationDefaultSize(type: AnnotationType): { width?: number; height?: number } {
  return ANNOTATION_REGISTRY[type]?.defaultSize ?? {}
}

/**
 * Get default style for an annotation type.
 * Replaces: DEFAULT_ANNOTATION_STYLES, getDefaultAnnotationStyle
 */
export function getAnnotationDefaultStyle(type: AnnotationType): Partial<AnnotationStyle> {
  return ANNOTATION_REGISTRY[type]?.defaultStyle ?? {}
}

/**
 * Check if an annotation type uses top-left anchoring.
 * Used for position adjustment when creating annotations centered on click.
 */
export function isTopLeftAnchor(type: AnnotationType): boolean {
  return ANNOTATION_REGISTRY[type]?.anchor === 'top-left'
}
