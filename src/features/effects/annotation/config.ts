/**
 * Annotation Track Configuration
 *
 * For annotation type defaults (sizes, styles, labels), use the unified registry:
 * @see ./registry.ts
 */

import { EffectLayerType } from '@/features/effects/types'
import { getAnnotationLabel } from './registry'

// Effect Track Configuration
export const annotationTrackConfig = {
  label: 'Notes',
  order: 4,
  colorKey: 'annotationBlock' as const,
  layerType: EffectLayerType.Annotation,
  getBlockLabel: (effect: any) => {
    const data = effect.data
    return getAnnotationLabel(data.type)
  }
}
