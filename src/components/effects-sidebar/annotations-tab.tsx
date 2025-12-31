'use client'

import React, { useCallback } from 'react'
import { cn } from '@/shared/utils/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { useProjectStore } from '@/stores/project-store'
import { EffectStore } from '@/lib/core/effects'
import { DEFAULT_KEYBOARD_KEYS, getDefaultAnnotationSize } from '@/lib/annotations/annotation-defaults'
import { EffectType, AnnotationType } from '@/types/project'
import type { Effect, AnnotationData } from '@/types/project'
import { Type, ArrowRight, Highlighter, Keyboard, Trash2 } from 'lucide-react'

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
        keys: type === AnnotationType.Keyboard ? DEFAULT_KEYBOARD_KEYS : undefined,
        style: {
          color: '#ffffff',
          fontSize: 18,
          backgroundColor: type === AnnotationType.Highlight ? 'rgba(255, 255, 0, 0.3)' : undefined,
        },
      } satisfies AnnotationData,
    }

    addEffect(effect)
    onSelectAnnotation?.(effect)
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

  const handleUpdateSize = useCallback((axis: 'width' | 'height', value: number) => {
    if (!selectedAnnotation) return
    const currentData = selectedAnnotation.data as AnnotationData
    const newData: AnnotationData = {
      ...currentData,
      [axis]: value,
    }
    updateEffect(selectedAnnotation.id, { data: newData } as Partial<Effect>)
  }, [selectedAnnotation, updateEffect])

  const handleUpdateArrowEnd = useCallback((axis: 'x' | 'y', value: number) => {
    if (!selectedAnnotation) return
    const currentData = selectedAnnotation.data as AnnotationData
    const currentEnd = currentData.endPosition ?? { x: 60, y: 50 }
    const newData: AnnotationData = {
      ...currentData,
      endPosition: { ...currentEnd, [axis]: value },
    }
    updateEffect(selectedAnnotation.id, { data: newData } as Partial<Effect>)
  }, [selectedAnnotation, updateEffect])

  const handleUpdateKeys = useCallback((value: string) => {
    if (!selectedAnnotation) return
    const currentData = selectedAnnotation.data as AnnotationData
    const keys = value
      .split(/[,+]/g)
      .map((part) => part.trim())
      .filter(Boolean)
    const newData: AnnotationData = { ...currentData, keys }
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
      <div className="rounded-2xl bg-background/40 p-4 overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-none tracking-[-0.01em]">
              Overlays
            </div>
            <div className="mt-1 text-xs text-muted-foreground leading-snug">
              Add text, arrows, and highlights
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
              {selectedData.type ?? 'Unknown'} Overlay
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
            Drag on canvas to move. Resize handles appear for highlights.
          </div>

          {/* Content editor for text */}
          {selectedData.type === AnnotationType.Text && (
            <div className="space-y-1.5">
              <label className="text-2xs font-medium text-muted-foreground">
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

          {/* Typography Settings */}
          {(selectedData.type === AnnotationType.Text || selectedData.type === AnnotationType.Keyboard) && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              <div className="space-y-1.5">
                <label className="text-2xs font-medium text-muted-foreground">
                  Font Family
                </label>
                <select
                  className="w-full h-8 text-xs bg-background border border-input rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  value={selectedData.style?.fontFamily ?? 'system-ui, -apple-system, sans-serif'}
                  onChange={(e) => {
                    if (!selectedAnnotation) return
                    const currentData = selectedAnnotation.data as AnnotationData
                    const newStyle = { ...currentData.style, fontFamily: e.target.value }
                    updateEffect(selectedAnnotation.id, { data: { ...currentData, style: newStyle } } as Partial<Effect>)
                  }}
                >
                  <option value="system-ui, -apple-system, sans-serif">System UI</option>
                  <option value="Inter, sans-serif">Inter</option>
                  <option value="'Courier New', monospace">Monospace</option>
                  <option value="Georgia, serif">Serif</option>
                  <option value="'Comic Sans MS', cursive">Handwritten</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-2xs font-medium text-muted-foreground">
                  Font Size
                </label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[selectedData.style?.fontSize ?? 18]}
                    onValueChange={([v]) => {
                      if (!selectedAnnotation) return
                      const currentData = selectedAnnotation.data as AnnotationData
                      const newStyle = { ...currentData.style, fontSize: v }
                      updateEffect(selectedAnnotation.id, { data: { ...currentData, style: newStyle } } as Partial<Effect>)
                    }}
                    min={8}
                    max={120}
                    step={1}
                    className="flex-1"
                  />
                  <div className="text-3xs text-muted-foreground/70 tabular-nums w-8 text-right">
                    {Math.round(selectedData.style?.fontSize ?? 18)}px
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Content editor for keyboard */}
          {selectedData.type === AnnotationType.Keyboard && (
            <div className="space-y-1.5">
              <label className="text-2xs font-medium text-muted-foreground">
                Keys
              </label>
              <Input
                value={(selectedData.keys ?? []).join(' + ')}
                onChange={(e) => handleUpdateKeys(e.target.value)}
                placeholder="Cmd + S"
                className="h-8 text-xs"
              />
            </div>
          )}

          {/* Position controls */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-2xs font-medium text-muted-foreground">
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
              <div className="text-3xs text-muted-foreground/70 text-center tabular-nums">
                {Math.round(selectedData.position?.x ?? 50)}%
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-2xs font-medium text-muted-foreground">
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
              <div className="text-3xs text-muted-foreground/70 text-center tabular-nums">
                {Math.round(selectedData.position?.y ?? 50)}%
              </div>
            </div>
          </div>

          {selectedData.type === AnnotationType.Highlight && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-2xs font-medium text-muted-foreground">
                  Width
                </label>
                <Slider
                  value={[selectedData.width ?? 20]}
                  onValueChange={([v]) => handleUpdateSize('width', v)}
                  min={5}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="text-3xs text-muted-foreground/70 text-center tabular-nums">
                  {Math.round(selectedData.width ?? 20)}%
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-2xs font-medium text-muted-foreground">
                  Height
                </label>
                <Slider
                  value={[selectedData.height ?? 10]}
                  onValueChange={([v]) => handleUpdateSize('height', v)}
                  min={5}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="text-3xs text-muted-foreground/70 text-center tabular-nums">
                  {Math.round(selectedData.height ?? 10)}%
                </div>
              </div>
            </div>
          )}

          {selectedData.type === AnnotationType.Arrow && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-2xs font-medium text-muted-foreground">
                  End X
                </label>
                <Slider
                  value={[selectedData.endPosition?.x ?? 60]}
                  onValueChange={([v]) => handleUpdateArrowEnd('x', v)}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="text-3xs text-muted-foreground/70 text-center tabular-nums">
                  {Math.round(selectedData.endPosition?.x ?? 60)}%
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-2xs font-medium text-muted-foreground">
                  End Y
                </label>
                <Slider
                  value={[selectedData.endPosition?.y ?? 50]}
                  onValueChange={([v]) => handleUpdateArrowEnd('y', v)}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="text-3xs text-muted-foreground/70 text-center tabular-nums">
                  {Math.round(selectedData.endPosition?.y ?? 50)}%
                </div>
              </div>
            </div>
          )}
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
                        {data.type ?? 'Unknown'}
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
