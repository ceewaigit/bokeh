import type { HandlePosition } from '@/features/editor/logic/hit-testing'

export type AnnotationDomHit =
  | {
      kind: 'handle'
      annotationId: string
      annotationElement: HTMLElement
      handle: HandlePosition
      handleElement: HTMLElement
    }
  | { kind: 'annotation'; annotationId: string; annotationElement: HTMLElement }

interface HitTestAnnotationsFromPointOptions {
  /** Element subtree to ignore (typically the editor interaction overlay). */
  ignoreElement?: HTMLElement | null
}

/**
 * DOM-driven annotation hit testing.
 *
 * Uses the DOM as the SSOT for what's under the cursor so CSS transforms and
 * clip-path cropping are respected automatically.
 */
export function hitTestAnnotationsFromPoint(
  clientX: number,
  clientY: number,
  options: HitTestAnnotationsFromPointOptions = {}
): AnnotationDomHit | null {
  if (typeof document === 'undefined') return null

  const elements = document.elementsFromPoint(clientX, clientY)
  const ignore = options.ignoreElement

  for (const element of elements) {
    if (!(element instanceof HTMLElement)) continue
    if (ignore && ignore.contains(element)) continue

    const handleElement = element.closest<HTMLElement>('[data-handle]')
    if (handleElement) {
      if (ignore && ignore.contains(handleElement)) continue

      const handle = handleElement.dataset.handle as HandlePosition | undefined
      const annotationElement = handleElement.closest<HTMLElement>('[data-annotation-id]')
      const annotationId = annotationElement?.dataset.annotationId

      if (handle && annotationId) {
        return {
          kind: 'handle',
          annotationId,
          annotationElement,
          handle,
          handleElement
        }
      }
    }

    const annotationElement = element.closest<HTMLElement>('[data-annotation-id]')
    const annotationId = annotationElement?.dataset.annotationId
    if (annotationId) {
      return { kind: 'annotation', annotationId, annotationElement }
    }
  }

  return null
}
