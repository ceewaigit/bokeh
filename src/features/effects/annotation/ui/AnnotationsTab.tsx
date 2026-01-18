'use client'

import React, { useCallback } from 'react'
import { cn } from '@/shared/utils/utils'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/features/core/stores/project-store'
import { useEffectsOfType } from '@/features/core/stores/selectors/timeline-selectors'
import { EffectCreation } from '@/features/effects/core/creation'
import { EffectType, AnnotationType } from '@/types/project'
import type { Effect, AnnotationData } from '@/types/project'
import { Type, ArrowRight, Highlighter, EyeOff, Trash2 } from 'lucide-react'
import { AnnotationDragPreview, useAnnotationDragSource } from './AnnotationDragPreview'
import { AddEffectCommand, CommandExecutor, RemoveEffectCommand } from '@/features/core/commands'
import { getAnnotationLabel } from '../registry'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog"

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

// Button component that uses the drag source hook
interface AnnotationTypeButtonProps {
  type: AnnotationType
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  onAdd: (type: AnnotationType) => void
}

function AnnotationTypeButton({ type, label, description, icon: Icon, onAdd }: AnnotationTypeButtonProps) {
  const dragProps = useAnnotationDragSource(type)

  return (
    <button
      {...dragProps}
      onClick={() => onAdd(type)}
      className={cn(
        'group flex flex-col items-start gap-1 rounded-md p-2.5 text-left',
        'border border-border/50 bg-background/40',
        'hover:bg-background/80 hover:border-border',
        'transition-colors duration-100',
        'cursor-grab active:cursor-grabbing'
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
  )
}

export function AnnotationsTab({ selectedAnnotation, onSelectAnnotation }: AnnotationsTabProps) {
  // PERF: Use granular selector - only re-renders when annotation effects change
  // Instead of subscribing to ALL effects and filtering
  const annotationEffects = useEffectsOfType(EffectType.Annotation) as (Effect & { type: typeof EffectType.Annotation })[]
  const addEffect = useProjectStore((s) => s.addEffect)
  const removeEffect = useProjectStore((s) => s.removeEffect)

  // Get annotation data if selected
  const selectedData = selectedAnnotation?.data as AnnotationData | undefined

  // Add new annotation
  // PERF: Get currentTime imperatively when button is clicked, not via subscription
  // This avoids 60fps re-renders during playback (currentTime updates every frame)
  const handleAddAnnotation = useCallback((type: AnnotationType) => {
    const startTime = useProjectStore.getState().currentTime
    const effect = EffectCreation.createAnnotationEffect(type, { startTime })

    if (CommandExecutor.isInitialized()) {
      void CommandExecutor.getInstance().execute(AddEffectCommand, effect)
    } else {
      addEffect(effect)
    }
    onSelectAnnotation?.(effect)
  }, [addEffect, onSelectAnnotation])

  // Delete annotation
  const handleDelete = useCallback(() => {
    if (!selectedAnnotation) return
    if (CommandExecutor.isInitialized()) {
      void CommandExecutor.getInstance().execute(RemoveEffectCommand, selectedAnnotation.id)
    } else {
      removeEffect(selectedAnnotation.id)
    }
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
            <div className="mt-0.5 text-xs text-muted-foreground/70 tabular-nums">
              {annotationEffects.length} overlays
            </div>
          </div>
          {annotationEffects.length > 0 && (
            <div className="flex items-start">
              <Dialog>
                <DialogTrigger asChild>
                  <button className="text-2xs text-muted-foreground/50 hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-destructive/10">
                    Remove All
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Remove all overlays?</DialogTitle>
                    <DialogDescription>
                      This will delete all {annotationEffects.length} annotation layers from your timeline. You can undo this action.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">Cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (!annotationEffects.length) return
                          if (!CommandExecutor.isInitialized()) {
                            annotationEffects.forEach(effect => removeEffect(effect.id))
                            onSelectAnnotation?.(null)
                            return
                          }

                          const executor = CommandExecutor.getInstance()
                          executor.beginGroup('remove-all-annotations')
                          void (async () => {
                            try {
                              for (const effect of annotationEffects) {
                                await executor.execute(RemoveEffectCommand, effect.id)
                              }
                            } finally {
                              await executor.endGroup()
                              onSelectAnnotation?.(null)
                            }
                          })()
                        }}
                      >
                        Remove All
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>

      {/* Add annotation type picker */}
      <div className="rounded-2xl border border-border/50 bg-background/60 p-2.5 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="text-2xs font-medium text-muted-foreground">
            Create overlay
          </div>
          <div className="text-3xs text-muted-foreground/70">
            Click or drag to add
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {ANNOTATION_TYPES.map(({ type, label, description, icon: Icon }) => (
            <AnnotationTypeButton
              key={type}
              type={type}
              label={label}
              description={description}
              icon={Icon}
              onAdd={handleAddAnnotation}
            />
          ))}
        </div>
        <AnnotationDragPreview />
      </div>

      {/* Selected annotation editor */}
      {selectedAnnotation && selectedData && (
        <div className="space-y-2.5 rounded-2xl border border-primary/30 bg-background/60 p-2.5 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="text-2xs font-medium text-primary capitalize">
              {getAnnotationLabel(selectedData.type)} Overlay
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
                        {getAnnotationLabel(data.type)}
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
