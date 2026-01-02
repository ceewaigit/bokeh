'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'
import type { WebcamEntryAnimation, WebcamExitAnimation, WebcamPipAnimation } from '@/types/project'

interface WebcamAnimationsProps {
    entryAnimation: WebcamEntryAnimation
    onEntryChange: (val: WebcamEntryAnimation) => void
    exitAnimation: WebcamExitAnimation
    onExitChange: (val: WebcamExitAnimation) => void
    pipAnimation: WebcamPipAnimation
    onPipChange: (val: WebcamPipAnimation) => void
}

export function WebcamAnimations({
    entryAnimation, onEntryChange,
    exitAnimation, onExitChange,
    pipAnimation, onPipChange
}: WebcamAnimationsProps) {
    return (
        <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
            <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-[-0.01em]">Animations</span>
                <InfoTooltip content="Choose how the webcam appears, exits, and floats." />
            </div>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Entry</label>
                    <Select
                        value={entryAnimation}
                        onValueChange={onEntryChange}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="fade">Fade</SelectItem>
                            <SelectItem value="scale">Scale</SelectItem>
                            <SelectItem value="slide">Slide</SelectItem>
                            <SelectItem value="bounce">Bounce</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Exit</label>
                    <Select
                        value={exitAnimation}
                        onValueChange={onExitChange}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="fade">Fade</SelectItem>
                            <SelectItem value="scale">Scale</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Inset Motion</label>
                    <InfoTooltip content="Subtle movement for the picture-in-picture window." />
                </div>
                <Select
                    value={pipAnimation}
                    onValueChange={onPipChange}
                >
                    <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="float">Float</SelectItem>
                        <SelectItem value="breathe">Breathe</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
