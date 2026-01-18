/**
 * AnnotationLayer - DOM-based annotation rendering
 *
 * Renders annotations inside the video transform container.
 * Uses AnnotationWrapper which integrates selection overlay directly into each annotation.
 * This eliminates coordinate mismatches since selection is a child of the annotation.
 */

import React, { useMemo, memo, useCallback, useEffect, useRef } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion'
import { useVideoPosition } from '@/features/rendering/renderer/context/layout/VideoPositionContext'
import { useTimelineContext } from '@/features/rendering/renderer/context/RenderingTimelineContext'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useAnnotationEditContextOptional } from '@/features/ui/editor/context/AnnotationEditContext'
import { EffectType, AnnotationType } from '@/types/project'
import { EffectLayerType } from '@/features/effects/types'
import type { Effect, AnnotationData } from '@/types/project'
import { AnnotationWrapper } from './AnnotationWrapper'
import { clamp01 } from '@/features/rendering/canvas/math/clamp'
import { CommandExecutor, UpdateEffectCommand } from '@/features/core/commands'

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
  const timeline = useTimelineContext()

  const toLocalPoint = useCallback((percent: { x: number; y: number }) => ({
    x: (percent.x / 100) * videoPosition.drawWidth,
    y: (percent.y / 100) * videoPosition.drawHeight,
  }), [videoPosition.drawWidth, videoPosition.drawHeight])

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
  // IMPORTANT: style values like fontSize/padding/borderRadius are authored in "video pixels"
  // (i.e. export space). When preview renders at a reduced composition size, we must scale them
  // down so the annotation looks identical relative to the video frame.
  const styleScale = useMemo(() => {
    const vw = Math.max(1, timeline.videoWidth)
    const vh = Math.max(1, timeline.videoHeight)
    const sx = compositionWidth / vw
    const sy = compositionHeight / vh
    const s = Math.min(sx, sy)
    return Number.isFinite(s) && s > 0 ? s : 1
  }, [compositionWidth, compositionHeight, timeline.videoWidth, timeline.videoHeight])

  const renderContext = useMemo(() => ({
    videoWidth: videoPosition.drawWidth,
    videoHeight: videoPosition.drawHeight,
    offsetX: 0,
    offsetY: 0,
    scale: styleScale,
  }), [videoPosition.drawWidth, videoPosition.drawHeight, styleScale])

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

  // Capture initial content when entering inline edit mode so undo captures the true "before".
  const editStartRef = useRef<{ id: string; content: string } | null>(null)
  useEffect(() => {
    if (!editingAnnotationId) {
      editStartRef.current = null
      return
    }

    if (editStartRef.current?.id === editingAnnotationId) return
    const effect = activeAnnotations.find((e) => e.id === editingAnnotationId)
    const content = (effect?.data as AnnotationData | undefined)?.content ?? ''
    editStartRef.current = { id: editingAnnotationId, content }
  }, [editingAnnotationId, activeAnnotations])

  // Handle content changes during editing
  const handleContentChange = useCallback((annotationId: string, content: string) => {
    editContext?.setTransientState(annotationId, { content })
  }, [editContext])

  // Handle edit completion - called when user finishes editing
  const handleEditComplete = useCallback((annotationId: string, finalContent?: string) => {
    if (finalContent === undefined) {
      editContext?.setTransientState(null)
      editContext?.setIsInlineEditing(false)
      stopInlineEditing()
      editStartRef.current = null
      return
    }

    const beforeContent = editStartRef.current?.id === annotationId
      ? editStartRef.current.content
      : undefined

    // Only commit if there's a change
    if (finalContent !== beforeContent) {
      if (CommandExecutor.isInitialized()) {
        void CommandExecutor.getInstance().execute(UpdateEffectCommand, annotationId, { data: { content: finalContent } })
      } else if (!isRendering) {
        updateEffect(annotationId, { data: { content: finalContent } })
      }
    }

    // Clear transient state and editing mode
    editContext?.setTransientState(null)
    editContext?.setIsInlineEditing(false)
    stopInlineEditing()
    editStartRef.current = null
  }, [updateEffect, editContext, stopInlineEditing, isRendering])

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
            onEditComplete={(finalContent) => handleEditComplete(effect.id, finalContent)}
            fadeOpacity={fadeOpacity}
          />
        )
      })}

      {/* Spotlight-style highlight: dim everything outside the box */}
      {/* RENDERED LAST so it sits ON TOP of other annotations (dimming them too) */}
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

            const mappedPos = toLocalPoint(pos)
            const width = ((data.width ?? 20) / 100) * videoPosition.drawWidth
            const height = ((data.height ?? 10) / 100) * videoPosition.drawHeight
            const x = mappedPos.x
            const y = mappedPos.y

            const rotation = data.rotation ?? 0

            const anim = getHighlightOpacity(currentTimeMs, effect.startTime, effect.endTime, 1000 / fps)
            const dim = clamp01(((data.style as any)?.opacity ?? 55) / 100)
            const dimOpacity = dim * anim

            if (dimOpacity <= 0) return null

            const borderRadius = Math.max(0, Number((data.style as any)?.borderRadius ?? 0) || 0)

            return (
              <div
                key={`spotlight-${effect.id}`}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width,
                  height,
                  borderRadius,
                  // Dim everything outside the highlight box.
                  // box-shadow is compositor-friendly compared to SVG masking under transforms.
                  boxShadow: `0 0 0 9999px rgba(0, 0, 0, ${dimOpacity})`,
                  // Rotation around the box center (match previous SVG rotate(cx, cy)).
                  transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: 'center center',
                }}
              />
            )
          })}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
})

AnnotationLayer.displayName = 'AnnotationLayer'
