'use client'

import React from 'react'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'


interface WebcamStyleProps {
    padding: number
    onPaddingChange: (val: number) => void

    borderEnabled: boolean
    onBorderEnabledChange: (val: boolean) => void
    borderWidth: number
    onBorderWidthChange: (val: number) => void
    borderColor: string
    onBorderColorChange: (val: string) => void

    shadowEnabled: boolean
    onShadowEnabledChange: (val: boolean) => void
    shadowBlur: number
    onShadowBlurChange: (val: number) => void

    mirror: boolean
    onMirrorChange: (val: boolean) => void

    opacity: number
    onOpacityChange: (val: number) => void

    reduceOpacityOnZoom: boolean
    onReduceOpacityOnZoomChange: (val: boolean) => void

    cornerRadius: number
    onCornerRadiusChange: (val: number) => void

    showCornerRadius: boolean
}

export function WebcamStyle({
    padding, onPaddingChange,
    borderEnabled, onBorderEnabledChange,
    borderWidth, onBorderWidthChange,
    borderColor, onBorderColorChange,
    shadowEnabled, onShadowEnabledChange,
    shadowBlur, onShadowBlurChange,
    mirror, onMirrorChange,
    opacity, onOpacityChange,
    reduceOpacityOnZoom, onReduceOpacityOnZoomChange,
    cornerRadius, onCornerRadiusChange,
    showCornerRadius
}: WebcamStyleProps) {
    return (
        <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
            {/* Edge Padding */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold tracking-[-0.01em]">Edge Padding</label>
                        <InfoTooltip content="Distance from the edges of the canvas." />
                    </div>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">{padding}px</span>
                </div>
                <Slider
                    value={[padding]}
                    min={0}
                    max={100}
                    step={4}
                    onValueChange={([v]) => onPaddingChange(v)}
                />
            </div>

            {/* Border */}
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold tracking-[-0.01em]">Border</span>
                        <InfoTooltip content="Add an outline around the webcam." />
                    </div>
                    <Switch
                        checked={borderEnabled}
                        onCheckedChange={onBorderEnabledChange}
                    />
                </div>
                {borderEnabled && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <label className="w-12 text-xs font-medium text-muted-foreground">Width</label>
                            <Slider
                                value={[borderWidth]}
                                min={1}
                                max={10}
                                step={1}
                                onValueChange={([v]) => onBorderWidthChange(v)}
                                className="flex-1"
                            />
                            <span className="w-8 text-xs font-mono tabular-nums text-muted-foreground">{borderWidth}px</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="w-12 text-xs font-medium text-muted-foreground">Color</label>
                            <input
                                type="color"
                                value={borderColor}
                                onChange={(e) => onBorderColorChange(e.target.value)}
                                className="h-6 w-12 cursor-pointer rounded-md border border-border/60 bg-background"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Shadow */}
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold tracking-[-0.01em]">Shadow</span>
                        <InfoTooltip content="Soft depth behind the webcam." />
                    </div>
                    <Switch
                        checked={shadowEnabled}
                        onCheckedChange={onShadowEnabledChange}
                    />
                </div>
                {shadowEnabled && (
                    <div className="flex items-center gap-2">
                        <label className="w-12 text-xs font-medium text-muted-foreground">Blur</label>
                        <Slider
                            value={[shadowBlur]}
                            min={0}
                            max={50}
                            step={1}
                            onValueChange={([v]) => onShadowBlurChange(v)}
                            className="flex-1"
                        />
                        <span className="w-8 text-xs font-mono tabular-nums text-muted-foreground">{shadowBlur}px</span>
                    </div>
                )}
            </div>

            {/* Mirror toggle */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold tracking-[-0.01em]">Mirror</span>
                        <InfoTooltip content="Flip the webcam horizontally." />
                    </div>
                    <p className="text-xs text-muted-foreground">Flip webcam horizontally</p>
                </div>
                <Switch
                    checked={mirror}
                    onCheckedChange={onMirrorChange}
                />
            </div>

            {/* Opacity */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold tracking-[-0.01em]">Opacity</label>
                        <InfoTooltip content="Overall transparency of the webcam." />
                    </div>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">{Math.round(opacity * 100)}%</span>
                </div>
                <Slider
                    value={[opacity * 100]}
                    min={10}
                    max={100}
                    step={5}
                    onValueChange={([v]) => onOpacityChange(v / 100)}
                />
            </div>

            {/* Reduce opacity when zoomed in */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold tracking-[-0.01em]">Fade on Zoom</span>
                        <InfoTooltip content="Automatically dim the webcam when zoomed in." />
                    </div>
                    <p className="text-xs text-muted-foreground">Reduce opacity when zoomed in</p>
                </div>
                <Switch
                    checked={reduceOpacityOnZoom}
                    onCheckedChange={onReduceOpacityOnZoomChange}
                />
            </div>

            {/* Corner radius (for non-circle shapes) */}
            {showCornerRadius && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold tracking-[-0.01em]">Corner Radius</label>
                        <span className="text-xs font-mono tabular-nums text-muted-foreground">{cornerRadius}px</span>
                    </div>
                    <Slider
                        value={[cornerRadius]}
                        min={0}
                        max={50}
                        step={2}
                        onValueChange={([v]) => onCornerRadiusChange(v)}
                    />
                </div>
            )}
        </div>
    )
}
