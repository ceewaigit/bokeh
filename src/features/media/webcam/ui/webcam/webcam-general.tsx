'use client'

import React from 'react'
import { Circle, Square, RectangleHorizontal } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'
import type { WebcamShape, WebcamAnchor } from '../../types'
import { OverlayAnchor } from '@/types/overlays'
import { WEBCAM_POSITION_PRESETS } from '@/features/media/webcam/config'
import { OverlayPositionControl } from '@/features/rendering/overlays/components/overlay-position-control'

interface WebcamGeneralProps {
    shape: WebcamShape
    size: number
    position: WebcamAnchor
    occupiedAnchors?: Set<OverlayAnchor>
    onShapeChange: (shape: WebcamShape) => void
    onSizeChange: (size: number) => void
    onPositionChange: (anchor: WebcamAnchor) => void
    onPositionUpdate: (pos: { x: number; y: number; anchor: WebcamAnchor }) => void
}

const SHAPE_OPTIONS: { id: WebcamShape; label: string; description: string; icon: React.ReactNode }[] = [
    { id: 'circle', label: 'Circle', description: 'Perfect round shape', icon: <Circle className="w-3 h-3" /> },
    { id: 'squircle', label: 'Squircle', description: 'Rounded square shape', icon: <div className="w-3 h-3 rounded-md border-[1.5px] border-current" /> },
    { id: 'rounded-rect', label: 'Rounded', description: 'Horizontal rounded rectangle', icon: <RectangleHorizontal className="w-3 h-3" /> },
    { id: 'rectangle', label: 'Rectangle', description: 'Sharp-cornered rectangle', icon: <Square className="w-3 h-3" /> },
]

export function WebcamGeneral({
    shape,
    size,
    position,
    occupiedAnchors,
    onShapeChange,
    onSizeChange,
    onPositionChange,
    onPositionUpdate
}: WebcamGeneralProps) {

    const handlePositionClick = (anchor: WebcamAnchor) => {
        const preset = WEBCAM_POSITION_PRESETS[anchor]
        onPositionChange(anchor)
        onPositionUpdate(preset)
    }

    return (
        <>
            {/* Shape Presets */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Shape</label>
                    <InfoTooltip content="Choose the webcam frame shape." />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                    {SHAPE_OPTIONS.map((opt) => (
                        <Tooltip key={opt.id} delayDuration={400}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => onShapeChange(opt.id)}
                                    className={cn(
                                        "group flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center transition-all",
                                        shape === opt.id
                                            ? "border-primary/60 bg-primary/10 text-primary shadow-sm"
                                            : "border-border/40 bg-background/40 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                                    )}
                                >
                                    <div className={cn(
                                        "flex h-6 w-6 items-center justify-center rounded-md border",
                                        shape === opt.id ? "border-primary/40 bg-primary/10" : "border-border/40 bg-background/60"
                                    )}>
                                        {opt.icon}
                                    </div>
                                    <div className="text-2xs font-medium leading-none">{opt.label}</div>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {opt.description}
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </div>
            </div>

            {/* Size Slider */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Size</label>
                        <InfoTooltip content="Controls how large the webcam appears." />
                    </div>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">{size}%</span>
                </div>
                <Slider
                    value={[size]}
                    min={5}
                    max={50}
                    step={1}
                    onValueChange={([v]) => onSizeChange(v)}
                />
            </div>

            <OverlayPositionControl
                anchor={position}
                onChange={handlePositionClick}
                occupiedAnchors={occupiedAnchors}
                description="Pick where the webcam sits on the canvas."
            />
        </>
    )
}
