import React from 'react'
import { cn } from '@/shared/utils/utils'
import { OverlayAnchor } from '@/types/overlays'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'

interface OverlayPositionControlProps {
  anchor: OverlayAnchor
  onChange: (anchor: OverlayAnchor) => void
  label?: string
  description?: string
  occupiedAnchors?: Set<OverlayAnchor>
}

const ANCHOR_GRID: OverlayAnchor[] = [
  OverlayAnchor.TopLeft,
  OverlayAnchor.TopCenter,
  OverlayAnchor.TopRight,
  OverlayAnchor.CenterLeft,
  OverlayAnchor.Center,
  OverlayAnchor.CenterRight,
  OverlayAnchor.BottomLeft,
  OverlayAnchor.BottomCenter,
  OverlayAnchor.BottomRight
]

export function OverlayPositionControl({
  anchor,
  onChange,
  label = 'Position',
  description = 'Choose where the overlay appears on the canvas.',
  occupiedAnchors
}: OverlayPositionControlProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-1.5">
        <label className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
          {label}
        </label>
        <InfoTooltip content={description} />
      </div>
      <div className="grid w-fit mx-auto grid-cols-3 gap-1.5 rounded-lg bg-muted/20 p-2">
        {ANCHOR_GRID.map((gridAnchor) => {
          const isSelected = anchor === gridAnchor
          const isOccupied = occupiedAnchors?.has(gridAnchor) && !isSelected

          return (
            <button
              key={gridAnchor}
              onClick={() => onChange(gridAnchor)}
              className={cn(
                "h-6 w-6 rounded-full transition-all duration-100 flex items-center justify-center relative",
                isSelected
                  ? "bg-primary/15 ring-1 ring-primary/40"
                  : "hover:bg-muted/40"
              )}
              title={isOccupied ? `${gridAnchor} (Occupied)` : gridAnchor}
              type="button"
            >
              <div className={cn(
                "rounded-full transition-all duration-100",
                isSelected
                  ? "h-2 w-2 bg-primary"
                  : "h-1 w-1 bg-muted-foreground/40 group-hover:bg-muted-foreground/60"
              )} />
              {isOccupied && (
                <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500/70 ring-1 ring-background" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
