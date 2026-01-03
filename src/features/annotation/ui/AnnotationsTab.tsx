'use client'

import React, { useCallback } from 'react'
import { cn } from '@/shared/utils/utils'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/features/stores/project-store'
import { EffectStore } from '@/features/effects/core/store'
import { getDefaultAnnotationSize } from '../config'
import { EffectType, AnnotationType } from '@/types/project'
import type { Effect, AnnotationData } from '@/types/project'
import { Type, ArrowRight, Highlighter, EyeOff, Trash2 } from 'lucide-react'

interface AnnotationsTabProps {
  selectedAnnotation?: Effect
  onSelectAnnotation?: (effect: Effect | null) => void
}

const ANNOTATION_TYPES = [
  {
    type: AnnotationType.Text,
    label: 'Text',
    description: 'Add text overlay',
    icon: Type,
  },
  {
    type: AnnotationType.Arrow,
    label: 'Arrow',
    description: 'Point to something',
    icon: ArrowRight,
  },
  {
    type: AnnotationType.Highlight,
    label: 'Highlight',
    description: 'Highlight an area',
    icon: Highlighter,
  },
  {
    type: AnnotationType.Redaction,
    label: 'Redaction',
    description: 'Censor sensitive info',
    icon: EyeOff,
  },
] as const

function getAnnotationTypeLabel(type?: AnnotationType): string {
  if (type === AnnotationType.Blur) return 'Blur (legacy)'
  const meta = ANNOTATION_TYPES.find((t) => t.type === type)
  return meta?.label ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Unknown')
}

export function AnnotationsTab({ selectedAnnotation, onSelectAnnotation }: AnnotationsTabProps) {
  const project = useProjectStore((s) => s.currentProject)
  const currentTime = useProjectStore((s) => s.currentTime)
  const addEffect = useProjectStore((s) => s.addEffect)
  const removeEffect = useProjectStore((s) => s.removeEffect)

  // Get all annotation effects
  const annotationEffects = React.useMemo(() => {
    if (!project) return []
    return EffectStore.getAll(project).filter(
      (e): e is Effect & { type: typeof EffectType.Annotation } =>
        e.type === EffectType.Annotation
    )
  }, [project])

  // Get annotation data if selected
  const selectedData = selectedAnnotation?.data as AnnotationData | undefined

  // Add new annotation
  const handleAddAnnotation = useCallback((type: AnnotationType) => {
    const startTime = currentTime
    const endTime = startTime + 3000 // 3 second default duration
    const defaultSize = getDefaultAnnotationSize(type)

    const effect: Effect = {
      id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: EffectType.Annotation,
      startTime,
      endTime,
      enabled: true,
      data: {
        type,
        position: { x: 50, y: 50 }, // Center of canvas (0-100%)
        content: type === AnnotationType.Text ? 'New text' : undefined,
        endPosition: type === AnnotationType.Arrow ? { x: 60, y: 50 } : undefined, // Arrow endpoint
        width: defaultSize.width,
        height: defaultSize.height,
        style: {
          // Fix: Default Highlight to yellow so it doesn't have a white border clash
          color: type === AnnotationType.Highlight ? '#ffeb3b' : '#ffffff',
          fontSize: 18,
          textAlign: type === AnnotationType.Text ? 'center' : undefined,
          borderRadius: type === AnnotationType.Redaction ? 2 : undefined,
        },
      } satisfies AnnotationData,
    }

    addEffect(effect)
    onSelectAnnotation?.(effect)
  }, [currentTime, addEffect, onSelectAnnotation])

  // Delete annotation
  const handleDelete = useCallback(() => {
    if (!selectedAnnotation) return
    removeEffect(selectedAnnotation.id)
    onSelectAnnotation?.(null)
  }, [selectedAnnotation, removeEffect, onSelectAnnotation])

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="rounded-2xl bg-background/40 p-4 overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-none tracking-[-0.01em]">
              Overlays
            </div>
            <div className="mt-1 text-xs text-muted-foreground leading-snug">
              Add text, arrows, highlights, glass and redactions
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground/70 tabular-nums">
              {annotationEffects.length} overlays
            </div>
          </div>
          <div className="text-3xs text-muted-foreground/70">
            Select a type below to add
          </div>
        </div>
      </div>

      {/* Add annotation type picker */}
      <div className="rounded-2xl border border-border/50 bg-background/60 p-2.5 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="text-2xs font-medium text-muted-foreground">
            Create overlay
          </div>
          <div className="text-3xs text-muted-foreground/70">
            Click a type to place it
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {ANNOTATION_TYPES.map(({ type, label, description, icon: Icon }) => (
            <button
              key={type}
              onClick={() => handleAddAnnotation(type)}
              className={cn(
                'group flex flex-col items-start gap-1 rounded-md p-2.5 text-left',
                'border border-border/50 bg-background/40',
                'hover:bg-background/80 hover:border-border',
                'transition-colors duration-100'
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                <span className="text-2xs font-medium">{label}</span>
              </div>
              <span className="text-3xs text-muted-foreground/80 leading-snug">
                {description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Selected annotation editor */}
      {selectedAnnotation && selectedData && (
        <div className="space-y-2.5 rounded-2xl border border-primary/30 bg-background/60 p-2.5 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="text-2xs font-medium text-primary capitalize">
              {getAnnotationTypeLabel(selectedData.type)} Overlay
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="text-3xs text-muted-foreground/70">
            Drag on canvas to move. Customize in the top dock.
          </div>
        </div>
      )
      }

      {/* Annotation list */}
      {
        annotationEffects.length > 0 && !selectedAnnotation && (
          <div className="rounded-2xl border border-border/50 bg-background/60 p-2.5 overflow-hidden">
            <div className="text-2xs font-medium text-muted-foreground mb-2">
              Timeline Annotations
            </div>
            <div className="space-y-1">
              {annotationEffects.map((effect) => {
                const data = effect.data as AnnotationData
                const typeIcon = ANNOTATION_TYPES.find((t) => t.type === data.type)?.icon
                const Icon = typeIcon ?? Type

                return (
                  <button
                    key={effect.id}
                    onClick={() => onSelectAnnotation?.(effect)}
                    className={cn(
                      'flex items-center gap-2 w-full p-2 rounded-md',
                      'border border-border/30 bg-background/40',
                      'hover:bg-background/80 hover:border-border/50',
                      'transition-colors duration-100 text-left'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-2xs font-medium truncate capitalize">
                        {getAnnotationTypeLabel(data.type)}
                      </div>
                      <div className="text-3xs text-muted-foreground/70 tabular-nums">
                        {(effect.startTime / 1000).toFixed(1)}s - {(effect.endTime / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      }

      {/* Empty state */}
      {
        annotationEffects.length === 0 && !selectedAnnotation && (
          <div className="rounded-2xl border border-dashed border-border/50 bg-background/30 p-4 text-center overflow-hidden">
            <div className="text-2xs text-muted-foreground">
              No overlays yet. Pick a type above to create one.
            </div>
          </div>
        )
      }
    </div >
  )
}
