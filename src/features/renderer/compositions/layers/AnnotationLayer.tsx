/**
 * AnnotationLayer - DOM-based annotation rendering
 *
 * Renders annotations inside the video transform container.
 * Uses AnnotationWrapper which integrates selection overlay directly into each annotation.
 * This eliminates coordinate mismatches since selection is a child of the annotation.
 */

import React, { useMemo, memo, useCallback } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion'
import { useVideoPosition } from '@/features/renderer/context/layout/VideoPositionContext'
import { useTimelineContext } from '@/features/renderer/context/TimelineContext'
import { useProjectStore } from '@/features/stores/project-store'
import { useAnnotationEditContextOptional } from '@/features/editor/context/AnnotationEditContext'
import { EffectType } from '@/types/project'
import { EffectLayerType } from '@/types/effects'
import type { Effect, AnnotationData } from '@/types/project'
import { AnnotationWrapper } from './AnnotationWrapper'
import type { AnnotationRenderContext } from './annotation-elements'

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
  const updateEffect = useProjectStore((s) => s.updateEffect)

  // Get editing context (optional - returns null in export mode or if provider not present)
  const editContext = useAnnotationEditContextOptional()

  const currentTimeMs = useMemo(() => (frame / fps) * 1000, [frame, fps])
  const activeAnnotations = useActiveAnnotations(currentTimeMs)

  // Render inside video transform - offsets are 0 because we're positioned relative to transform container
  // Pass cameraTransform for font sizing and other scale-dependent calculations
  const renderContext: AnnotationRenderContext = useMemo(() => {
    // Extract camera transform properties from zoomTransform if available
    const cameraTransform = videoPosition.zoomTransform
      ? {
          scale: (videoPosition.zoomTransform as any).scale ?? 1,
          panX: (videoPosition.zoomTransform as any).panX ?? 0,
          panY: (videoPosition.zoomTransform as any).panY ?? 0,
        }
      : undefined

    return {
      videoWidth: videoPosition.drawWidth,
      videoHeight: videoPosition.drawHeight,
      offsetX: 0, // Inside transform container - no offset needed
      offsetY: 0,
      cameraTransform,
    }
  }, [videoPosition.drawWidth, videoPosition.drawHeight, videoPosition.zoomTransform])

  // Get the ID of the annotation currently being edited
  // Note: Use selected annotation ID when inline editing, not transientState
  // (transientState is for drag/resize, not text editing)
  const editingAnnotationId = useMemo(() => {
    if (isRendering) return null
    if (!editContext?.isInlineEditing) return null
    // When inline editing, the selected annotation is the one being edited
    if (selectedEffectLayer?.type === EffectLayerType.Annotation) {
      return selectedEffectLayer.id
    }
    return null
  }, [isRendering, editContext?.isInlineEditing, selectedEffectLayer])

  // Handle content changes during editing
  const handleContentChange = useCallback((annotationId: string, content: string) => {
    editContext?.setTransientState(annotationId, { content })
  }, [editContext])

  // Handle edit completion - called when user finishes editing
  const handleEditComplete = useCallback((annotationId: string) => {
    // Get the transient content if any
    const transientContent = editContext?.transientState?.id === annotationId
      ? (editContext.transientState.data as any)?.content
      : undefined

    // Only commit if there's a change
    if (transientContent !== undefined) {
      updateEffect(annotationId, { data: { content: transientContent } })
    }

    // Clear transient state and editing mode
    editContext?.setTransientState(null)
    editContext?.setIsInlineEditing(false)
  }, [updateEffect, editContext])

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
      {activeAnnotations.map((effect) => {
        const isSelected = !isRendering &&
          selectedEffectLayer?.type === EffectLayerType.Annotation &&
          selectedEffectLayer.id === effect.id

        const isEditing = editingAnnotationId === effect.id

        // Get data with transient state merged (for live editing preview)
        const baseData = effect.data as AnnotationData
        const effectData = editContext
          ? editContext.getMergedEffectData(effect.id, baseData as unknown as Record<string, unknown>) as AnnotationData
          : baseData

        return (
          <AnnotationWrapper
            key={effect.id}
            id={effect.id}
            data={effectData}
            context={renderContext}
            isSelected={isSelected}
            isEditing={isEditing}
            onContentChange={(content) => handleContentChange(effect.id, content)}
            onEditComplete={() => handleEditComplete(effect.id)}
          />
        )
      })}
    </AbsoluteFill>
  )
})

AnnotationLayer.displayName = 'AnnotationLayer'
