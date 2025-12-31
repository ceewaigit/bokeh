'use client'

import React from 'react'
import { Circle, Square, RectangleHorizontal } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InfoTooltip } from '@/components/effects-sidebar/info-tooltip'
import type { WebcamShape, WebcamAnchor } from '@/types/project'
import { WEBCAM_POSITION_PRESETS } from '@/lib/constants/default-effects'

interface WebcamGeneralProps {
    shape: WebcamShape
    size: number
    position: WebcamAnchor
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

const POSITION_GRID: WebcamAnchor[] = [
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right'
]

export function WebcamGeneral({
    shape,
    size,
    position,
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

            {/* Position Grid */}
            <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground text-center block">Position</label>
                    <InfoTooltip content="Pick where the webcam sits on the canvas." />
                </div>
                <div className="grid w-fit mx-auto grid-cols-3 gap-2 rounded-lg border border-border/50 bg-background/40 p-2">
                    {POSITION_GRID.map((anchor) => (
                        <button
                            key={anchor}
                            onClick={() => handlePositionClick(anchor)}
                            className={cn(
                                "h-8 w-8 rounded-full transition-all duration-150",
                                position === anchor // Note: Changed from position.anchor to position since caller passes anchor string here, wait need to verify what is passed
                                    ? "bg-primary/20 border-2 border-primary/50"
                                    : "bg-muted/30 hover:bg-muted/50 hover:border hover:border-border/60"
                            )}
                            title={anchor}
                        />
                    ))}
                </div>
                <p className="text-xs text-muted-foreground/70 text-center">Position the picture-in-picture on the canvas.</p>
            </div>
        </>
    )
}
