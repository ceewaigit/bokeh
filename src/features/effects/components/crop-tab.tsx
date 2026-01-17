'use client'

import React from 'react'
import { Crop, RotateCcw, Move, Maximize } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import type { CropEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import { getCropEffectForClip, getDataOfType } from '@/features/effects/core/filters'
import { InfoTooltip } from './info-tooltip'
import { cn } from '@/shared/utils/utils'
import { useCropManager } from '@/features/effects/crop/hooks/use-crop-manager'
import { useTimelineEffects } from '@/features/core/stores/selectors'
import { useSelectedClip } from '@/features/core/stores/selectors/clip-selectors'

export function CropTab() {
  const selectedClipResult = useSelectedClip()
  const selectedClip = selectedClipResult?.clip ?? null

  const {
    isEditingCrop,
    handleAddCrop,
    handleRemoveCrop,
    handleUpdateCrop,
    handleStartEditCrop,
  } = useCropManager(selectedClip)

  const effects = useTimelineEffects()

  const cropEffect = selectedClip
    ? getCropEffectForClip(effects, selectedClip)
    : undefined
  const cropData = cropEffect ? getDataOfType<CropEffectData>(cropEffect, EffectType.Crop) : null

  // Local state for slider values during dragging
  const [localX, setLocalX] = React.useState<number | null>(null)
  const [localY, setLocalY] = React.useState<number | null>(null)
  const [localWidth, setLocalWidth] = React.useState<number | null>(null)
  const [localHeight, setLocalHeight] = React.useState<number | null>(null)
  const xResetTimeoutRef = React.useRef<number | null>(null)
  const yResetTimeoutRef = React.useRef<number | null>(null)
  const widthResetTimeoutRef = React.useRef<number | null>(null)
  const heightResetTimeoutRef = React.useRef<number | null>(null)

  const scheduleReset = (
    timeoutRef: React.MutableRefObject<number | null>,
    reset: () => void,
    delayMs: number
  ) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(reset, delayMs)
  }

  React.useEffect(() => {
    return () => {
      const timeouts = [
        xResetTimeoutRef,
        yResetTimeoutRef,
        widthResetTimeoutRef,
        heightResetTimeoutRef
      ]
      for (const ref of timeouts) {
        if (ref.current !== null) {
          window.clearTimeout(ref.current)
          ref.current = null
        }
      }
    }
  }, [])

  const toPercent = (value: number) => Math.round(value * 100)
  const fromPercent = (value: number) => value / 100

  if (!selectedClip) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center mb-3">
          <Crop className="w-5 h-5 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground">Select a clip to crop</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Focus on a specific part of your recording
        </p>
      </div>
    )
  }

  if (!cropEffect || !cropData) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center mb-3">
            <Crop className="w-5 h-5 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">No crop applied</p>
          <p className="text-xs text-muted-foreground/60 mb-4 max-w-[200px]">
            Crop to focus on the important part of your recording
          </p>
          <Button onClick={handleAddCrop} className="gap-2">
            <Crop className="w-4 h-4" />
            Add Crop
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold">Crop</h3>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Non-destructive crop framing
          </p>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors",
            isEditingCrop
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-muted/30 text-muted-foreground border-transparent"
          )}
        >
          {isEditingCrop ? 'Editing' : 'Ready'}
        </div>
      </div>

      {/* Edit Button */}
      <Button
        onClick={handleStartEditCrop}
        variant={isEditingCrop ? "default" : "outline"}
        className="w-full gap-2"
      >
        <Move className="w-4 h-4" />
        {isEditingCrop ? 'Editing Crop...' : 'Edit Visually'}
      </Button>

      {/* Crop Controls */}
      <div className="rounded-xl bg-black/[0.02] dark:bg-white/[0.02] p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Crop className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Region</span>
          <InfoTooltip content="The cropped area fills the canvas. Values are percentage of original frame." />
        </div>

        {/* Position */}
        <div className="grid grid-cols-2 gap-3">
          <div className="group space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">Left</span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                {toPercent(localX ?? cropData.x)}%
              </span>
            </div>
            <Slider
              value={[toPercent(localX ?? cropData.x)]}
              onValueChange={([value]) => setLocalX(fromPercent(value))}
              onValueCommit={([value]) => {
                handleUpdateCrop(cropEffect.id, { x: fromPercent(value) })
                scheduleReset(xResetTimeoutRef, () => setLocalX(null), 100)
              }}
              min={0}
              max={90}
              step={1}
            />
          </div>

          <div className="group space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">Top</span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                {toPercent(localY ?? cropData.y)}%
              </span>
            </div>
            <Slider
              value={[toPercent(localY ?? cropData.y)]}
              onValueChange={([value]) => setLocalY(fromPercent(value))}
              onValueCommit={([value]) => {
                handleUpdateCrop(cropEffect.id, { y: fromPercent(value) })
                scheduleReset(yResetTimeoutRef, () => setLocalY(null), 100)
              }}
              min={0}
              max={90}
              step={1}
            />
          </div>
        </div>

        {/* Size */}
        <div className="grid grid-cols-2 gap-3">
          <div className="group space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">Width</span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                {toPercent(localWidth ?? cropData.width)}%
              </span>
            </div>
            <Slider
              value={[toPercent(localWidth ?? cropData.width)]}
              onValueChange={([value]) => setLocalWidth(fromPercent(value))}
              onValueCommit={([value]) => {
                handleUpdateCrop(cropEffect.id, { width: fromPercent(value) })
                scheduleReset(widthResetTimeoutRef, () => setLocalWidth(null), 100)
              }}
              min={10}
              max={100}
              step={1}
            />
          </div>

          <div className="group space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">Height</span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                {toPercent(localHeight ?? cropData.height)}%
              </span>
            </div>
            <Slider
              value={[toPercent(localHeight ?? cropData.height)]}
              onValueChange={([value]) => setLocalHeight(fromPercent(value))}
              onValueCommit={([value]) => {
                handleUpdateCrop(cropEffect.id, { height: fromPercent(value) })
                scheduleReset(heightResetTimeoutRef, () => setLocalHeight(null), 100)
              }}
              min={10}
              max={100}
              step={1}
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
          onClick={() => handleRemoveCrop(cropEffect.id)}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => handleUpdateCrop(cropEffect.id, { x: 0, y: 0, width: 1, height: 1 })}
        >
          <Maximize className="w-3.5 h-3.5" />
          Full Frame
        </Button>
      </div>
    </div>
  )
}
