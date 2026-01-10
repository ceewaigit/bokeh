/**
 * AnnotationLayer - DOM-based annotation rendering
 *
 * Renders annotations inside the video transform container.
 * Uses AnnotationWrapper which integrates selection overlay directly into each annotation.
 * This eliminates coordinate mismatches since selection is a child of the annotation.
 */

import React, { useMemo, memo, useCallback } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion'
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext'
import { useTimelineContext } from '@/features/rendering/renderer/context/TimelineContext'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useAnnotationEditContextOptional } from '@/features/ui/editor/context/AnnotationEditContext'
import { EffectType, AnnotationType } from '@/types/project'
import { EffectLayerType } from '@/features/effects/types'
import type { Effect, AnnotationData } from '@/types/project'
import { AnnotationWrapper } from './AnnotationWrapper'
import { useCoordinateMapping } from '@/features/rendering/renderer/hooks/layout/useCoordinateMapping'
import { clamp01 } from '@/features/rendering/canvas/math/clamp'

const HIGHLIGHT_FADE_MS = 220
const DEFAULT_DIM_OPACITY = 0.55

function getHighlightOpacity(currentTimeMs: number, startTime: number, endTime: number, frameMs: number): number {
  // Add one frame so the first visible frame isn't fully "off" (feels laggy).
  const fadeIn = clamp01((currentTimeMs - startTime + frameMs) / HIGHLIGHT_FADE_MS)
  const fadeOut = clamp01((endTime - currentTimeMs) / HIGHLIGHT_FADE_MS)
  return Math.min(fadeIn, fadeOut)
}

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
  const { fps, width: compositionWidth, height: compositionHeight } = useVideoConfig()
  const videoPosition = useVideoPosition()
  
  // Use the coordinate mapping hook (SSOT)
  // Disable transforms since we are inside the transform container
  const { mapPercentPoint } = useCoordinateMapping()
  const mappingOptions = { applyTransform: false }

  // Get selection state (only used in preview mode)
  const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer)
  const updateEffect = useProjectStore((s) => s.updateEffect)
  const stopInlineEditing = useProjectStore((s) => s.stopInlineEditing)

  // Get editing context (optional - returns null in export mode or if provider not present)
  const editContext = useAnnotationEditContextOptional()
  const isInlineEditing = Boolean(editContext?.isInlineEditing)

  const currentTimeMs = useMemo(() => (frame / fps) * 1000, [frame, fps])
  const activeAnnotations = useActiveAnnotations(currentTimeMs)

  // Render context is legacy - but we still pass it to wrapper for now (wrapper ignores it for positioning)
  // We can eventually remove it once we clean up the wrapper types
  const renderContext = useMemo(() => ({
    videoWidth: videoPosition.drawWidth,
    videoHeight: videoPosition.drawHeight,
    offsetX: 0,
    offsetY: 0,
  }), [videoPosition.drawWidth, videoPosition.drawHeight])

  // Get the ID of the annotation currently being edited
  // Note: Use selected annotation ID when inline editing, not transientState
  // (transientState is for drag/resize, not text editing)
  const editingAnnotationId = useMemo(() => {
    if (isRendering) return null
    if (!isInlineEditing) return null
    // When inline editing, the selected annotation is the one being edited
    if (selectedEffectLayer?.type === EffectLayerType.Annotation) {
      return selectedEffectLayer.id
    }
    return null
  }, [isRendering, isInlineEditing, selectedEffectLayer])

  // Handle content changes during editing
  const handleContentChange = useCallback((annotationId: string, content: string) => {
    editContext?.setTransientState(annotationId, { content })
    // Persist immediately so side panels + timeline reflect edits live.
    // Guard against export renders mutating project state.
    if (!isRendering) {
      updateEffect(annotationId, { data: { content } })
    }
  }, [editContext, isRendering, updateEffect])

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
    stopInlineEditing()
  }, [updateEffect, editContext, stopInlineEditing])

  // Render in BOTH preview and export modes
  // Annotations are inside the video transform container and inherit zoom/pan from CSS

  if (activeAnnotations.length === 0) {
    return null
  }

  const activeHighlightEffects = activeAnnotations.filter((effect) => {
    const data = effect.data as AnnotationData
    return (data.type ?? AnnotationType.Text) === AnnotationType.Highlight
  })

  return (
    <AbsoluteFill
      data-annotation-layer="true"
      style={{
        // When not editing, the editor overlay handles all pointer interactions.
        // During inline editing, allow clicks/selection inside the contentEditable node.
        pointerEvents: isInlineEditing ? 'auto' : 'none',
        zIndex: 100,
        overflow: 'visible',
      }}
    >
      {/* Spotlight-style highlight: dim everything outside the box */}
      {activeHighlightEffects.length > 0 && (
        <AbsoluteFill
          data-highlight-spotlight-layer="true"
          style={{
            pointerEvents: 'none',
          }}
        >
          {activeHighlightEffects.map((effect) => {
            const data = effect.data as AnnotationData
            const pos = data.position ?? { x: 50, y: 50 }
            
            // Use the hook to map coordinates (without transforms)
            const mappedPos = mapPercentPoint(pos, mappingOptions)
            const width = ((data.width ?? 20) / 100) * videoPosition.drawWidth
            const height = ((data.height ?? 10) / 100) * videoPosition.drawHeight
            const x = mappedPos.x
            const y = mappedPos.y
            
            const rotation = data.rotation ?? 0
            const cx = x + width / 2
            const cy = y + height / 2

            const anim = getHighlightOpacity(currentTimeMs, effect.startTime, effect.endTime, 1000 / fps)
            const dim = clamp01((data.style as any)?.opacity ?? DEFAULT_DIM_OPACITY)
            const dimOpacity = dim * anim

            if (dimOpacity <= 0) return null

            const maskId = `highlight-mask-${effect.id}`
            const borderRadius = Math.max(0, Number((data.style as any)?.borderRadius ?? 0) || 0)

            return (
              <svg
                key={`spotlight-${effect.id}`}
                width="100%"
                height="100%"
                viewBox={`0 0 ${compositionWidth} ${compositionHeight}`}
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  inset: 0,
                }}
              >
                <defs>
                  <mask id={maskId}>
                    <rect
                      x={0}
                      y={0}
                      width={compositionWidth}
                      height={compositionHeight}
                      fill="white"
                    />
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      rx={borderRadius}
                      ry={borderRadius}
                      transform={rotation !== 0 ? `rotate(${rotation} ${cx} ${cy})` : undefined}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect
                  x={0}
                  y={0}
                  width={compositionWidth}
                  height={compositionHeight}
                  mask={`url(#${maskId})`}
                  fill={`rgba(0, 0, 0, ${dimOpacity})`}
                />
              </svg>
            )
          })}
        </AbsoluteFill>
      )}

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

        // Calculate fade opacity
        const introFadeMs = effectData.introFadeMs ?? 0
        const outroFadeMs = effectData.outroFadeMs ?? 0

        let fadeOpacity = 1
        if (introFadeMs > 0 || outroFadeMs > 0) {
          const durationFrames = ((effect.endTime - effect.startTime) / 1000) * fps
          const introFrames = (introFadeMs / 1000) * fps
          const outroFrames = (outroFadeMs / 1000) * fps
          const localFrame = frame - (effect.startTime / 1000 * fps)

          if (introFrames > 0 && localFrame < introFrames) {
            fadeOpacity = clamp01(localFrame / introFrames)
            // Smoothstep for smoother fade
            fadeOpacity = fadeOpacity * fadeOpacity * (3 - 2 * fadeOpacity)
          } else if (outroFrames > 0) {
            const outroStart = durationFrames - outroFrames
            if (localFrame > outroStart) {
              fadeOpacity = clamp01(1 - (localFrame - outroStart) / outroFrames)
              fadeOpacity = fadeOpacity * fadeOpacity * (3 - 2 * fadeOpacity)
            }
          }
        }

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
            fadeOpacity={fadeOpacity}
          />
        )
      })}
    </AbsoluteFill>
  )
})

AnnotationLayer.displayName = 'AnnotationLayer'
