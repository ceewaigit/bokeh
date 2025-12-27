'use client'

import React from 'react'
import { Crop, RotateCcw, Move, Maximize } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import type { Clip, Effect, CropEffectData } from '@/types/project'
import { getCropEffectForClip, getCropData } from '@/lib/effects/effect-filters'
import { InfoTooltip } from './info-tooltip'
import { cn } from '@/lib/utils'

interface CropTabProps {
  effects: Effect[] | undefined
  selectedClip: Clip | null
  onAddCrop: () => void
  onRemoveCrop: (effectId: string) => void
  onUpdateCrop: (effectId: string, updates: Partial<CropEffectData>) => void
  onStartEditCrop: () => void
  isEditingCrop?: boolean
}

export function CropTab({
  effects,
  selectedClip,
  onAddCrop,
  onRemoveCrop,
  onUpdateCrop,
  onStartEditCrop,
  isEditingCrop = false,
}: CropTabProps) {
  // Get crop effect for the selected clip
  const cropEffect = selectedClip && effects
    ? getCropEffectForClip(effects, selectedClip)
    : undefined
  const cropData = cropEffect ? getCropData(cropEffect) : null

  // Local state for slider values during dragging
  const [localX, setLocalX] = React.useState<number | null>(null)
  const [localY, setLocalY] = React.useState<number | null>(null)
  const [localWidth, setLocalWidth] = React.useState<number | null>(null)
  const [localHeight, setLocalHeight] = React.useState<number | null>(null)

  // Convert 0-1 to percentage for display
  const toPercent = (value: number) => Math.round(value * 100)
  const fromPercent = (value: number) => value / 100

  if (!selectedClip) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Crop className="w-8 h-8 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">
          Select a clip to crop
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Crop focuses on a specific part of your recording
        </p>
      </div>
    )
  }

  if (!cropEffect || !cropData) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-6 text-center border border-border/40 bg-background/50 rounded-lg">
          <Crop className="w-8 h-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            No crop applied
          </p>
          <p className="text-xs text-muted-foreground/70 mb-4 max-w-[220px]">
            Crop to focus on the most important part of your recording.
          </p>
          <Button
            onClick={onAddCrop}
            className="gap-2"
          >
            <Crop className="w-4 h-4" />
            Add Crop
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-[12px] font-semibold tracking-[-0.02em]">Crop</h3>
          <p className="text-[12px] leading-[1.35] text-muted-foreground/80">
            Refine framing with precise, non-destructive crop.
          </p>
        </div>
        <div
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-mono uppercase tracking-[0.18em] transition-colors duration-150",
            isEditingCrop
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-muted/40 text-muted-foreground border-border/40"
          )}
        >
          {isEditingCrop ? 'Live' : 'Ready'}
        </div>
      </div>

      {/* Edit Crop Button */}
      <Button
        onClick={onStartEditCrop}
        variant={isEditingCrop ? "default" : "outline"}
        className="w-full gap-2"
      >
        <Move className="w-4 h-4" />
        {isEditingCrop ? 'Editing Crop...' : 'Edit Crop Visually'}
      </Button>

      {/* Crop Region Info */}
      <div className="rounded-md border border-border/40 bg-background/60 p-2.5 space-y-3">
        <div className="flex items-center gap-2">
          <Crop className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[12px] font-semibold tracking-[-0.01em]">Crop Region</span>
          <InfoTooltip content="The cropped area expands to fill the canvas. Values represent the visible portion of the original frame." />
        </div>

        {/* Position Controls */}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
          {/* X Position */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">Left (X)</span>
              <span className="text-[12px] font-mono text-muted-foreground tabular-nums">
                {toPercent(localX ?? cropData.x)}%
              </span>
            </div>
            <Slider
              value={[toPercent(localX ?? cropData.x)]}
              onValueChange={([value]) => setLocalX(fromPercent(value))}
              onValueCommit={([value]) => {
                onUpdateCrop(cropEffect.id, { x: fromPercent(value) })
                setTimeout(() => setLocalX(null), 100)
              }}
              min={0}
              max={90}
              step={1}
              className="w-full"
            />
          </div>

          {/* Y Position */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">Top (Y)</span>
              <span className="text-[12px] font-mono text-muted-foreground tabular-nums">
                {toPercent(localY ?? cropData.y)}%
              </span>
            </div>
            <Slider
              value={[toPercent(localY ?? cropData.y)]}
              onValueChange={([value]) => setLocalY(fromPercent(value))}
              onValueCommit={([value]) => {
                onUpdateCrop(cropEffect.id, { y: fromPercent(value) })
                setTimeout(() => setLocalY(null), 100)
              }}
              min={0}
              max={90}
              step={1}
              className="w-full"
            />
          </div>
        </div>

        {/* Size Controls */}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
          {/* Width */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">Width</span>
              <span className="text-[12px] font-mono text-muted-foreground tabular-nums">
                {toPercent(localWidth ?? cropData.width)}%
              </span>
            </div>
            <Slider
              value={[toPercent(localWidth ?? cropData.width)]}
              onValueChange={([value]) => setLocalWidth(fromPercent(value))}
              onValueCommit={([value]) => {
                onUpdateCrop(cropEffect.id, { width: fromPercent(value) })
                setTimeout(() => setLocalWidth(null), 100)
              }}
              min={10}
              max={100}
              step={1}
              className="w-full"
            />
          </div>

          {/* Height */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">Height</span>
              <span className="text-[12px] font-mono text-muted-foreground tabular-nums">
                {toPercent(localHeight ?? cropData.height)}%
              </span>
            </div>
            <Slider
              value={[toPercent(localHeight ?? cropData.height)]}
              onValueChange={([value]) => setLocalHeight(fromPercent(value))}
              onValueCommit={([value]) => {
                onUpdateCrop(cropEffect.id, { height: fromPercent(value) })
                setTimeout(() => setLocalHeight(null), 100)
              }}
              min={10}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => onRemoveCrop(cropEffect.id)}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Crop
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => onUpdateCrop(cropEffect.id, { x: 0, y: 0, width: 1, height: 1 })}
        >
          <Maximize className="w-3.5 h-3.5" />
          Full Frame
        </Button>
      </div>

      {/* Info */}
      <p className="text-[12px] text-muted-foreground/70 text-center">
        The selected region scales to fill the canvas.
      </p>
    </div>
  )
}
