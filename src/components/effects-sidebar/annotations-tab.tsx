'use client'

import React, { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useProjectStore } from '@/stores/project-store'
import { EffectStore } from '@/lib/core/effects'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { EffectType, AnnotationType } from '@/types/project'
import type { Effect, AnnotationData } from '@/types/project'
import { Type, ArrowRight, Highlighter, Keyboard, Plus, Trash2 } from 'lucide-react'

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
    type: AnnotationType.Keyboard,
    label: 'Keyboard',
    description: 'Show key combo',
    icon: Keyboard,
  },
] as const

export function AnnotationsTab({ selectedAnnotation, onSelectAnnotation }: AnnotationsTabProps) {
  const project = useProjectStore((s) => s.currentProject)
  const currentTime = useProjectStore((s) => s.currentTime)
  const addEffect = useProjectStore((s) => s.addEffect)
  const updateEffect = useProjectStore((s) => s.updateEffect)
  const removeEffect = useProjectStore((s) => s.removeEffect)

  const [isAdding, setIsAdding] = useState(false)

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

    const effect: Effect = {
      id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: EffectType.Annotation,
      startTime,
      endTime,
      enabled: true,
      data: {
        type,
        position: { x: 50, y: 50 }, // Center of canvas (0-100%)
        content: type === 'text' ? 'New text' : undefined,
        endPosition: type === 'arrow' ? { x: 60, y: 50 } : undefined, // Arrow endpoint
        width: type === 'highlight' ? 20 : undefined, // 20% of canvas
        height: type === 'highlight' ? 10 : undefined, // 10% of canvas
        keys: type === 'keyboard' ? ['Cmd', 'S'] : undefined,
        style: {
          color: '#ffffff',
          fontSize: 18,
          backgroundColor: type === 'highlight' ? 'rgba(255, 255, 0, 0.3)' : undefined,
        },
      } satisfies AnnotationData,
    }

    addEffect(effect)
    onSelectAnnotation?.(effect)
    setIsAdding(false)
  }, [currentTime, addEffect, onSelectAnnotation])

  // Update annotation content
  const handleUpdateContent = useCallback((content: string) => {
    if (!selectedAnnotation) return
    const currentData = selectedAnnotation.data as AnnotationData
    const newData: AnnotationData = { ...currentData, content }
    updateEffect(selectedAnnotation.id, { data: newData } as Partial<Effect>)
  }, [selectedAnnotation, updateEffect])

  // Update annotation position
  const handleUpdatePosition = useCallback((axis: 'x' | 'y', value: number) => {
    if (!selectedAnnotation) return
    const currentData = selectedAnnotation.data as AnnotationData
    const currentPos = currentData.position ?? { x: 50, y: 50 }
    const newData: AnnotationData = {
      ...currentData,
      position: { ...currentPos, [axis]: value },
    }
    updateEffect(selectedAnnotation.id, { data: newData } as Partial<Effect>)
  }, [selectedAnnotation, updateEffect])

  // Delete annotation
  const handleDelete = useCallback(() => {
    if (!selectedAnnotation) return
    removeEffect(selectedAnnotation.id)
    onSelectAnnotation?.(null)
  }, [selectedAnnotation, removeEffect, onSelectAnnotation])

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="rounded-md bg-background/40 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold leading-none tracking-[-0.01em]">
              Annotations
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground leading-snug">
              Add text, arrows, and highlights
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground/70 tabular-nums">
              {annotationEffects.length} annotations
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setIsAdding(!isAdding)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {/* Add annotation type picker */}
      {isAdding && (
        <div className="rounded-md border border-border/50 bg-background/60 p-2.5">
          <div className="text-[11px] font-medium text-muted-foreground mb-2">
            Select type
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ANNOTATION_TYPES.map(({ type, label, description, icon: Icon }) => (
              <button
                key={type}
                onClick={() => handleAddAnnotation(type)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2.5 rounded-md',
                  'border border-border/50 bg-background/40',
                  'hover:bg-background/80 hover:border-border',
                  'transition-colors duration-100'
                )}
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected annotation editor */}
      {selectedAnnotation && selectedData && (
        <div className="space-y-2.5 rounded-md border border-primary/30 bg-background/60 p-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-primary capitalize">
              {selectedData.type ?? 'Unknown'} Annotation
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

          {/* Content editor for text */}
          {selectedData.type === 'text' && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                Text Content
              </label>
              <Input
                value={selectedData.content ?? ''}
                onChange={(e) => handleUpdateContent(e.target.value)}
                placeholder="Enter text..."
                className="h-8 text-xs"
              />
            </div>
          )}

          {/* Position controls */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                X Position
              </label>
              <Slider
                value={[selectedData.position?.x ?? 50]}
                onValueChange={([v]) => handleUpdatePosition('x', v)}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
              <div className="text-[10px] text-muted-foreground/70 text-center tabular-nums">
                {Math.round(selectedData.position?.x ?? 50)}%
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                Y Position
              </label>
              <Slider
                value={[selectedData.position?.y ?? 50]}
                onValueChange={([v]) => handleUpdatePosition('y', v)}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
              <div className="text-[10px] text-muted-foreground/70 text-center tabular-nums">
                {Math.round(selectedData.position?.y ?? 50)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Annotation list */}
      {annotationEffects.length > 0 && !selectedAnnotation && (
        <div className="rounded-md border border-border/50 bg-background/60 p-2.5">
          <div className="text-[11px] font-medium text-muted-foreground mb-2">
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
                    <div className="text-[11px] font-medium truncate capitalize">
                      {data.type ?? 'Unknown'}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 tabular-nums">
                      {(effect.startTime / 1000).toFixed(1)}s - {(effect.endTime / 1000).toFixed(1)}s
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {annotationEffects.length === 0 && !isAdding && (
        <div className="rounded-md border border-dashed border-border/50 bg-background/30 p-4 text-center">
          <div className="text-[11px] text-muted-foreground">
            No annotations yet. Click "Add" to create one.
          </div>
        </div>
      )}
    </div>
  )
}
