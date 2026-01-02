'use client'

import React, { useEffect, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import type { BackgroundEffectData, Effect } from '@/types/project'
import { InfoTooltip } from './info-tooltip'

interface ShapeTabProps {
  backgroundEffect: Effect | undefined
  onUpdateBackground: (updates: Partial<BackgroundEffectData>) => void
}

export function ShapeTab({ backgroundEffect, onUpdateBackground }: ShapeTabProps) {
  const bgData = backgroundEffect?.data as BackgroundEffectData

  const [padding, setPadding] = useState(bgData?.padding ?? 40)
  const [cornerRadius, setCornerRadius] = useState(bgData?.cornerRadius ?? 15)
  const [shadowIntensity, setShadowIntensity] = useState(bgData?.shadowIntensity ?? 85)

  useEffect(() => setPadding(bgData?.padding ?? 40), [bgData?.padding])
  useEffect(() => setCornerRadius(bgData?.cornerRadius ?? 15), [bgData?.cornerRadius])
  useEffect(() => setShadowIntensity(bgData?.shadowIntensity ?? 85), [bgData?.shadowIntensity])

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground leading-snug">
        Controls padding, corner radius, and shadow.
      </p>

      <div className="rounded-2xl bg-background/40 p-2.5 space-y-3 overflow-hidden">
        {/* Padding slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Padding</label>
              <InfoTooltip content="Adds space around the screen recording." />
            </div>
            <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{padding}px</span>
          </div>
          <Slider
            value={[padding]}
            onValueChange={([value]) => setPadding(value)}
            onValueCommit={([value]) => onUpdateBackground({ padding: value })}
            min={0}
            max={200}
            step={2}
            className="w-full"
          />
        </div>

        {/* Corner Radius slider */}
        <div className="border-t border-border/30 pt-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Corner Radius</label>
              <InfoTooltip content="Makes the corners of the video rounded." />
            </div>
            <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{cornerRadius}px</span>
          </div>
          <Slider
            value={[cornerRadius]}
            onValueChange={([value]) => setCornerRadius(value)}
            onValueCommit={([value]) => onUpdateBackground({ cornerRadius: value })}
            min={0}
            max={48}
            step={1}
            className="w-full"
          />
        </div>

        {/* Shadow Intensity slider */}
        <div className="border-t border-border/30 pt-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Shadow</label>
              <InfoTooltip content="Adjusts the strength of the shadow behind the video." />
            </div>
            <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{shadowIntensity}%</span>
          </div>
          <Slider
            value={[shadowIntensity]}
            onValueChange={([value]) => setShadowIntensity(value)}
            onValueCommit={([value]) => onUpdateBackground({ shadowIntensity: value })}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}
