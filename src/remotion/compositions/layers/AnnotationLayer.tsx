/**
 * AnnotationLayer - DOM-based annotation rendering
 *
 * Renders annotations inside the video transform container.
 * In preview mode, also renders selection overlay for the selected annotation.
 * The selection overlay inherits all CSS transforms naturally (zoom, pan, etc.).
 */

import React, { useMemo, memo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion'
import { useVideoPosition } from '@/remotion/context/layout/VideoPositionContext'
import { useTimelineContext } from '@/remotion/context/TimelineContext'
import { useProjectStore } from '@/stores/project-store'
import { EffectType } from '@/types/project'
import { EffectLayerType } from '@/types/effects'
import type { Effect, AnnotationData } from '@/types/project'
import { AnnotationElement, type AnnotationRenderContext } from './annotation-elements'
import { SelectionOverlay } from './SelectionOverlay'

/**
 * Filter and prepare annotations for the current frame
 */
function useActiveAnnotations(currentTimeMs: number) {
  const { effects } = useTimelineContext()
  // SSOT Architecture: Export mode has NO transient state
  // Transient editing state is isolated to preview mode via AnnotationEditContext
  // This ensures export render path is completely isolated from annotation editing

  return useMemo(() => {
    return effects
      .filter((effect): effect is Effect & { type: typeof EffectType.Annotation } => {
        if (effect.type !== EffectType.Annotation) return false
        if (effect.enabled === false) return false
        return currentTimeMs >= effect.startTime && currentTimeMs <= effect.endTime
      })
  }, [effects, currentTimeMs])
}

/**
 * AnnotationLayer - Renders all visible annotations for the current frame
 */
export const AnnotationLayer: React.FC = memo(() => {
  const { isRendering } = getRemotionEnvironment()
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const videoPosition = useVideoPosition()

  // Get selection state (only used in preview mode)
  const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer)

  const currentTimeMs = useMemo(() => (frame / fps) * 1000, [frame, fps])
  const activeAnnotations = useActiveAnnotations(currentTimeMs)

  // Render inside video transform - offsets are 0 because we're positioned relative to transform container
  const renderContext: AnnotationRenderContext = useMemo(() => ({
    videoWidth: videoPosition.drawWidth,
    videoHeight: videoPosition.drawHeight,
    offsetX: 0, // Inside transform container - no offset needed
    offsetY: 0,
  }), [videoPosition.drawWidth, videoPosition.drawHeight])

  // Find selected annotation (for selection overlay in preview mode)
  const selectedAnnotation = useMemo(() => {
    if (isRendering) return null // No selection in export mode
    if (!selectedEffectLayer) return null
    if (selectedEffectLayer.type !== EffectLayerType.Annotation) return null
    return activeAnnotations.find(a => a.id === selectedEffectLayer.id) ?? null
  }, [isRendering, selectedEffectLayer, activeAnnotations])

  // Render in BOTH preview and export modes
  // Annotations are inside the video transform container and inherit zoom/pan from CSS

  if (activeAnnotations.length === 0) {
    return null
  }

  return (
    <AbsoluteFill
      data-annotation-layer="true"
      style={{
        pointerEvents: 'none',
        zIndex: 100,
        overflow: 'visible',
      }}
    >
      {activeAnnotations.map((effect) => (
        <AnnotationElement
          key={effect.id}
          id={effect.id}
          data={effect.data as AnnotationData}
          context={renderContext}
        />
      ))}

      {/* Selection overlay - renders inside transform container, inherits all transforms */}
      {selectedAnnotation && !isRendering && (
        <SelectionOverlay
          effect={selectedAnnotation}
          videoWidth={videoPosition.drawWidth}
          videoHeight={videoPosition.drawHeight}
        />
      )}
    </AbsoluteFill>
  )
})

AnnotationLayer.displayName = 'AnnotationLayer'
